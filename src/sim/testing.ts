import type { SimEvent } from './events';
import { G3, MAX_THRUST } from './heli/airframe';
import { agl, updateQ } from './heli/state';
import { STEP, World } from './world';

export const hoverCollective = G3 / MAX_THRUST;

export function makeWorld(seed = 7) {
  const world = new World({ seed });
  world.active = true;
  const events: SimEvent[] = [];
  world.events.onAny(e => events.push(e));
  return { world, events };
}

export function run(world: World, seconds: number, each?: () => void) {
  for (let i = 0; i < seconds * 120; i++) { each?.(); world.step(STEP); }
}

export function holdClimb(world: World, target: number) {
  return () => {
    const err = target - world.player.vel.y;
    world.controls.collective = Math.min(1, Math.max(0, hoverCollective + err * 0.3));
  };
}

export function descend(world: World, hold?: { x: number; z: number }) {
  return () => {
    const h = world.player, c = world.controls;
    if (h.landed) { c.collective = 0.2; c.cyclicX = c.cyclicY = 0; return; }
    if (hold) {
      const ax = (hold.x - h.pos.x) * 0.4 - h.vel.x * 1.2, az = (hold.z - h.pos.z) * 0.4 - h.vel.z * 1.2;
      const fx = -Math.sin(h.yaw), fz = -Math.cos(h.yaw), rx = Math.cos(h.yaw), rz = -Math.sin(h.yaw);
      c.cyclicY = Math.max(-1, Math.min(1, (ax * fx + az * fz) / 4));
      c.cyclicX = Math.max(-1, Math.min(1, (ax * rx + az * rz) / 4));
    }
    const target = -Math.min(4, Math.max(1, agl(h, world.terrain) * 0.3));
    const err = target - h.vel.y;
    c.collective = Math.min(1, Math.max(0, hoverCollective + err * 0.3));
  };
}

export function airborneAt(world: World, x: number, z: number, y: number) {
  const h = world.player;
  h.engineOn = true; h.rpm = 1; h.landed = false;
  h.pos.set(x, y, z); h.vel.set(0, 0, 0);
  h.pitch = h.roll = 0; h.pRate = h.rRate = h.yRate = 0;
  updateQ(h);
}
