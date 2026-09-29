import { Vector3 } from 'three';
import { DEG } from '../../core/math';
import { G3 } from '../heli/airframe';
import { PYLON_X, PYLONS, type Loadout, type PylonId } from '../heli/loadout';
import { toWorld, type HeliState } from '../heli/state';
import { lineOfSight } from '../sensors/laser';
import { radarSight } from '../los';
import { fcrClass } from '../sensors/fcr';
import { unitCenter } from '../sensors/laser';
import type { Terrain } from '../terrain';
import type { Unit } from '../units';
import { WEAPONS } from './damage';

export const HELLFIRE = WEAPONS.agm114k;
export const SEEKER_COS = Math.cos((HELLFIRE.seekerHalfAngleDeg ?? 30) * DEG);
export const LOAL_WINDOW = HELLFIRE.loalWindow ?? 10;
export const RAIL_Y = -0.37;
export const RAIL_Z = -0.7;

export type MissileMode = 'lobl' | 'loal' | 'rf';
export type MissileKind = 'agm114k' | 'agm114l';
export const RF_SEEKER_RANGE = 3000;
export const RF_ACQUIRE_RADIUS = 150;
export type MissilePhase = 'boost' | 'cruise' | 'terminal' | 'lost';

export interface Missile {
  id: number;
  kind: MissileKind;
  pos: Vector3;
  vel: Vector3;
  owner: number;
  mode: MissileMode;
  phase: MissilePhase;
  age: number;
  seekerLocked: boolean;
  aim: Vector3;
  apex: Vector3 | null;
  targetUnit?: number | null;
}

export interface LaserSpot { pos: Vector3; source: 'player' | 'remote' }

export function hellfireLaunchers(lo: Loadout, kind: MissileKind = 'agm114k'): PylonId[] {
  return PYLONS.filter(p => lo.def.pylons[p] === kind);
}

export function nextLauncher(lo: Loadout, fired: number, kind: MissileKind = 'agm114k'): PylonId | null {
  const ready = hellfireLaunchers(lo, kind).filter(p => lo.rounds[p] > 0);
  if (!ready.length) return null;
  const left = ready.filter(p => PYLON_X[p] < 0), right = ready.filter(p => PYLON_X[p] > 0);
  const side = fired % 2 === 0 ? (left.length ? left : right) : (right.length ? right : left);
  return side[0];
}

export function railPosition(h: HeliState, pylon: PylonId, out = new Vector3()) {
  return toWorld(h, new Vector3(PYLON_X[pylon], RAIL_Y, RAIL_Z), out);
}

export function speedAt(age: number) {
  return Math.min(HELLFIRE.maxSpeed ?? 450, (HELLFIRE.launchSpeed ?? 60) + (HELLFIRE.accel ?? 160) * age);
}

export function seekerSees(t: Terrain, from: Vector3, heading: Vector3, spot: Vector3) {
  const d = spot.clone().sub(from);
  const len = d.length();
  if (len < 1) return true;
  if (d.divideScalar(len).dot(heading) < SEEKER_COS) return false;
  return lineOfSight(t, from, spot.clone().addScaledVector(d, -1.5));
}

export function pickSpot(t: Terrain, from: Vector3, heading: Vector3, spots: readonly LaserSpot[]): LaserSpot | null {
  let best: LaserSpot | null = null, bestDot = -2;
  for (const s of spots) {
    const dot = s.pos.clone().sub(from).normalize().dot(heading);
    if (dot > bestDot && seekerSees(t, from, heading, s.pos)) { best = s; bestDot = dot; }
  }
  return best;
}

export function loftHeight(range: number) {
  return Math.min(600, Math.max(150, range * 0.12));
}

const dir = new Vector3(), want = new Vector3(), axis = new Vector3();

function turnToward(m: Missile, target: Vector3, dt: number) {
  dir.copy(m.vel).normalize();
  want.copy(target).sub(m.pos).normalize();
  const ang = Math.acos(Math.max(-1, Math.min(1, dir.dot(want))));
  const max = (HELLFIRE.turnRate ?? 0.6) * dt;
  if (ang <= max || ang < 1e-6) dir.copy(want);
  else {
    axis.crossVectors(dir, want).normalize();
    dir.applyAxisAngle(axis, max);
  }
  m.vel.copy(dir).multiplyScalar(speedAt(m.age));
}

function loftToward(m: Missile, dt: number) {
  m.phase = m.age < 1 ? 'boost' : 'cruise';
  const apex = m.apex;
  const past = !apex || Math.hypot(m.aim.x - m.pos.x, m.aim.z - m.pos.z) <= Math.hypot(m.aim.x - apex.x, m.aim.z - apex.z);
  turnToward(m, (past ? m.aim : apex).clone(), dt);
}

export function rfReturn(t: Terrain, m: Missile, heading: Vector3, units: readonly Unit[]): Unit | null {
  let best: Unit | null = null, bestD = RF_ACQUIRE_RADIUS;
  const c = new Vector3();
  for (const u of units) {
    const cls = u.alive ? fcrClass(u) : null;
    if (!cls || cls === 'heli') continue;
    unitCenter(u, c);
    const d = Math.hypot(c.x - m.aim.x, c.z - m.aim.z);
    if (d > bestD) continue;
    const to = c.clone().sub(m.pos);
    if (to.length() > RF_SEEKER_RANGE || to.normalize().dot(heading) < SEEKER_COS || !radarSight(t, m.pos, c)) continue;
    best = u; bestD = d;
  }
  return best;
}

function stepRf(m: Missile, t: Terrain, units: readonly Unit[], dt: number) {
  const heading = dir.copy(m.vel).normalize().clone();
  let target = m.targetUnit != null ? units.find(u => u.id === m.targetUnit && u.alive) ?? null : null;
  if (!target && Math.hypot(m.aim.x - m.pos.x, m.aim.z - m.pos.z) <= RF_SEEKER_RANGE) {
    target = rfReturn(t, m, heading, units);
    if (target) m.targetUnit = target.id;
  }
  if (target) {
    unitCenter(target, m.aim);
    m.seekerLocked = true;
    m.phase = 'terminal';
    turnToward(m, m.aim.clone(), dt);
  } else if (m.seekerLocked) {
    m.phase = 'terminal';
    turnToward(m, m.aim.clone(), dt);
  } else loftToward(m, dt);
}

export function stepMissile(m: Missile, t: Terrain, spots: readonly LaserSpot[], dt: number, units: readonly Unit[] = []) {
  m.age += dt;
  if (m.mode === 'rf') {
    stepRf(m, t, units, dt);
    m.pos.addScaledVector(m.vel, dt);
    return;
  }
  if (m.phase === 'lost') {
    m.vel.y -= G3 * dt;
    m.pos.addScaledVector(m.vel, dt);
    return;
  }
  const heading = dir.copy(m.vel).normalize().clone();
  const spot = pickSpot(t, m.pos, heading, spots);
  if (spot) {
    m.seekerLocked = true;
    m.aim.copy(spot.pos);
    m.phase = 'terminal';
    turnToward(m, spot.pos, dt);
  } else if (m.seekerLocked || (m.mode === 'loal' && m.age > LOAL_WINDOW)) {
    m.phase = 'lost';
    m.seekerLocked = false;
  } else loftToward(m, dt);
  m.pos.addScaledVector(m.vel, dt);
}
