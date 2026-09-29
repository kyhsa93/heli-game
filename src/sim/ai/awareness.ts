import { Vector3 } from 'three';
import { clamp } from '../../core/math';
import { agl } from '../heli/state';
import type { LosCache } from '../los';
import type { Terrain } from '../terrain';
import type { Unit } from '../units';
import type { World } from '../world';

export const AI_TICK = 0.1;
export const BASE_RATE = 0.6;
export const VIS_RANGE_DAY = 4000;
export const VIS_RANGE_NIGHT = 1500;
export const LOW_AGL = 30 * 0.3048;
export const SLOW = 10 * 0.514444;
export const LOW_EXPOSURE = 0.35;
export const SKYLINE = 1.5;
export const NOISE_RANGE = 1500;
export const NOISE = 1.5;
export const NOISE_SUSPECT_RATE = 0.1;
export const SUSPECT = 0.3;
export const FOG = 0.5;
export const DECAY = 0.15;
export const MEMORY = 20;
export const ALERT_RADIUS = 1000;
export const ALERT_LEVEL = 0.5;
export const RADAR_CLUTTER_AGL = 50 * 0.3048;
export const RADAR_P_LOW = 0.05;
export const RADAR_P = 0.5;
export const RADAR_ACQUIRE = 2;
export const SAM_LINK_RANGE = 6000;
export const RADAR_LOST_FACTOR = 0.5;

export function linkedRadars(world: World, u: Unit) {
  return world.units.filter(o => o.defId === 'sam_radar' && o.side === u.side && o.pos.distanceTo(u.pos) <= SAM_LINK_RANGE);
}

export interface Conditions { night: boolean; fog: boolean; playerRadar: boolean }

export function eyeOf(u: Unit, out = new Vector3()) {
  return out.set(u.pos.x, u.pos.y + u.def.size[1] + 2, u.pos.z);
}

export function skylined(t: Terrain, eye: Vector3, target: Vector3, reach = 3000) {
  const d = target.clone().sub(eye).normalize();
  for (let s = 50; s <= reach; s += 50) {
    const p = target.clone().addScaledVector(d, s);
    if (t.surfaceAt(p.x, p.z) > p.y) return false;
  }
  return true;
}

export function visualRate(world: World, eye: Vector3, occlusion: number, cond: Conditions) {
  const h = world.player;
  const dist = eye.distanceTo(h.pos);
  const range = cond.night ? VIS_RANGE_NIGHT : VIS_RANGE_DAY;
  const distF = Math.pow(clamp(1 - dist / range, 0, 1), 1.5);
  if (distF <= 0) return 0;
  const low = agl(h, world.terrain) <= LOW_AGL && Math.hypot(h.vel.x, h.vel.z) <= SLOW;
  let exposure = low ? LOW_EXPOSURE : 1;
  if (skylined(world.terrain, eye, h.pos)) exposure *= SKYLINE;
  const noise = dist <= NOISE_RANGE ? NOISE : 1;
  const light = cond.fog ? FOG : 1;
  return BASE_RATE * distF * exposure * noise * light * (1 - occlusion);
}

function detect(world: World, u: Unit, by: 'visual' | 'radar') {
  const ai = u.ai;
  ai.awareness = 1;
  ai.lastSeen = world.player.pos.clone();
  ai.lastSeenAt = world.time;
  if (ai.detected) return;
  ai.detected = true;
  world.emit({ t: 'detected', id: u.id, by });
  for (const o of world.units) {
    if (o === u || !o.alive || o.side !== u.side || o.def.detect === 'none') continue;
    if (o.pos.distanceTo(u.pos) <= ALERT_RADIUS && o.ai.awareness < ALERT_LEVEL) o.ai.awareness = ALERT_LEVEL;
  }
}

function forget(world: World, u: Unit, dt: number) {
  const ai = u.ai;
  ai.awareness = Math.max(0, ai.awareness - DECAY * dt);
  if (ai.detected && ai.awareness < 1) ai.detected = false;
  if (ai.lastSeen && world.time - ai.lastSeenAt > MEMORY) ai.lastSeen = null;
}

function setRadar(world: World, u: Unit, mode: Unit['ai']['radar']) {
  if (u.ai.radar === mode) return;
  const was = u.ai.radar;
  u.ai.radar = mode;
  if (mode === 'track' || was === 'track') world.emit({ t: 'radarTrack', id: u.id, on: mode === 'track' });
}

export function stepAwareness(world: World, los: LosCache, cond: Conditions, dt = AI_TICK) {
  const h = world.player;
  if (!h.alive) return;
  const eye = new Vector3();
  for (const u of world.units) {
    if (!u.alive || u.side !== 'veros' || u.def.detect === 'none' || u.passive) continue;
    eyeOf(u, eye);
    const dist = eye.distanceTo(h.pos);
    if (u.def.detect === 'radar' && u.def.radar) {
      const r = u.def.radar;
      if (u.ai.jammed > 0) { u.ai.jammed = Math.max(0, u.ai.jammed - dt); setRadar(world, u, 'search'); continue; }
      const link = u.defId === 'sam_short' ? linkedRadars(world, u) : [];
      const search = link.length && link.every(o => !o.alive) ? r.search * RADAR_LOST_FACTOR : r.search;
      const cued = link.some(o => o.alive && o.ai.radar !== 'search');
      const seen = dist <= search && los.radar(u.id, eye, h.pos, world.time);
      if (!seen) {
        setRadar(world, u, 'search');
        u.ai.radarTimer = 0;
        forget(world, u, dt);
        continue;
      }
      if (u.ai.radar === 'search') {
        const p = cond.playerRadar || cued ? 1 : agl(h, world.terrain) < RADAR_CLUTTER_AGL ? RADAR_P_LOW : RADAR_P;
        if (world.rng() < p) { setRadar(world, u, 'acquire'); u.ai.radarTimer = 0; detect(world, u, 'radar'); }
        else forget(world, u, dt);
      } else {
        detect(world, u, 'radar');
        u.ai.radarTimer += dt;
        if (u.ai.radar === 'acquire' && u.ai.radarTimer >= RADAR_ACQUIRE && dist <= (r.track ?? r.search)) setRadar(world, u, 'track');
      }
      continue;
    }
    const range = cond.night ? VIS_RANGE_NIGHT : VIS_RANGE_DAY;
    const sight = dist <= range ? los.visual(u.id, eye, h.pos, world.time) : { clear: false, occlusion: 1 };
    if (sight.clear) {
      u.ai.awareness = Math.min(1, u.ai.awareness + visualRate(world, eye, sight.occlusion, cond) * dt);
      if (u.ai.awareness >= 1) detect(world, u, 'visual');
    } else {
      forget(world, u, dt);
      if (dist <= NOISE_RANGE && u.ai.awareness < SUSPECT) u.ai.awareness = Math.min(SUSPECT, u.ai.awareness + (NOISE_SUSPECT_RATE + DECAY) * dt);
    }
  }
}
