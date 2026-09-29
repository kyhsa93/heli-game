import { Quaternion, Vector3 } from 'three';
import { DEG } from '../../core/math';
import { toWorld, type HeliState } from '../heli/state';
import { WEAPONS } from './damage';

export const GUN_MUZZLE = new Vector3(0, -1.2, -5.0);
export const GUN_LIMITS = { az: 86 * DEG, up: 11 * DEG, down: -60 * DEG };

export type WeaponId = 'gun30' | 'hydra70';
export type Salvo = 1 | 2 | 4;
export const SALVOS: readonly Salvo[] = [1, 2, 4];

export interface Arms {
  selected: WeaponId;
  gunAmmo: number;
  gunTimer: number;
  shots: number;
  salvo: Salvo;
  salvoLeft: number;
  rocketTimer: number;
  rocketsFired: number;
  trigger: boolean;
}

export interface Aim { yaw: number; pitch: number }

export function createArms(gunAmmo = 1200): Arms {
  return { selected: 'gun30', gunAmmo, gunTimer: 0, shots: 0, salvo: 1, salvoLeft: 0, rocketTimer: 0, rocketsFired: 0, trigger: false };
}

export function gunInLimits(aim: Aim) {
  return Math.abs(aim.yaw) <= GUN_LIMITS.az && aim.pitch <= GUN_LIMITS.up && aim.pitch >= GUN_LIMITS.down;
}

export function aimDirection(h: HeliState, aim: Aim, out = new Vector3()) {
  const cp = Math.cos(aim.pitch);
  return out.set(-Math.sin(aim.yaw) * cp, Math.sin(aim.pitch), -Math.cos(aim.yaw) * cp).applyQuaternion(h.q).normalize();
}

export function muzzlePosition(h: HeliState, out = new Vector3()) {
  return toWorld(h, GUN_MUZZLE, out);
}

export const GUN_INTERVAL = 1 / (WEAPONS.gun30.rate ?? 10);

const inv = new Quaternion();

export function aimToward(h: HeliState, target: Vector3, out: Aim = { yaw: 0, pitch: 0 }): Aim {
  const d = target.clone().sub(muzzlePosition(h)).applyQuaternion(inv.copy(h.q).invert()).normalize();
  out.yaw = Math.atan2(-d.x, -d.z);
  out.pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
  return out;
}
