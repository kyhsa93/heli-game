import { pushOutOf, toLocal, type Obstacle } from '../obstacles';
import type { Terrain } from '../terrain';
import type { Unit } from '../units';
import { SOLDIER_RADIUS, type SoldierCommands, type SoldierState, type Stance } from './soldier';

export const SPEED = { ads: 2.8, run: 5, sprint: 7, crouch: 2, prone: 0.8 } as const;
export const ACCEL = 20;
export const STAMINA = 8;
export const STAMINA_RECOVERY = 1 / 1.5;
export const PRONE_DOWN = 0.8;
export const PRONE_UP = 0.6;
export const MAX_SLOPE_DEG = 35;
export const WADE_DEPTH = 1.2;
export const WADE_FACTOR = 0.5;
export const GRAVITY = 9.81;
export const JUMP_HEIGHT = 0.5;
export const FALL_SAFE = 9;
export const FALL_DAMAGE = 15;
export const TRUNK_RADIUS = 0.25;
export const RUN_OVER_SPEED = 3;
export const VAULT_HEIGHT = 1.1;
export const VAULT_TIME = 0.6;
export const VAULT_REACH = 1.2;

export interface Vault { t: number; fx: number; fz: number; tx: number; tz: number }

export interface SoldierMotion { stamina: number; stanceTimer: number; stanceFrom: Stance; exhausted: boolean; vault: Vault | null }

export function createMotion(): SoldierMotion {
  return { stamina: STAMINA, stanceTimer: 0, stanceFrom: 'stand', exhausted: false, vault: null };
}

export type MoveOutcome = { t: 'fall'; damage: number } | { t: 'runOver'; by: number } | null;

const SLOPE_COS = Math.cos((MAX_SLOPE_DEG * Math.PI) / 180);

export function groundAt(t: Terrain, x: number, z: number) {
  const b = t.onBridge(x, z, 4);
  return b ? b.y + 0.6 : t.surfaceAt(x, z);
}

export function waterDepth(t: Terrain, x: number, z: number) {
  if (t.onBridge(x, z, 4)) return 0;
  return Math.max(0, -t.heightAt(x, z));
}

export function setStance(s: SoldierState, m: SoldierMotion, next: Stance) {
  if (next === s.stance) return;
  if (next === 'prone' || s.stance === 'prone') m.stanceTimer = next === 'prone' ? PRONE_DOWN : PRONE_UP;
  m.stanceFrom = s.stance;
  s.stance = next;
}

export function topSpeed(s: SoldierState, c: SoldierCommands, m: SoldierMotion) {
  if (m.stanceTimer > 0) return 0;
  if (s.stance === 'prone') return SPEED.prone;
  if (s.stance === 'crouch') return SPEED.crouch;
  if (c.sprint && c.forward > 0 && !c.ads && !m.exhausted) return SPEED.sprint;
  return c.ads ? SPEED.ads : SPEED.run;
}

export function sprinting(s: SoldierState, c: SoldierCommands, m: SoldierMotion) {
  return topSpeed(s, c, m) === SPEED.sprint && Math.hypot(s.vel.x, s.vel.z) > SPEED.run;
}

export function stepSoldier(s: SoldierState, c: SoldierCommands, m: SoldierMotion, t: Terrain, units: readonly Unit[], dt: number, obstacles: readonly Obstacle[] = []): MoveOutcome {
  if (!s.alive) return null;
  s.yaw = c.yaw;
  s.pitch = c.pitch;
  if (m.vault) {
    const v = m.vault;
    v.t = Math.min(1, v.t + dt / VAULT_TIME);
    s.pos.x = v.fx + (v.tx - v.fx) * v.t; s.pos.z = v.fz + (v.tz - v.fz) * v.t;
    s.pos.y = groundAt(t, s.pos.x, s.pos.z) + Math.sin(v.t * Math.PI) * (VAULT_HEIGHT + 0.1);
    if (v.t >= 1) { m.vault = null; s.pos.y = groundAt(t, s.pos.x, s.pos.z); s.onGround = true; }
    return null;
  }
  if (c.jump && s.onGround && s.stance === 'stand') {
    const v = vaultOver(s, obstacles);
    if (v) { m.vault = v; s.vel.set(0, 0, 0); return null; }
  }
  m.stanceTimer = Math.max(0, m.stanceTimer - dt);
  const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
  let wx = c.forward * fx + c.right * rx, wz = c.forward * fz + c.right * rz;
  const len = Math.hypot(wx, wz);
  if (len > 1) { wx /= len; wz /= len; }
  let top = topSpeed(s, c, m);
  if (waterDepth(t, s.pos.x, s.pos.z) > 0) top *= WADE_FACTOR;
  const isSprint = top === SPEED.sprint;
  if (isSprint && len > 0) { m.stamina = Math.max(0, m.stamina - dt); if (m.stamina === 0) m.exhausted = true; }
  else { m.stamina = Math.min(STAMINA, m.stamina + dt * STAMINA_RECOVERY); if (m.stamina >= STAMINA * 0.25) m.exhausted = false; }

  const tx = wx * top, tz = wz * top;
  const dvx = tx - s.vel.x, dvz = tz - s.vel.z, dv = Math.hypot(dvx, dvz), maxDv = ACCEL * dt;
  if (dv > maxDv) { s.vel.x += (dvx / dv) * maxDv; s.vel.z += (dvz / dv) * maxDv; } else { s.vel.x = tx; s.vel.z = tz; }

  let nx = s.pos.x + s.vel.x * dt, nz = s.pos.z + s.vel.z * dt;
  if (s.onGround && !walkable(t, s.pos.x, s.pos.z, nx, nz)) {
    nx = s.pos.x; nz = s.pos.z; s.vel.x = 0; s.vel.z = 0;
  }
  [nx, nz] = pushOut(t, nx, nz, obstacles);
  s.pos.x = nx; s.pos.z = nz;

  if (s.onGround && c.jump && s.stance === 'stand' && m.stanceTimer === 0) { s.vel.y = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT); s.onGround = false; }
  const ground = groundAt(t, s.pos.x, s.pos.z);
  let out: MoveOutcome = null;
  if (!s.onGround || s.pos.y > ground + 0.05) {
    s.vel.y -= GRAVITY * dt;
    s.pos.y += s.vel.y * dt;
    s.onGround = false;
    if (s.pos.y <= ground) {
      const impact = -s.vel.y;
      s.pos.y = ground; s.vel.y = 0; s.onGround = true;
      if (impact > FALL_SAFE) out = { t: 'fall', damage: (impact - FALL_SAFE) * FALL_DAMAGE };
    }
  } else { s.pos.y = ground; s.vel.y = 0; s.onGround = true; }

  for (const u of units) {
    if (!u.alive || !u.def.move || u.def.move.air || u.def.category === 'infantry') continue;
    const hit = inBox(u, s.pos.x, s.pos.z, SOLDIER_RADIUS);
    if (!hit) continue;
    if (Math.hypot(u.vel.x, u.vel.z) > RUN_OVER_SPEED) return { t: 'runOver', by: u.id };
    const [px, pz] = outOfBox(u, s.pos.x, s.pos.z, SOLDIER_RADIUS);
    s.pos.x = px; s.pos.z = pz;
  }
  return out;
}

function walkable(t: Terrain, x0: number, z0: number, x1: number, z1: number) {
  if (waterDepth(t, x1, z1) > WADE_DEPTH) return false;
  const rise = groundAt(t, x1, z1) - groundAt(t, x0, z0);
  if (rise <= 0) return true;
  return t.onBridge(x1, z1, 4) !== null || t.normalAt(x1, z1).y >= SLOPE_COS;
}

export function pushOut(t: Terrain, x: number, z: number, obstacles: readonly Obstacle[] = []): [number, number] {
  for (const o of obstacles) { const p = pushOutOf(o, x, z, SOLDIER_RADIUS); if (p) [x, z] = p; }
  for (const tr of t.treesNear(x, z)) {
    const dx = x - tr.x, dz = z - tr.z, d = Math.hypot(dx, dz), min = TRUNK_RADIUS + SOLDIER_RADIUS;
    if (d < min && d > 1e-6) { x = tr.x + (dx / d) * min; z = tr.z + (dz / d) * min; }
  }
  for (const b of t.buildings) {
    const hx = b.w / 2 + SOLDIER_RADIUS, hz = b.d / 2 + SOLDIER_RADIUS;
    const dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) continue;
    if (hx - Math.abs(dx) < hz - Math.abs(dz)) x = b.x + Math.sign(dx || 1) * hx;
    else z = b.z + Math.sign(dz || 1) * hz;
  }
  return [x, z];
}

function local(u: Unit, x: number, z: number) {
  const dx = x - u.pos.x, dz = z - u.pos.z, c = Math.cos(u.yaw), s = Math.sin(u.yaw);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c, c, s };
}

function inBox(u: Unit, x: number, z: number, r: number) {
  const { lx, lz } = local(u, x, z);
  return Math.abs(lx) < u.def.size[0] / 2 + r && Math.abs(lz) < u.def.size[2] / 2 + r;
}

function outOfBox(u: Unit, x: number, z: number, r: number): [number, number] {
  const { lx, lz, c, s } = local(u, x, z);
  const hx = u.def.size[0] / 2 + r, hz = u.def.size[2] / 2 + r;
  let ox = lx, oz = lz;
  if (hx - Math.abs(lx) < hz - Math.abs(lz)) ox = Math.sign(lx || 1) * hx; else oz = Math.sign(lz || 1) * hz;
  return [u.pos.x + ox * c + oz * s, u.pos.z - ox * s + oz * c];
}

export function vaultOver(s: SoldierState, obstacles: readonly Obstacle[]): Vault | null {
  const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
  const px = s.pos.x + fx * VAULT_REACH, pz = s.pos.z + fz * VAULT_REACH;
  for (const o of obstacles) {
    if (o.h > VAULT_HEIGHT) continue;
    const [lx, lz] = toLocal(o, px, pz);
    if (Math.abs(lx) > o.w / 2 + SOLDIER_RADIUS || Math.abs(lz) > o.d / 2 + SOLDIER_RADIUS) continue;
    let entered = false;
    for (let k = 1; k <= 40; k++) {
      const tx = s.pos.x + fx * k * 0.25, tz = s.pos.z + fz * k * 0.25;
      const [ax, az] = toLocal(o, tx, tz);
      const inside = Math.abs(ax) <= o.w / 2 + SOLDIER_RADIUS + 0.05 && Math.abs(az) <= o.d / 2 + SOLDIER_RADIUS + 0.05;
      if (inside) entered = true;
      else if (entered) return { t: 0, fx: s.pos.x, fz: s.pos.z, tx, tz };
    }
  }
  return null;
}
