import type { Vector3 } from 'three';
import type { LoadoutDef } from './heli/loadout';
import type { SoldierClass } from './infantry/soldier';

export type AvatarKind = 'heli' | 'soldier' | 'dead';

export type Avatar = { kind: 'heli' } | { kind: 'soldier' } | { kind: 'dead' };

export interface PlayerBody {
  kind: AvatarKind;
  pos: Vector3;
  vel: Vector3;
  alive: boolean;
  agl: number;
  heat: number;
  radius: number;
}

export type HeliSpawn =
  | { kind: 'heli'; at: 'pad'; pad: number; kit: LoadoutDef; running?: boolean }
  | { kind: 'heli'; at: 'air'; x: number; z: number; agl: number; headingDeg: number; kit: LoadoutDef; speed?: number };

export interface SoldierSpawn { kind: 'soldier'; x: number; z: number; headingDeg: number; cls: SoldierClass }

export type AvatarSpawn = HeliSpawn | SoldierSpawn;
