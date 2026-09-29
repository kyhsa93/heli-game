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
