import { setGroupRoute } from '../ai/movement';
import type { Vec2 } from '../terrain';
import type { Unit } from '../units';
import type { World } from '../world';
import type { ControlPoint } from './conquest';
import type { Slot } from './roster';
import type { BattleSide } from './schema';

export const RALLY_MAX = 20;
export const STAGING = 350;
export const STAGED_RADIUS = 60;
export const STAGING_WAIT = 20;
export const STRAGGLER = 1000;
export const SUPPORT = 250;
export const RETREAT_BELOW = 0.35;
export const REGROUP_AT = 0.7;
export const REGROUP_WAIT = 20;
export const SQUADS_PER_PLATOON = 2;

export type OrderKind = 'attack' | 'defend' | 'reserve';
export interface Order { kind: OrderKind; point: string | null; since: number; utility: number }
export type PlatoonState = 'rally' | 'move' | 'assault' | 'hold' | 'retreat';

export class Platoon {
  state: PlatoonState = 'rally';
  order: Order | null = null;
  stateSince = 0;
  private stagedAt: number | null = null;
  private stage: Vec2 | null = null;
  private fallback: Vec2 | null = null;
  private safeAt: number | null = null;
  private routed = new Map<number, string>();

  constructor(readonly id: string, readonly side: BattleSide, readonly slots: Slot[], readonly home: Vec2) {}

  members(world: World): Unit[] {
    const out: Unit[] = [];
    for (const s of this.slots) {
      const u = s.unit === null ? undefined : world.unit(s.unit);
      if (u && u.alive) out.push(u);
    }
    return out;
  }

  strength(world: World) {
    let hp = 0, max = 0;
    for (const s of this.slots) {
      const u = s.unit === null ? undefined : world.unit(s.unit);
      max += u?.def.hp ?? 1;
      if (u && u.alive) hp += u.hp;
    }
    return max ? hp / max : 0;
  }

  center(world: World): Vec2 {
    const m = this.members(world);
    if (!m.length) return this.home;
    return [m.reduce((s, u) => s + u.pos.x, 0) / m.length, m.reduce((s, u) => s + u.pos.z, 0) / m.length];
  }

  give(order: Omit<Order, 'since'>, time: number) {
    this.order = { ...order, since: time };
    this.routed.clear();
    this.stagedAt = null;
    this.stage = null;
    if (this.state !== 'rally' && this.state !== 'retreat') this.enter(order.kind === 'reserve' ? 'hold' : order.kind === 'defend' ? 'assault' : 'move', time);
  }

  private enter(state: PlatoonState, time: number) {
    this.state = state;
    this.stateSince = time;
    this.routed.clear();
  }

  step(world: World, points: readonly ControlPoint[], time: number) {
    const members = this.members(world);
    const push = this.state === 'assault' || this.state === 'hold' || this.state === 'retreat';
    for (const u of members) if (u.battle) u.battle.advance = push;
    const strength = this.strength(world);
    if (this.state !== 'retreat' && this.state !== 'rally' && strength < RETREAT_BELOW) this.enter('retreat', time);
    const point = this.order?.point ? points.find(p => p.id === this.order!.point) ?? null : null;
    switch (this.state) {
      case 'rally': {
        const ready = this.slots.every(s => s.unit !== null && s.deadAt === null);
        if (ready || time - this.stateSince >= RALLY_MAX) this.enter(this.order?.kind === 'attack' ? 'move' : this.order?.kind === 'defend' ? 'assault' : 'hold', time);
        break;
      }
      case 'move': {
        if (!point) break;
        const stage = this.stage ??= this.staging(world, point);
        members.forEach((u, i) => this.route(world, u, offset(stage, i, 20)));
        const near = members.filter(u => Math.hypot(u.pos.x - stage[0], u.pos.z - stage[1]) <= STRAGGLER);
        const staged = near.length > 0 && near.every(u => Math.hypot(u.pos.x - stage[0], u.pos.z - stage[1]) <= STAGED_RADIUS);
        if (staged || (this.stagedAt !== null && time - this.stagedAt >= STAGING_WAIT)) this.enter('assault', time);
        else if (this.stagedAt === null && members.some(u => Math.hypot(u.pos.x - stage[0], u.pos.z - stage[1]) <= STAGED_RADIUS)) this.stagedAt = time;
        break;
      }
      case 'assault': {
        if (!point) break;
        this.intoSlots(world, point, members);
        if (point.owner === this.side) this.enter('hold', time);
        break;
      }
      case 'hold':
        if (point) this.intoSlots(world, point, members);
        break;
      case 'retreat': {
        const to = this.fallback ??= this.safest(world, points);
        members.forEach((u, i) => this.route(world, u, offset(to, i, 30)));
        const there = members.every(u => Math.hypot(u.pos.x - to[0], u.pos.z - to[1]) <= STAGED_RADIUS * 2);
        if (there && this.safeAt === null) this.safeAt = time;
        if (strength >= REGROUP_AT || (this.safeAt !== null && time - this.safeAt >= REGROUP_WAIT) || !members.length) { this.fallback = null; this.safeAt = null; this.enter('rally', time); }
        break;
      }
    }
  }

  private safest(world: World, points: readonly ControlPoint[]): Vec2 {
    const [cx, cz] = this.center(world);
    const enemy = this.side === 'coalition' ? 'veros' : 'coalition';
    const safe = points.filter(p => p.owner === this.side && p.strength[enemy] === 0 && !p.contested)
      .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
    return safe.length ? [safe[0].x, safe[0].z] : this.home;
  }

  private staging(world: World, p: ControlPoint): Vec2 {
    const c = this.center(world);
    const path: Vec2[] = [c, ...world.roads.route([c, [p.x, p.z]]), [p.x, p.z]];
    let left = STAGING;
    for (let k = path.length - 1; k > 0; k--) {
      const [bx, bz] = path[k], [ax, az] = path[k - 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len >= left) { const t = left / len; return [bx + (ax - bx) * t, bz + (az - bz) * t]; }
      left -= len;
    }
    return c;
  }

  private intoSlots(world: World, p: ControlPoint, members: Unit[]) {
    const dx = this.home[0] - p.x, dz = this.home[1] - p.z, d = Math.hypot(dx, dz) || 1;
    const infantry = members.filter(u => u.def.category === 'infantry');
    const vehicles = members.filter(u => u.def.category !== 'infantry');
    infantry.forEach((u, i) => {
      const a = (i / Math.max(1, infantry.length)) * Math.PI * 2 + this.id.length;
      this.route(world, u, [p.x + Math.cos(a) * p.radius * 0.5, p.z + Math.sin(a) * p.radius * 0.5]);
    });
    vehicles.forEach((u, i) => this.route(world, u, offset([p.x + (dx / d) * SUPPORT, p.z + (dz / d) * SUPPORT], i, 30)));
  }

  private route(world: World, u: Unit, dest: Vec2) {
    const key = `${Math.round(dest[0])},${Math.round(dest[1])}`;
    if (this.routed.get(u.id) === key) return;
    this.routed.set(u.id, key);
    setGroupRoute(world, `u${u.id}`, [u.id], dest);
  }
}

function offset(p: Vec2, i: number, spread: number): Vec2 {
  if (i === 0) return p;
  const a = i * 2.39996;
  const r = spread * Math.sqrt(i);
  return [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r];
}

export function buildPlatoons(side: BattleSide, slots: Slot[], home: Vec2): Platoon[] {
  const squads = slots.filter(s => ['rifle', 'at', 'mg', 'aa', 'sniper'].includes(s.cls));
  const vehicles = slots.filter(s => !squads.includes(s));
  const groups: Slot[][] = [];
  for (let i = 0; i < squads.length; i += SQUADS_PER_PLATOON) groups.push(squads.slice(i, i + SQUADS_PER_PLATOON));
  vehicles.forEach((v, i) => { if (i < groups.length) groups[i].push(v); else groups.push([v]); });
  return groups.map((g, i) => new Platoon(`${side}:${i}`, side, g, home));
}
