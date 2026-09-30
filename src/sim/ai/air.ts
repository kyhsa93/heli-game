import { G3 } from '../heli/airframe';
import type { Unit } from '../units';
import type { World } from '../world';
import { AIR_ALTITUDE } from './movement';

export const ORBIT_RADIUS = 1200;
export const ORBIT_SPEED = 45;
export const ORBIT_CORRECTION = 0.35;
export const WRECK_EXPLOSION = 8;

export function isAir(u: Unit) {
  return !!u.def.move?.air;
}

function hunting(world: World, u: Unit) {
  return world.huntsPlayer(u) && !u.passive && u.ai.state === 'engage' && u.ai.detected;
}

function orbit(world: World, u: Unit, dt: number) {
  const h = world.playerBody(), t = world.terrain;
  const dx = u.pos.x - h.pos.x, dz = u.pos.z - h.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const rx = dx / d, rz = dz / d;
  const dir = (u.id % 2 ? 1 : -1);
  const tx = -rz * dir, tz = rx * dir;
  const radial = Math.max(-1, Math.min(1, (ORBIT_RADIUS - d) / ORBIT_RADIUS / ORBIT_CORRECTION));
  let vx = tx + rx * radial, vz = tz + rz * radial;
  const n = Math.hypot(vx, vz) || 1;
  const speed = Math.min(u.def.move!.speed, ORBIT_SPEED + Math.max(0, d - ORBIT_RADIUS * 1.5) * 0.02);
  vx = vx / n * speed; vz = vz / n * speed;
  u.pos.x += vx * dt; u.pos.z += vz * dt;
  const ground = t.surfaceAt(u.pos.x, u.pos.z);
  u.pos.y = Math.max(u.pos.y + (ground + AIR_ALTITUDE - u.pos.y) * Math.min(1, dt * 0.8), ground + 10);
  u.vel.set(vx, 0, vz);
  u.yaw = Math.atan2(dx, dz);
}

function fall(world: World, u: Unit, dt: number) {
  const ground = world.terrain.surfaceAt(u.pos.x, u.pos.z);
  if (u.pos.y <= ground + 1e-6) return;
  u.vel.y -= G3 * dt;
  u.pos.addScaledVector(u.vel, dt);
  u.vel.x *= 1 - 0.3 * dt; u.vel.z *= 1 - 0.3 * dt;
  const below = world.terrain.surfaceAt(u.pos.x, u.pos.z);
  if (u.pos.y <= below) {
    u.pos.y = below;
    u.vel.set(0, 0, 0);
    world.emit({ t: 'explosion', pos: u.pos.clone(), size: WRECK_EXPLOSION });
  }
}

export function stepAir(world: World, dt: number) {
  for (const u of world.units) {
    if (!isAir(u)) continue;
    if (!u.alive) fall(world, u, dt);
    else if (world.playerBody().alive && hunting(world, u)) orbit(world, u, dt);
  }
}
