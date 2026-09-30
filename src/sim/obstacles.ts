import type { Vector3 } from 'three';

export interface Obstacle { x: number; z: number; y: number; w: number; d: number; h: number; yaw: number }

export function toLocal(o: Obstacle, x: number, z: number) {
  const dx = x - o.x, dz = z - o.z, c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  return [dx * c - dz * s, dx * s + dz * c] as const;
}

export function fromLocal(o: Obstacle, lx: number, lz: number) {
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  return [o.x + lx * c + lz * s, o.z - lx * s + lz * c] as const;
}

export function pushOutOf(o: Obstacle, x: number, z: number, r: number): [number, number] | null {
  const [lx, lz] = toLocal(o, x, z);
  const hx = o.w / 2 + r, hz = o.d / 2 + r;
  if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) return null;
  const px = hx - Math.abs(lx) < hz - Math.abs(lz) ? Math.sign(lx || 1) * hx : lx;
  const pz = px === lx ? Math.sign(lz || 1) * hz : lz;
  const [wx, wz] = fromLocal(o, px, pz);
  return [wx, wz];
}

export function segmentBlocked(o: Obstacle, a: Vector3, b: Vector3) {
  const [ax, az] = toLocal(o, a.x, a.z), [bx, bz] = toLocal(o, b.x, b.z);
  const hx = o.w / 2, hz = o.d / 2;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax + hx], [dx, hx - ax], [-dz, az + hz], [dz, hz - az]] as const) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  const top = o.y + o.h;
  const ya = a.y + (b.y - a.y) * t0, yb = a.y + (b.y - a.y) * t1;
  return Math.min(ya, yb) < top;
}
