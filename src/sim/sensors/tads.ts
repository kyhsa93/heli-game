import { Quaternion, Vector3 } from 'three';
import { clamp, DEG, wrapPi } from '../../core/math';
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

export interface Look { az: number; el: number }

export function createTads(): Tads {
  return { active: false, az: 0, el: -5 * DEG, fov: 0, sensor: 'tv' };
}

export function tadsFovDeg(t: Tads) {
  return TADS_FOVS[t.fov];
}

export function slewTads(t: Tads, dYaw: number, dPitch: number) {
  const k = tadsFovDeg(t) / TADS_FOVS[0];
  t.az = wrapPi(t.az + dYaw * k);
  t.el = clamp(t.el + dPitch * k, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
}

export function zoomTads(t: Tads, step: 1 | -1) {
  t.fov = clamp(t.fov + step, 0, TADS_FOVS.length - 1);
}

export function tadsPosition(h: HeliState, out = new Vector3()) {
  return toWorld(h, TADS_POS, out);
}

export function lookVector(az: number, el: number, out = new Vector3()) {
  const cp = Math.cos(el);
  return out.set(-Math.sin(az) * cp, Math.sin(el), -Math.cos(az) * cp);
}

export function lookAngles(d: Vector3, out: Look = { az: 0, el: 0 }): Look {
  out.az = Math.atan2(-d.x, -d.z);
  out.el = Math.asin(clamp(d.y, -1, 1));
  return out;
}

export function tadsDirection(t: Tads, out = new Vector3()) {
  return lookVector(t.az, t.el, out);
}

const inv = new Quaternion();
const tmp = new Vector3();

export function tadsLocal(h: HeliState, t: Tads, out: Look = { az: 0, el: 0 }) {
  return lookAngles(tadsDirection(t, tmp).applyQuaternion(inv.copy(h.q).invert()), out);
}

export function pointTads(h: HeliState, t: Tads, local: Look) {
  lookAngles(lookVector(local.az, local.el, tmp).applyQuaternion(h.q), t);
}

export function constrainTads(h: HeliState, t: Tads) {
  const l = tadsLocal(h, t);
  const az = clamp(l.az, -TADS_LIMITS.az, TADS_LIMITS.az), el = clamp(l.el, TADS_LIMITS.down, TADS_LIMITS.up);
  if (az !== l.az || el !== l.el) pointTads(h, t, { az, el });
  return az !== l.az || el !== l.el;
}
