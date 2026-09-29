import type { SimEvent } from './events';
import type { World } from './world';

export type ObjectiveState = 'active' | 'done' | 'failed';

export interface Objective {
  readonly id: string;
  readonly state: ObjectiveState;
  readonly result: Record<string, number>;
  readonly step?: string;
  readonly failure?: string;
  start(world: World): void;
  onEvent(e: SimEvent, world: World): void;
}
