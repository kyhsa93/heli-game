import type { Objective } from '../objective';
import { TrainingT1 } from './t1';
import { TrainingT3 } from './t3';
import { TrainingT4 } from './t4';

export function createObjective(missionId: string): Objective | null {
  switch (missionId) {
    case 't1': return new TrainingT1();
    case 't3': return new TrainingT3();
    case 't4': return new TrainingT4();
    default: return null;
  }
}
