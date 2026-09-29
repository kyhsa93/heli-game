export type DifficultyLevel = 'easy' | 'normal' | 'hard';
export const DIFFICULTY_LEVELS: readonly DifficultyLevel[] = ['easy', 'normal', 'hard'];

export interface Difficulty { level: DifficultyLevel; enemyAccuracy: number; enemyReaction: number; damageTaken: number; detection: number }

export const DIFFICULTIES: Record<DifficultyLevel, Difficulty> = {
  easy: { level: 'easy', enemyAccuracy: 0.5, enemyReaction: 1.5, damageTaken: 0.5, detection: 0.7 },
  normal: { level: 'normal', enemyAccuracy: 1, enemyReaction: 1, damageTaken: 1, detection: 1 },
  hard: { level: 'hard', enemyAccuracy: 1.3, enemyReaction: 0.7, damageTaken: 1.3, detection: 1.3 },
};

export function isDifficulty(v: unknown): v is DifficultyLevel {
  return v === 'easy' || v === 'normal' || v === 'hard';
}
