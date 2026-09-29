import { UNIT_DEFS } from '../units';

export type ScoreKey = 'primary' | 'secondary' | 'kills' | 'efficiency' | 'noDamage' | 'landed' | 'time' | 'friendly' | 'civilian';
export type Grade = 'S' | 'A' | 'B' | 'C' | 'F';

export interface ScoreInput {
  success: boolean;
  primaryDone: number;
  primaryTotal: number;
  secondaryDone: number;
  kills: Record<string, number>;
  shots: Record<string, number>;
  hits: Record<string, number>;
  hitsTaken: number;
  damagedSystems: number;
  landed: boolean;
  timeSec: number;
  parTimeSec: number;
  friendly: number;
  civilian: number;
}

export interface ScoreLine { key: ScoreKey; points: number }
export interface Score { lines: ScoreLine[]; total: number; grade: Grade }

export const PRIMARY_POINTS = 1000;
export const SECONDARY_POINTS = 300;
export const EFFICIENCY_POINTS = 300;
export const NO_DAMAGE_POINTS = 200;
export const LANDED_POINTS = 200;
export const TIME_POINTS_PER_SEC = 2;
export const TIME_POINTS_MAX = 300;
export const FRIENDLY_POINTS = -1000;
export const CIVILIAN_POINTS = -500;
export const FRIENDLY_FAIL = 3;
export const GUIDED = ['hydra70', 'agm114k', 'agm114l'];

export function scoreMission(s: ScoreInput, par: number): Score {
  const lines: ScoreLine[] = [];
  const add = (key: ScoreKey, points: number) => { if (points !== 0) lines.push({ key, points: Math.round(points) }); };
  add('primary', s.primaryTotal ? PRIMARY_POINTS * s.primaryDone / s.primaryTotal : 0);
  add('secondary', SECONDARY_POINTS * s.secondaryDone);
  add('kills', Object.entries(s.kills).reduce((sum, [id, n]) => sum + (UNIT_DEFS[id]?.score ?? 0) * n, 0));
  const shots = GUIDED.reduce((n, w) => n + (s.shots[w] ?? 0), 0), hits = GUIDED.reduce((n, w) => n + (s.hits[w] ?? 0), 0);
  add('efficiency', shots ? EFFICIENCY_POINTS * Math.min(1, hits / shots) : 0);
  if (s.success && s.hitsTaken === 0 && s.damagedSystems === 0) add('noDamage', NO_DAMAGE_POINTS);
  if (s.landed) add('landed', LANDED_POINTS);
  if (s.success && s.timeSec < s.parTimeSec) add('time', Math.min(TIME_POINTS_MAX, TIME_POINTS_PER_SEC * (s.parTimeSec - s.timeSec)));
  add('friendly', FRIENDLY_POINTS * s.friendly);
  add('civilian', CIVILIAN_POINTS * s.civilian);
  const total = lines.reduce((sum, l) => sum + l.points, 0);
  return { lines, total, grade: gradeFor(s.success, total, par) };
}

export function gradeFor(success: boolean, total: number, par: number): Grade {
  if (!success) return 'F';
  const r = par > 0 ? total / par : 1;
  return r >= 1 ? 'S' : r >= 0.8 ? 'A' : r >= 0.6 ? 'B' : 'C';
}
