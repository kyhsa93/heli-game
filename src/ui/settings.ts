import { isDifficulty, type DifficultyLevel } from '../sim/difficulty';

export const DIFFICULTY_KEY = 'heli-difficulty';

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

function storage(): Store | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function loadDifficulty(s: Store | null = storage()): DifficultyLevel {
  try { const v = s?.getItem(DIFFICULTY_KEY); return isDifficulty(v) ? v : 'normal'; } catch { return 'normal'; }
}

export function saveDifficulty(level: DifficultyLevel, s: Store | null = storage()) {
  try { s?.setItem(DIFFICULTY_KEY, level); } catch { /* storage blocked */ }
}

export const INSTANT_KEY = 'heli-instant-best';
export interface InstantBest { score: number; grade: string }

export function loadInstantBest(s: Store | null = storage()): InstantBest | null {
  try { const v = JSON.parse(s?.getItem(INSTANT_KEY) ?? 'null') as InstantBest | null; return v && typeof v.score === 'number' ? v : null; } catch { return null; }
}

export function saveInstantBest(best: InstantBest, s: Store | null = storage()) {
  const prev = loadInstantBest(s);
  if (prev && prev.score >= best.score) return false;
  try { s?.setItem(INSTANT_KEY, JSON.stringify(best)); } catch { return false; }
  return true;
}
