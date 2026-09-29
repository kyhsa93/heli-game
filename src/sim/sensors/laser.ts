import { Vector3 } from 'three';
import { DEG } from '../../core/math';
import type { Terrain } from '../terrain';
import type { Unit } from '../units';
import { visualSight } from '../los';
import { segmentHitsTerrain, segmentHitsUnit } from '../weapons/projectile';

export const LASER_MAX = 10000;
export const IDENTIFY_FOV_DEG = 3;
export const IDENTIFY_SECONDS = 1;
export const IDENTIFY_MAX = 8000;
export const FOG_TV_RANGE = 1500;
export const FOG_FLIR_RANGE = 3000;
export const DESIGNATION_SECONDS = 30;

export interface Laser {
  on: boolean;
  range: number | null;
  point: Vector3 | null;
  unitId: number | null;
  designation: Vector3 | null;
  designatedAt: number;
}

export function createLaser(): Laser {
  return { on: false, range: null, point: null, unitId: null, designation: null, designatedAt: -Infinity };
}

export interface RayHit { point: Vector3; range: number; unit: Unit | null }

export function terrainRay(t: Terrain, origin: Vector3, dir: Vector3, max: number, step = 10): number | null {
  const a = new Vector3(), b = origin.clone();
  for (let d = step; d < max + step; d += step) {
    a.copy(b);
    b.copy(origin).addScaledVector(dir, Math.min(d, max));
    const hit = segmentHitsTerrain(a, b, t);
    if (hit !== null) return Math.min(d, max) - step + hit * step;
  }
  return null;
}

export function castRay(t: Terrain, units: readonly Unit[], origin: Vector3, dir: Vector3, max = LASER_MAX): RayHit | null {
  const ground = terrainRay(t, origin, dir, max);
  let best = ground ?? max, unit: Unit | null = null;
  const end = origin.clone().addScaledVector(dir, best);
  for (const u of units) {
    const k = segmentHitsUnit(origin, end, u);
    if (k !== null && k * best < best - 1e-6) { best = k * best; end.copy(origin).addScaledVector(dir, best); unit = u; }
  }
  if (ground === null && !unit) return null;
  return { point: origin.clone().addScaledVector(dir, best), range: best, unit };
}

export function unitCenter(u: Unit, out = new Vector3()) {
  return out.set(u.pos.x, u.pos.y + u.def.size[1] / 2, u.pos.z);
}

export function lineOfSight(t: Terrain, a: Vector3, b: Vector3) {
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < 1) return true;
  d.divideScalar(len);
  const g = terrainRay(t, a, d, len - 1, 20);
  return g === null;
}

export function crosshairUnit(t: Terrain, units: readonly Unit[], origin: Vector3, dir: Vector3, fovDeg: number, maxRange = IDENTIFY_MAX): Unit | null {
  const tol = fovDeg * DEG * 0.04;
  let best: Unit | null = null, bestAng = Infinity;
  const c = new Vector3();
  for (const u of units) {
    if (!u.alive) continue;
    unitCenter(u, c);
    const dist = c.distanceTo(origin);
    if (dist > maxRange || dist < 1) continue;
    const ang = Math.acos(Math.min(1, c.clone().sub(origin).divideScalar(dist).dot(dir)));
    const radius = Math.atan(Math.max(u.def.size[0], u.def.size[2]) / 2 / dist);
    if (ang > Math.max(tol, radius) || ang >= bestAng) continue;
    if (!visualSight(t, origin, c).clear) continue;
    best = u; bestAng = ang;
  }
  return best;
}

export function identifyRange(fog: boolean, sensor: 'tv' | 'flir') {
  return fog ? (sensor === 'flir' ? FOG_FLIR_RANGE : FOG_TV_RANGE) : IDENTIFY_MAX;
}
