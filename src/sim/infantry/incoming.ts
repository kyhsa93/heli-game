import { Vector3 } from 'three';
import { squadMembers, type Unit, type UnitWeaponDef } from '../units';
import { moveState } from './awareness';
import type { SoldierState } from './soldier';

export const SQUAD_RIFLE = { rate: 1, p: 0.25, range: 400, damage: 20 };
export const SQUAD_MG_RATE = 2;
export const SNIPER = { rate: 0.25, p: 0.35, range: 800, damage: 80 };
export const STANCE_HIT = { stand: 1, crouch: 0.7, prone: 0.45 } as const;
export const MOVE_HIT = { still: 1, walk: 0.8, sprint: 0.6 } as const;
export const COVER_HIT = 0.5;
export const VEHICLE_DAMAGE_SCALE = 10;

export interface Volley { rate: number; p: number; damage: number }

export function volleyAt(u: Unit, w: UnitWeaponDef | null, s: SoldierState, dist: number, partial: boolean, accuracyScale: number): Volley | null {
  const mod = STANCE_HIT[s.stance] * MOVE_HIT[moveState(s)] * (partial ? COVER_HIT : 1) * accuracyScale;
  if (u.def.squad) {
    const members = squadMembers(u);
    if (!members) return null;
    if (u.def.weapons.some(x => x.id === 'g_sniper')) {
      if (dist > SNIPER.range) return null;
      return { rate: SNIPER.rate * members, p: Math.max(0, SNIPER.p * (1 - (dist / SNIPER.range) ** 2)) * mod, damage: SNIPER.damage };
    }
    if (dist > SQUAD_RIFLE.range) return null;
    const mg = u.def.weapons.some(x => x.id === 'g_lmg');
    return { rate: (mg ? SQUAD_MG_RATE : SQUAD_RIFLE.rate) * members, p: Math.max(0, SQUAD_RIFLE.p * (1 - (dist / SQUAD_RIFLE.range) ** 2)) * mod, damage: SQUAD_RIFLE.damage };
  }
  if (!w || dist > w.range || dist < w.minRange) return null;
  return { rate: w.rate, p: Math.max(0, (w.accuracy ?? 0) * (1 - (dist / w.range) ** 2)) * mod, damage: w.damage * VEHICLE_DAMAGE_SCALE };
}

export function scatter(target: Vector3, dist: number, rng: () => number) {
  return target.clone().add(new Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(4 + dist * 0.01));
}
