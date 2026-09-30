import { Vector3 } from 'three';
import type { Unit } from '../units';

export const MEMBER_RADIUS = 0.3;
export const MEMBER_HEIGHT = 1.8;
export const HEAD_RADIUS = 0.13;
export const HEADSHOT = 2;
export const MEMBER_LOD = 300;
export const SLOTS: readonly [number, number][] = [[0, 0], [-3, 3], [3, 3], [-6, 6], [6, 6], [-9, 9], [9, 9]];

export interface Member { ox: number; oz: number; hp: number; alive: boolean }

export function createMembers(u: Unit): Member[] {
  const n = u.def.squad ?? 0, each = u.def.hp / Math.max(1, n);
  return Array.from({ length: n }, (_, i) => ({ ox: SLOTS[i % SLOTS.length][0], oz: SLOTS[i % SLOTS.length][1], hp: each, alive: true }));
}

export function memberPos(u: Unit, m: Member, out = new Vector3()) {
  const c = Math.cos(u.yaw), s = Math.sin(u.yaw);
  return out.set(u.pos.x + m.ox * c + m.oz * s, u.pos.y, u.pos.z - m.ox * s + m.oz * c);
}

export function syncMembers(u: Unit) {
  const ms = u.members;
  if (!ms) return;
  let excess = ms.reduce((t, m) => t + (m.alive ? m.hp : 0), 0) - u.hp;
  for (let i = ms.length - 1; i >= 0 && excess > 1e-9; i--) {
    const m = ms[i];
    if (!m.alive) continue;
    const take = Math.min(m.hp, excess);
    m.hp -= take; excess -= take;
    if (m.hp <= 1e-9) { m.hp = 0; m.alive = false; }
  }
}

const p = new Vector3();

function capsuleT(a: Vector3, b: Vector3, cx: number, cz: number, y0: number, y1: number, r: number): number | null {
  const dx = b.x - a.x, dz = b.z - a.z, fx = a.x - cx, fz = a.z - cz;
  const A = dx * dx + dz * dz;
  let t0 = 0, t1 = 1;
  if (A > 1e-12) {
    const B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - r * r, disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    t0 = Math.max(0, (-B - sq) / (2 * A)); t1 = Math.min(1, (-B + sq) / (2 * A));
    if (t0 > t1) return null;
  } else if (fx * fx + fz * fz > r * r) return null;
  const ya = a.y + (b.y - a.y) * t0, yb = a.y + (b.y - a.y) * t1;
  if (Math.max(ya, yb) < y0 || Math.min(ya, yb) > y1) return null;
  return t0;
}

function sphereT(a: Vector3, b: Vector3, c: Vector3, r: number): number | null {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, fx = a.x - c.x, fy = a.y - c.y, fz = a.z - c.z;
  const A = dx * dx + dy * dy + dz * dz, B = 2 * (fx * dx + fy * dy + fz * dz), C = fx * fx + fy * fy + fz * fz - r * r;
  const disc = B * B - 4 * A * C;
  if (disc < 0 || A < 1e-12) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : null;
}

export interface MemberHit { member: Member; t: number; head: boolean }

export function segmentHitsMember(a: Vector3, b: Vector3, u: Unit): MemberHit | null {
  let best: MemberHit | null = null;
  for (const m of u.members ?? []) {
    if (!m.alive) continue;
    memberPos(u, m, p);
    const head = p.clone().setY(p.y + MEMBER_HEIGHT - HEAD_RADIUS);
    const th = sphereT(a, b, head, HEAD_RADIUS);
    const tb = capsuleT(a, b, p.x, p.z, p.y, p.y + MEMBER_HEIGHT - 2 * HEAD_RADIUS, MEMBER_RADIUS);
    const t = th !== null && (tb === null || th <= tb) ? th : tb;
    if (t !== null && (!best || t < best.t)) best = { member: m, t, head: t === th && th !== null };
  }
  return best;
}
