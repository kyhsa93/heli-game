import type { MissionRuntime, MissionStats, RuntimeObjective } from '../sim/mission/runtime';
import type { Score } from '../sim/mission/scoring';

export interface MissionReport {
  success: boolean;
  reason?: string;
  failure?: string;
  score: Score;
  timeSec: number;
  landed: boolean;
  objectives: { label: string; primary: boolean; state: RuntimeObjective['state'] }[];
  stats: MissionStats;
}

export function reportFrom(rt: MissionRuntime): MissionReport {
  return {
    success: rt.state === 'done',
    reason: rt.failureText,
    failure: rt.failure,
    score: rt.score ?? rt.computeScore(false),
    timeSec: rt.elapsed,
    landed: rt.result.landed === 1,
    objectives: rt.objectives.map(o => ({ label: o.def.label, primary: o.def.primary, state: o.state })),
    stats: structuredClone(rt.stats),
  };
}
