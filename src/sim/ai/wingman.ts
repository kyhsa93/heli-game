import { Vector3 } from 'three';
import { terrainClear } from '../los';
import { unitCenter } from '../sensors/laser';
import { selectedTarget } from '../sensors/fcr';
import type { Unit } from '../units';
import { hitUnit, WEAPONS } from '../weapons/damage';
import type { World } from '../world';

export const WINGMAN_ID = 'hound2';
export const WINGMAN_TYPE = 'c_apache';
export const FORMATION = { right: 106, back: 106 };
export const WINGMAN_MIN_AGL = 30;
export const WINGMAN_MAX_SPEED = 80;
export const WINGMAN_ACCEL = 10;
export const HOLD_RADIUS = 5000;
export const HUNT_RADIUS = 8000;
export const STANDOFF = 3000;
export const MISSILE_RANGE = { min: 500, max: 6000 };
export const GUN_RANGE = 1500;
export const MISSILE_INTERVAL = 8;
export const GUN_INTERVAL = 2;
export const GUN_BURST = 10;
export const MISSILE_HIT = 0.8;
export const GUN_HIT = 0.3;
export const WINGMAN_ORDERS = ['formation', 'attackMine', 'free', 'sead', 'rtb'] as const;

export type WingmanOrder = typeof WINGMAN_ORDERS[number];

export interface Wingman {
  unitId: number;
  order: WingmanOrder;
  targetId: number | null;
  missiles: number;
  gunAmmo: number;
  missileTimer: number;
  gunTimer: number;
  home: Vector3 | null;
}

export function createWingman(unitId: number, home: Vector3 | null): Wingman {
  return { unitId, order: 'formation', targetId: null, missiles: 8, gunAmmo: 600, missileTimer: 0, gunTimer: 0, home };
}

export function formationPoint(world: World, out = new Vector3()) {
  const h = world.player, s = Math.sin(h.yaw), c = Math.cos(h.yaw);
  const x = h.pos.x + c * FORMATION.right + s * FORMATION.back;
  const z = h.pos.z - s * FORMATION.right + c * FORMATION.back;
  return out.set(x, Math.max(h.pos.y, world.terrain.surfaceAt(x, z) + WINGMAN_MIN_AGL), z);
}

export function playerTarget(world: World): number | null {
  return world.laser.unitId ?? world.identify.unitId ?? selectedTarget(world.fcr)?.unitId ?? null;
}

const isAirDefense = (u: Unit) => !!u.def.radar || u.def.category === 'airDefense';

function eyeOf(u: Unit, out = new Vector3()) {
  return out.set(u.pos.x, u.pos.y + u.def.size[1] * 0.6, u.pos.z);
}

export function canSee(world: World, from: Unit, u: Unit) {
  return terrainClear(world.terrain, eyeOf(from), unitCenter(u));
}

export function chooseTarget(world: World, w: Wingman, me: Unit): Unit | null {
  const mine = playerTarget(world);
  if (w.order === 'rtb') return null;
  if (w.order === 'attackMine') {
    const u = mine === null ? undefined : world.unit(mine);
    return u?.alive && u.side === 'veros' ? u : null;
  }
  const radius = w.order === 'formation' ? HOLD_RADIUS : HUNT_RADIUS;
  let best: Unit | null = null, bestScore = Infinity;
  for (const u of world.units) {
    if (!u.alive || u.side !== 'veros' || u.id === mine || u.def.indestructible) continue;
    if (w.order === 'sead' && !isAirDefense(u)) continue;
    const d = u.pos.distanceTo(me.pos);
    if (d > radius || !canSee(world, me, u)) continue;
    const score = d - (isAirDefense(u) ? 2000 : 0);
    if (score < bestScore) { best = u; bestScore = score; }
  }
  return best;
}

function goal(world: World, w: Wingman, me: Unit, target: Unit | null, out: Vector3) {
  if (w.order === 'rtb' && w.home) return out.set(w.home.x, world.terrain.surfaceAt(w.home.x, w.home.z) + WINGMAN_MIN_AGL, w.home.z);
  if (target && w.order !== 'formation') {
    const d = Math.hypot(target.pos.x - me.pos.x, target.pos.z - me.pos.z);
    if (d > STANDOFF || !canSee(world, me, target)) {
      const k = d > STANDOFF ? (d - STANDOFF) / d : 0.3;
      const x = me.pos.x + (target.pos.x - me.pos.x) * k, z = me.pos.z + (target.pos.z - me.pos.z) * k;
      return out.set(x, world.terrain.surfaceAt(x, z) + 60, z);
    }
    return out.set(me.pos.x, Math.max(me.pos.y, world.terrain.surfaceAt(me.pos.x, me.pos.z) + WINGMAN_MIN_AGL), me.pos.z);
  }
  return formationPoint(world, out);
}

const want = new Vector3(), tmp = new Vector3();

function fly(world: World, me: Unit, to: Vector3, lead: Vector3 | null, dt: number) {
  want.copy(to).sub(me.pos);
  const d = want.length();
  const chase = Math.min(WINGMAN_MAX_SPEED, Math.sqrt(2 * WINGMAN_ACCEL * d), d * 0.5);
  want.setLength(d > 1e-6 ? chase : 0);
  if (lead) want.add(lead);
  if (want.length() > WINGMAN_MAX_SPEED) want.setLength(WINGMAN_MAX_SPEED);
  tmp.copy(want).sub(me.vel);
  const dv = WINGMAN_ACCEL * dt;
  if (tmp.length() > dv) tmp.setLength(dv);
  me.vel.add(tmp);
  me.pos.addScaledVector(me.vel, dt);
  const floor = world.terrain.surfaceAt(me.pos.x, me.pos.z) + WINGMAN_MIN_AGL * 0.5;
  if (me.pos.y < floor) { me.pos.y = floor; if (me.vel.y < 0) me.vel.y = 0; }
  if (Math.hypot(me.vel.x, me.vel.z) > 3) me.yaw = Math.atan2(-me.vel.x, -me.vel.z);
  else if (world.player.alive) me.yaw = world.player.yaw;
}

function engage(world: World, w: Wingman, me: Unit, target: Unit, dt: number) {
  w.missileTimer = Math.max(0, w.missileTimer - dt);
  w.gunTimer = Math.max(0, w.gunTimer - dt);
  const d = me.pos.distanceTo(target.pos);
  if (!canSee(world, me, target)) return;
  const armored = target.def.armor >= 3 || isAirDefense(target) || target.def.category === 'structure';
  const from = eyeOf(me), at = unitCenter(target);
  if (w.missiles > 0 && w.missileTimer <= 0 && d >= MISSILE_RANGE.min && d <= MISSILE_RANGE.max && (armored || d > GUN_RANGE)) {
    w.missiles--;
    w.missileTimer = MISSILE_INTERVAL;
    world.emit({ t: 'fire', weapon: 'agm114k', pos: from.clone(), dir: at.clone().sub(from).normalize(), owner: me.id, tracer: false });
    if (world.rng() < MISSILE_HIT) {
      world.emit({ t: 'explosion', pos: at.clone(), size: 6 });
      hitUnit(world, target, WEAPONS.agm114k, false);
    }
    return;
  }
  if (w.gunAmmo > 0 && w.gunTimer <= 0 && d <= GUN_RANGE && !armored) {
    w.gunTimer = GUN_INTERVAL;
    const n = Math.min(GUN_BURST, w.gunAmmo);
    w.gunAmmo -= n;
    world.emit({ t: 'fire', weapon: 'gun30', pos: from.clone(), dir: at.clone().sub(from).normalize(), owner: me.id, tracer: true });
    for (let i = 0; i < n; i++) if (world.rng() < GUN_HIT) hitUnit(world, target, WEAPONS.gun30, false);
  }
}

export function setOrder(world: World, w: Wingman, order: WingmanOrder) {
  w.order = order;
  w.targetId = null;
  world.emit({ t: 'wingman', state: 'order', order });
}

export function stepWingman(world: World, w: Wingman, dt: number) {
  const me = world.unit(w.unitId);
  if (!me || !me.alive) return;
  const target = w.targetId === null ? null : world.unit(w.targetId) ?? null;
  const live = target?.alive ? target : null;
  const inFormation = w.order === 'formation' || (!live && w.order !== 'rtb');
  fly(world, me, goal(world, w, me, live, new Vector3()), inFormation && world.player.alive ? world.player.vel : null, dt);
}

export function thinkWingman(world: World, w: Wingman, dt: number) {
  const me = world.unit(w.unitId);
  if (!me || !me.alive) return;
  const mine = playerTarget(world);
  let target = w.targetId === null ? undefined : world.unit(w.targetId);
  if (!target?.alive || w.order === 'rtb' || (w.order === 'attackMine') !== (target.id === mine)) {
    target = chooseTarget(world, w, me) ?? undefined;
    w.targetId = target?.id ?? null;
  }
  if (target) engage(world, w, me, target, dt);
}
