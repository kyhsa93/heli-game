import { Vector3 } from 'three';
import { DEG } from '../../core/math';
import { toWorld, type HeliState } from '../heli/state';
import { terrainClear } from '../los';
import { unitCenter } from '../sensors/laser';
import type { Terrain } from '../terrain';
import type { Unit } from '../units';
import { WEAPONS } from './damage';
import type { EnemyMissile } from './enemyMissile';

export const STINGER = WEAPONS.stinger;
export const STINGER_LOCK_SECONDS = 1.5;
export const STINGER_SEEKER = 2.5 * DEG;
export const STINGER_RAIL = new Vector3(2.62, -0.2, -0.4);

export interface StingerSeeker { unitId: number | null; time: number; locked: boolean }
export interface Aam extends EnemyMissile { targetUnit: number }

export function createSeeker(): StingerSeeker {
  return { unitId: null, time: 0, locked: false };
}

export function seekerTarget(t: Terrain, eye: Vector3, sight: Vector3, units: readonly Unit[]): Unit | null {
  let best: Unit | null = null, bestAng = STINGER_SEEKER;
  const c = new Vector3();
  for (const u of units) {
    if (!u.alive || u.def.category !== 'air' || !u.def.heat) continue;
    unitCenter(u, c);
    const to = c.clone().sub(eye);
    const range = to.length();
    if (range < STINGER.minRange || range > STINGER.maxRange) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, to.divideScalar(range).dot(sight))));
    if (ang > bestAng || !terrainClear(t, eye, c)) continue;
    best = u; bestAng = ang;
  }
  return best;
}

export function stepSeeker(s: StingerSeeker, target: Unit | null, dt: number) {
  if (!target) { s.unitId = null; s.time = 0; s.locked = false; return; }
  if (s.unitId !== target.id) { s.unitId = target.id; s.time = 0; s.locked = false; }
  s.time += dt;
  s.locked = s.time >= STINGER_LOCK_SECONDS - 1e-9;
}

export function stingerRail(h: HeliState, shot: number, out = new Vector3()) {
  return toWorld(h, out.set(STINGER_RAIL.x * (shot % 2 ? 1 : -1), STINGER_RAIL.y, STINGER_RAIL.z), out);
}

export function launchStinger(h: HeliState, target: Unit, shot: number, id: number, owner: number): Aam {
  const pos = stingerRail(h, shot);
  const dir = unitCenter(target).sub(pos).normalize();
  return {
    id, weapon: 'stinger', kind: 'ir', owner, pos, vel: dir.multiplyScalar(40).add(h.vel), age: 0,
    guiding: true, blind: 0, launcher: pos.clone(), target: null, targetUnit: target.id,
  };
}
