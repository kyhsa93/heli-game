import { Vector3 } from 'three';
import { G3 } from '../heli/airframe';
import type { Terrain } from '../terrain';
import type { Unit } from '../units';

export interface Projectile {
  id: number;
  weapon: string;
  pos: Vector3;
  vel: Vector3;
  owner: number;
  life: number;
  drag: number;
  tracer: boolean;
  origin: Vector3;
  burn?: number;
  thrust?: number;
}

export const PLAYER_OWNER = 0;

const prev = new Vector3();

export function integrate(p: Projectile, dt: number) {
  prev.copy(p.pos);
  const speed = p.vel.length();
  if (p.burn && p.burn > 0 && p.thrust && speed > 0) {
    const t = Math.min(dt, p.burn);
    p.vel.addScaledVector(p.vel, p.thrust * t / speed);
    p.burn -= dt;
  }
  p.vel.addScaledVector(p.vel, -p.drag * speed * dt);
  p.vel.y -= G3 * dt;
  p.pos.addScaledVector(p.vel, dt);
  p.life -= dt;
  return prev;
}

export function segmentHitsUnit(a: Vector3, b: Vector3, u: Unit): number | null {
  const [w, h, l] = u.def.size;
  const r = Math.max(w, l) / 2;
  const dx = b.x - a.x, dz = b.z - a.z;
  const fx = a.x - u.pos.x, fz = a.z - u.pos.z;
  const A = dx * dx + dz * dz;
  let t0 = 0, t1 = 1;
  if (A > 1e-9) {
    const B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - r * r;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    t0 = Math.max(0, (-B - s) / (2 * A));
    t1 = Math.min(1, (-B + s) / (2 * A));
    if (t0 > t1) return null;
  } else if (fx * fx + fz * fz > r * r) return null;
  const y0 = u.pos.y, y1 = u.pos.y + h;
  const ay = a.y + (b.y - a.y) * t0, by = a.y + (b.y - a.y) * t1;
  if (Math.max(ay, by) < y0 || Math.min(ay, by) > y1) return null;
  if (ay >= y0 && ay <= y1) return t0;
  const dy = b.y - a.y;
  if (Math.abs(dy) < 1e-9) return null;
  const tEnter = (ay > y1 ? y1 - a.y : y0 - a.y) / dy;
  return tEnter >= t0 && tEnter <= t1 ? tEnter : null;
}

export function segmentHitsTerrain(a: Vector3, b: Vector3, t: Terrain): number | null {
  const below = (x: number, y: number, z: number) => y <= t.surfaceAt(x, z);
  if (!below(b.x, b.y, b.z)) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
    if (!below(mx, my, mz)) return null;
  }
  let lo = 0, hi = 1;
  for (let i = 0; i < 12; i++) {
    const m = (lo + hi) / 2;
    if (below(a.x + (b.x - a.x) * m, a.y + (b.y - a.y) * m, a.z + (b.z - a.z) * m)) hi = m; else lo = m;
  }
  return hi;
}
