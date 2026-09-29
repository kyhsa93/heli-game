import { Vector3 } from 'three';
import { clamp, DEG } from '../../core/math';
import { toWorld, type HeliState } from '../heli/state';

export const TADS_POS = new Vector3(0, -0.72, -6.55);
export const TADS_FOVS = [30, 10, 3, 1] as const;
export const TADS_FOV_NAMES = ['WFOV', 'MFOV', 'NFOV', 'ZOOM'] as const;
export const TADS_LIMITS = { az: 120 * DEG, up: 30 * DEG, down: -60 * DEG };

export type TadsSensor = 'tv' | 'flir';

export interface Tads {
  active: boolean;
  az: number;
  el: number;
  fov: number;
  sensor: TadsSensor;
}

export function createTads(): Tads {
  return { active: false, az: 0, el: -5 * DEG, fov: 0, sensor: 'tv' };
}

export function tadsFovDeg(t: Tads) {
  return TADS_FOVS[t.fov];
}

export function slewTads(t: Tads, dYaw: number, dPitch: number) {
  const k = tadsFovDeg(t) / TADS_FOVS[0];
  t.az = clamp(t.az + dYaw * k, -TADS_LIMITS.az, TADS_LIMITS.az);
  t.el = clamp(t.el + dPitch * k, TADS_LIMITS.down, TADS_LIMITS.up);
}

export function zoomTads(t: Tads, step: 1 | -1) {
  t.fov = clamp(t.fov + step, 0, TADS_FOVS.length - 1);
}

export function tadsPosition(h: HeliState, out = new Vector3()) {
  return toWorld(h, TADS_POS, out);
}

export function tadsDirection(h: HeliState, t: Tads, out = new Vector3()) {
  const cp = Math.cos(t.el);
  return out.set(-Math.sin(t.az) * cp, Math.sin(t.el), -Math.cos(t.az) * cp).applyQuaternion(h.q).normalize();
}
