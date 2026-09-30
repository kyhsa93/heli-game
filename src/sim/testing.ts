import type { SimEvent } from './events';
import { hoverCollective as hoverFor } from './heli/loadout';
import { agl, updateQ } from './heli/state';
import { Vector3 } from 'three';
import { AI_TICK, stepAwareness, type Conditions } from './ai/awareness';
import { stepBrains } from './ai/brain';
import { GEAR_Y } from './heli/airframe';
import { LosCache, terrainClear } from './los';
import { STEP, World } from './world';
import { AIR_ALTITUDE } from './ai/movement';
import { ORBIT_RADIUS } from './ai/air';

const DAY: Conditions = { night: false, fog: false, playerRadar: false };

export function hoverCollective(world: World) {
  return hoverFor(world.grossWeight);
}

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
    world.controls.collective = Math.min(1, Math.max(0, hoverCollective(world) + err * 0.3));
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
    c.collective = Math.min(1, Math.max(0, hoverCollective(world) + err * 0.3));
  };
}

export function airborneAt(world: World, x: number, z: number, y: number) {
  const h = world.player;
  h.engineOn = true; h.rpm = 1; h.landed = false;
  h.pos.set(x, y, z); h.vel.set(0, 0, 0);
  h.pitch = h.roll = 0; h.pRate = h.rRate = h.yRate = 0;
  updateQ(h);
}

export function putPlayer(world: World, x: number, z: number, aglM: number) {
  const h = world.player;
  h.pos.set(x, world.terrain.surfaceAt(x, z) - GEAR_Y + aglM, z);
  h.vel.set(0, 0, 0);
}

export function runAi(world: World, los: LosCache, seconds: number, cond: Conditions = DAY, until?: () => boolean, brains = false) {
  const t0 = world.time;
  for (let t = 0; t < seconds; t += AI_TICK) {
    world.time += AI_TICK;
    stepAwareness(world, los, cond);
    if (brains) stepBrains(world);
    world.events.flush();
    if (until?.()) return world.time - t0;
  }
  return Infinity;
}

export function openPair(world: World, dist: number, lowAgl = 9) {
  const HALF = world.terrain.half;
  for (let i = 0; i < 3000; i++) {
    const x = ((i * 7919) % 173) / 173 * HALF * 1.4 - HALF * 0.7, z = ((i * 104729) % 181) / 181 * HALF * 1.4 - HALF * 0.7;
    if (world.terrain.heightAt(x, z) < 1) continue;
    const ang = (i % 8) * Math.PI / 4;
    const px = x + Math.sin(ang) * dist, pz = z + Math.cos(ang) * dist;
    if (Math.abs(px) > HALF - 100 || Math.abs(pz) > HALF - 100 || world.terrain.heightAt(px, pz) < 1) continue;
    const eye = new Vector3(x, world.terrain.surfaceAt(x, z) + 4.4, z);
    const low = new Vector3(px, world.terrain.surfaceAt(px, pz) + lowAgl - GEAR_Y, pz);
    if (!terrainClear(world.terrain, eye, low)) continue;
    const trees = world.terrain.treesNear(px, pz).concat(world.terrain.treesNear(x, z));
    if (trees.length) continue;
    return { unit: new Vector3(x, 0, z), player: new Vector3(px, 0, pz) };
  }
  throw new Error('no open pair');
}

export function hiddenPair(world: World, dist = 1200) {
  const HALF = world.terrain.half;
  for (let i = 0; i < 3000; i++) {
    const x = ((i * 7919) % 173) / 173 * HALF * 1.4 - HALF * 0.7, z = ((i * 104729) % 181) / 181 * HALF * 1.4 - HALF * 0.7;
    const ang = (i % 8) * Math.PI / 4;
    const px = x + Math.sin(ang) * dist, pz = z + Math.cos(ang) * dist;
    if (Math.abs(px) > HALF - 100 || Math.abs(pz) > HALF - 100) continue;
    const eye = new Vector3(x, world.terrain.surfaceAt(x, z) + 4.4, z);
    const p = new Vector3(px, world.terrain.surfaceAt(px, pz) + 20, pz);
    if (world.terrain.surfaceAt((x + px) / 2, (z + pz) / 2) > Math.max(eye.y, p.y) + 30) return { unit: new Vector3(x, 0, z), player: new Vector3(px, 0, pz) };
  }
  throw new Error('no hidden pair');
}

export function popupPair(world: World, dist = 2500, low = 25, high = 300, shadow = 0) {
  const HALF = world.terrain.half;
  for (let i = 0; i < 4000; i++) {
    const x = ((i * 7919) % 173) / 173 * HALF * 1.4 - HALF * 0.7, z = ((i * 104729) % 181) / 181 * HALF * 1.4 - HALF * 0.7;
    if (world.terrain.heightAt(x, z) < 1) continue;
    const ang = (i % 8) * Math.PI / 4;
    const px = x + Math.sin(ang) * dist, pz = z + Math.cos(ang) * dist;
    if (Math.abs(px) > HALF - 100 || Math.abs(pz) > HALF - 100) continue;
    const eye = new Vector3(x, world.terrain.surfaceAt(x, z) + 4, z);
    const g = world.terrain.surfaceAt(px, pz);
    const lowP = new Vector3(px, g + low, pz), highP = new Vector3(px, g + high, pz);
    if (terrainClear(world.terrain, eye, lowP) || !terrainClear(world.terrain, eye, highP)) continue;
    let hidden = true;
    for (let k = 0.05; k <= shadow && hidden; k += 0.05) hidden = !terrainClear(world.terrain, eye.clone().lerp(highP, k), lowP);
    if (!hidden) continue;
    return { unit: new Vector3(x, 0, z), low: lowP, high: highP };
  }
  throw new Error('no pop-up pair');
}

export function skyPair(world: World, dist: number, playerAgl = 400) {
  const HALF = world.terrain.half, t = world.terrain;
  for (let i = 0; i < 3000; i++) {
    const x = ((i * 7919) % 173) / 173 * HALF * 1.2 - HALF * 0.6, z = ((i * 104729) % 181) / 181 * HALF * 1.2 - HALF * 0.6;
    const ang = (i % 8) * Math.PI / 4;
    const hx = x + Math.sin(ang) * dist, hz = z + Math.cos(ang) * dist;
    if (Math.abs(hx) > HALF - 300 || Math.abs(hz) > HALF - 300) continue;
    const player = new Vector3(x, t.surfaceAt(x, z) + playerAgl, z);
    let clear = true;
    for (let k = 0; k < 6 && clear; k++) {
      const a = k * Math.PI / 3, r = ORBIT_RADIUS;
      const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
      clear = terrainClear(t, player, new Vector3(px, t.surfaceAt(px, pz) + AIR_ALTITUDE, pz));
    }
    const heli = new Vector3(hx, t.surfaceAt(hx, hz) + AIR_ALTITUDE, hz);
    if (clear && terrainClear(t, player, heli)) return { player, heli };
  }
  throw new Error('no sky pair');
}
