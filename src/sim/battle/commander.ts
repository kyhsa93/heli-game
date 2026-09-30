import type { World } from '../world';
import type { ControlPoint } from './conquest';
import type { Intel } from './intel';
import type { Order, Platoon } from './platoon';
import type { BattleSide } from './schema';

export const PERIOD = 5;
export const OFFSET: Record<BattleSide, number> = { coalition: 0, veros: 2.5 };
export const HYSTERESIS = 0.3;
export const MIN_ORDER = 60;
export const DIST_WEIGHT = 0.25;
export const ENEMY_WEIGHT = 0.2;
export const FOCUS_BONUS = 0.8;
export const THREAT_RADIUS = 400;
export const STATE_VALUE = { enemy: 1, neutral: 1.3, attacked: 1.6, safe: 0.3 };

export class Commander {
  focus: string | null = null;
  private next: number;

  constructor(readonly side: BattleSide, readonly platoons: Platoon[], readonly intel: Intel) {
    this.next = OFFSET[side];
  }

  step(world: World, points: readonly ControlPoint[], time: number) {
    for (const p of this.platoons) p.step(world, points, time);
    if (time + 1e-6 < this.next) return;
    this.next += PERIOD;
    this.decide(world, points, time);
  }

  knownEnemy(world: World, p: ControlPoint, time: number) {
    let n = 0;
    for (const u of world.units) {
      if (!u.alive || u.side === this.side || u.side === 'civilian') continue;
      if (Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > THREAT_RADIUS) continue;
      if (this.intel.knows(this.side, u.id, time)) n += u.def.squad ? 1 : 0.5;
    }
    return n;
  }

  attacked(world: World, p: ControlPoint, time: number) {
    return p.owner === this.side && (p.strength[this.side === 'coalition' ? 'veros' : 'coalition'] > 0 || this.knownEnemy(world, p, time) > 0);
  }

  utility(world: World, pl: Platoon, p: ControlPoint, time: number) {
    const state = p.owner === 'neutral' ? STATE_VALUE.neutral : p.owner !== this.side ? STATE_VALUE.enemy : this.attacked(world, p, time) ? STATE_VALUE.attacked : STATE_VALUE.safe;
    const [cx, cz] = pl.center(world);
    const km = Math.hypot(cx - p.x, cz - p.z) / 1000;
    return p.value * state - DIST_WEIGHT * km - ENEMY_WEIGHT * this.knownEnemy(world, p, time) + (this.focus === p.id ? FOCUS_BONUS : 0);
  }

  reserve(): Platoon | null {
    return this.platoons.length >= 2 ? this.platoons[this.platoons.length - 1] : null;
  }

  private decide(world: World, points: readonly ControlPoint[], time: number) {
    const reserve = this.reserve();
    if (reserve) this.steerReserve(world, reserve, points, time);
    const active = this.platoons.filter(pl => pl !== reserve && pl.members(world).length > 0);
    const pairs = active.flatMap(pl => points.map(p => ({ pl, p, u: this.utility(world, pl, p, time) })))
      .sort((a, b) => b.u - a.u || a.pl.id.localeCompare(b.pl.id) || a.p.id.localeCompare(b.p.id));
    const load = new Map<string, number>();
    const done = new Set<Platoon>();
    for (const { pl, p, u } of pairs) {
      if (done.has(pl)) continue;
      const cap = this.knownEnemy(world, p, time) * 1.5 + 1;
      if ((load.get(p.id) ?? 0) >= cap) continue;
      load.set(p.id, (load.get(p.id) ?? 0) + 1);
      done.add(pl);
      this.assign(world, pl, p, u, points, time);
    }
  }

  private steerReserve(world: World, reserve: Platoon, points: readonly ControlPoint[], time: number) {
    const [cx, cz] = reserve.center(world);
    const threatened = points.filter(p => this.attacked(world, p, time)).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
    const cur = reserve.order;
    if (!cur) { reserve.give({ kind: 'reserve', point: null, utility: 0 }, time); return; }
    if (cur.kind === 'reserve' && threatened.length) reserve.give({ kind: 'defend', point: threatened[0].id, utility: 0 }, time);
    else if (cur.kind === 'defend' && !threatened.some(p => p.id === cur.point) && time - cur.since >= MIN_ORDER) reserve.give({ kind: 'reserve', point: null, utility: 0 }, time);
  }

  private assign(world: World, pl: Platoon, p: ControlPoint, u: number, points: readonly ControlPoint[], time: number) {
    const kind: Order['kind'] = p.owner === this.side ? 'defend' : 'attack';
    const cur = pl.order;
    if (cur && cur.point === p.id) {
      if (cur.kind !== kind) pl.order = { ...cur, kind };
      return;
    }
    if (cur && cur.point) {
      const now = points.find(q => q.id === cur.point);
      const keep = now ? this.utility(world, pl, now, time) : -Infinity;
      if (time - cur.since < MIN_ORDER || u - keep < HYSTERESIS) return;
    }
    pl.give({ kind, point: p.id, utility: u }, time);
  }
}
