import { describe, expect, it } from 'vitest';
import { loadDifficulty, saveDifficulty } from './settings';

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
});
