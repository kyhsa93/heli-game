import { Vector3 } from 'three';
import { DEG } from '../../core/math';
import { terrainClear } from '../los';
import type { Unit } from '../units';
import type { World } from '../world';

export const SEARCHLIGHT_TYPE = 'searchlight';
export const SEARCHLIGHT_RANGE = 2500;
export const BEAM_HALF = 5 * DEG;
export const LIT_RADIUS = 800;
export const SWEEP_PERIOD = 14;
export const SWEEP_YAW = 60 * DEG;
export const TRACK_SECONDS = 3;
export const BEAM_TURN = 25 * DEG;

export interface Beam { yaw: number; pitch: number; lost: number; lit: boolean }

export function isSearchlight(u: Unit) {
  return u.defId === SEARCHLIGHT_TYPE;
}

export function lampPosition(u: Unit, out = new Vector3()) {
  return out.set(u.pos.x, u.pos.y + u.def.size[1], u.pos.z);
}

export function beamDirection(b: Beam, out = new Vector3()) {
  const cp = Math.cos(b.pitch);
  return out.set(-Math.sin(b.yaw) * cp, Math.sin(b.pitch), -Math.cos(b.yaw) * cp);
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function stepSearchlights(world: World, dt: number) {
  const night = world.conditions.time === 'night';
  const h = world.player, lamp = new Vector3(), to = new Vector3(), dir = new Vector3();
  for (const u of world.units) {
    if (!isSearchlight(u)) continue;
    const b = u.beam ??= { yaw: u.yaw, pitch: 25 * DEG, lost: TRACK_SECONDS, lit: false };
    b.lit = false;
    if (!u.alive || !night) continue;
    lampPosition(u, lamp);
    to.copy(h.pos).sub(lamp);
    const dist = to.length();
    const visible = h.alive && dist <= SEARCHLIGHT_RANGE && terrainClear(world.terrain, lamp, h.pos);
    const inBeam = visible && to.normalize().dot(beamDirection(b, dir)) >= Math.cos(BEAM_HALF);
    if (inBeam) b.lost = 0;
    else b.lost += dt;
    if (visible && b.lost < TRACK_SECONDS) {
      const yaw = Math.atan2(-to.x, -to.z), pitch = Math.asin(Math.max(-1, Math.min(1, to.y)));
      const step = BEAM_TURN * dt;
      b.yaw += Math.max(-step, Math.min(step, wrap(yaw - b.yaw)));
      b.pitch += Math.max(-step, Math.min(step, pitch - b.pitch));
    } else {
      const t = world.time / SWEEP_PERIOD * Math.PI * 2 + u.id;
      b.yaw = u.yaw + Math.sin(t) * SWEEP_YAW;
      b.pitch = (25 + 15 * Math.sin(t * 1.7)) * DEG;
    }
    b.lit = inBeam;
  }
}

export function litBy(world: World, u: Unit): boolean {
  for (const s of world.units) if (isSearchlight(s) && s.alive && s.beam?.lit && s.pos.distanceTo(u.pos) <= LIT_RADIUS) return true;
  return false;
}
