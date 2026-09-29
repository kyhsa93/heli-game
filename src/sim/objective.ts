import type { SimEvent } from './events';
import type { World } from './world';

export type ObjectiveState = 'active' | 'done' | 'failed';

export interface RingMarker { x: number; y: number; z: number; radius: number; size: number; state: 'done' | 'next' | 'ahead'; heading: number }

export interface Objective {
  readonly id: string;
  readonly state: ObjectiveState;
  readonly result: Record<string, number>;
  readonly step?: string;
  readonly rings?: readonly RingMarker[];
  readonly failure?: string;
  readonly failureText?: string;
  start(world: World): void;
  tick?(world: World, dt: number): void;
  onEvent(e: SimEvent, world: World): void;
}
