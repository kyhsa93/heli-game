import { Vector3 } from 'three';
import { DEG } from '../../core/math';
import { ROTOR_Y } from '../heli/airframe';
import { toWorld, type HeliState } from '../heli/state';
import { radarSight } from '../los';
import type { Terrain } from '../terrain';
import type { Unit } from '../units';
import { unitCenter } from './laser';

export const FCR_SCAN_SECONDS = 3;
export const FCR_RANGE = 8000;
export const FCR_GROUND_HALF = 45 * DEG;
export const FCR_MAX_TARGETS = 16;
export const FCR_STALE_SECONDS = 30;
export const FCR_DOME = new Vector3(0, ROTOR_Y + 0.55, 0);

export type FcrMode = 'ground' | 'air';
export type FcrClass = 'airDefense' | 'tracked' | 'wheeled' | 'heli';

export interface FcrTarget { unitId: number; pos: Vector3; cls: FcrClass; range: number; bearing: number; time: number; moving: boolean }

export interface Fcr {
  unlocked: boolean;
  mode: FcrMode;
  scanning: boolean;
  scanT: number;
  scans: number;
  targets: FcrTarget[];
  selected: number;
}

export function createFcr(): Fcr {
  return { unlocked: true, mode: 'ground', scanning: false, scanT: 0, scans: 0, targets: [], selected: 0 };
}

const PRIORITY: Record<FcrClass, number> = { airDefense: 0, heli: 0, tracked: 1, wheeled: 2 };

export function fcrClass(u: Unit): FcrClass | null {
  if (u.def.radar || u.def.category === 'airDefense') return 'airDefense';
  if (u.def.category === 'tracked') return 'tracked';
  if (u.def.category === 'vehicle') return 'wheeled';
  if (u.def.category === 'air') return 'heli';
  return null;
}

export function domePosition(h: HeliState, out = new Vector3()) {
  return toWorld(h, FCR_DOME, out);
}

function wrap(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function scanTargets(t: Terrain, h: HeliState, units: readonly Unit[], mode: FcrMode, time: number): FcrTarget[] {
  const eye = domePosition(h), c = new Vector3();
  const found: FcrTarget[] = [];
  for (const u of units) {
    if (!u.alive) continue;
    const cls = fcrClass(u);
    if (!cls || (mode === 'air') !== (cls === 'heli')) continue;
    unitCenter(u, c);
    const range = c.distanceTo(eye);
    if (range > FCR_RANGE) continue;
    const bearing = Math.atan2(-(c.x - eye.x), -(c.z - eye.z));
    if (mode === 'ground' && Math.abs(wrap(bearing - h.yaw)) > FCR_GROUND_HALF) continue;
    if (!radarSight(t, eye, c)) continue;
    found.push({ unitId: u.id, pos: c.clone(), cls, range, bearing, time, moving: Math.hypot(u.vel.x, u.vel.z) > 1 });
  }
  return found.sort((a, b) => PRIORITY[a.cls] - PRIORITY[b.cls] || a.range - b.range).slice(0, FCR_MAX_TARGETS);
}

export function isStale(t: FcrTarget, now: number) {
  return now - t.time > FCR_STALE_SECONDS;
}

export function selectedTarget(f: Fcr): FcrTarget | null {
  return f.targets[f.selected] ?? null;
}

export function cycleTarget(f: Fcr) {
  if (f.targets.length) f.selected = (f.selected + 1) % f.targets.length;
}
