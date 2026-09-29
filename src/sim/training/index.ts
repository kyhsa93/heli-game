import type { Objective } from '../objective';
import { TrainingT1 } from './t1';
import { TrainingT3 } from './t3';

export function createObjective(missionId: string): Objective | null {
  switch (missionId) {
    case 't1': return new TrainingT1();
    case 't3': return new TrainingT3();
    default: return null;
  }
}
