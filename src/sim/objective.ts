import type { SimEvent } from './events';
import type { World } from './world';

export type ObjectiveState = 'active' | 'done' | 'failed';

export interface Objective {
  readonly id: string;
  readonly state: ObjectiveState;
  readonly result: Record<string, number>;
  readonly failure?: string;
  readonly failureText?: string;
  start(world: World): void;
  tick?(world: World, dt: number): void;
  onEvent(e: SimEvent, world: World): void;
}
