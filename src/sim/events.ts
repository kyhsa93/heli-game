import type { Vector3 } from 'three';
import type { Side } from './units';

export type CrashReason =
  | 'rotorStrike' | 'terrain' | 'water' | 'tree' | 'building'
  | 'ditched' | 'hardLanding' | 'slideLanding' | 'tiltLanding' | 'slope';

export type SimEvent =
  | { t: 'crash'; reason: CrashReason; value?: number }
  | { t: 'landed'; descent: number }
  | { t: 'engine'; on: boolean; cause?: 'fuel' }
  | { t: 'refuel' }
  | { t: 'boundary' }
  | { t: 'objective'; id: string; state: 'done' | 'failed' }
  | { t: 'unitDestroyed'; id: number; defId: string; side: Side; byPlayer: boolean }
  | { t: 'explosion'; pos: Vector3; size: number }
  | { t: 'fire'; weapon: string; pos: Vector3; dir: Vector3; owner: number; tracer: boolean }
  | { t: 'impact'; weapon: string; pos: Vector3; unit?: number; ground: boolean }
  | { t: 'advice'; code: AdviceCode; value?: number };

export type AdviceCode = 'landingTooHard' | 'wrongPad';

export type Emit = (e: SimEvent) => void;
