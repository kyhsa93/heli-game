import { Vector3 } from 'three';
import { SPEED } from './movement';
import { soldierEye, type SoldierState } from './soldier';

export const DETECT_RANGE = { stand: 400, crouch: 250, prone: 120 } as const;
export const MOVE_FACTOR = { still: 0.7, walk: 1, sprint: 1.3 } as const;
export const PARTIAL_COVER = 0.5;
export const FIRE_REVEAL = 600;
export const FIRE_REVEAL_TIME = 1;
export const DETECT_RATE = 2;

export function moveState(s: SoldierState): keyof typeof MOVE_FACTOR {
  const v = Math.hypot(s.vel.x, s.vel.z);
  return v < 0.3 ? 'still' : v > SPEED.run + 0.2 ? 'sprint' : 'walk';
}

export function detectRange(s: SoldierState, partial: boolean) {
  return DETECT_RANGE[s.stance] * MOVE_FACTOR[moveState(s)] * (partial ? PARTIAL_COVER : 1);
}

export function revealedByFire(lastShot: number, now: number, dist: number) {
  return now - lastShot <= FIRE_REVEAL_TIME && dist <= FIRE_REVEAL;
}

const eye = new Vector3();

export function soldierTarget(s: SoldierState) {
  return soldierEye(s, eye);
}
