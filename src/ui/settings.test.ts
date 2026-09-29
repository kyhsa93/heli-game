import { describe, expect, it } from 'vitest';
import { loadDifficulty, loadInstantBest, saveDifficulty, saveInstantBest } from './settings';

describe('settings storage', () => {
  it('defaults the difficulty to normal and remembers the choice', () => {
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    expect(loadDifficulty(s)).toBe('normal');
    saveDifficulty('hard', s);
    expect(loadDifficulty(s)).toBe('hard');
    store.set('heli-difficulty', 'impossible');
    expect(loadDifficulty(s)).toBe('normal');
  });

  it('keeps only the best instant-action score', () => {
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    expect(loadInstantBest(s)).toBeNull();
    expect(saveInstantBest({ score: 1500, grade: 'B' }, s)).toBe(true);
    expect(saveInstantBest({ score: 900, grade: 'C' }, s)).toBe(false);
    expect(loadInstantBest(s)).toEqual({ score: 1500, grade: 'B' });
    expect(saveInstantBest({ score: 2100, grade: 'S' }, s)).toBe(true);
    expect(loadInstantBest(s)?.score).toBe(2100);
  });
});
