import { describe, expect, it } from 'vitest';
import { hasString, t, tList, tPairs } from './strings';

const HANGUL = /[\uAC00-\uD7A3]/;

const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const code = Object.keys(sources);
const read = (f: string) => sources[f];

describe('strings', () => {
  it('keeps Korean out of the simulation', () => {
    const sim = code.filter(f => f.startsWith('../sim/'));
    expect(sim.length).toBeGreaterThan(5);
    for (const f of sim) {
      expect(HANGUL.test(read(f)), f).toBe(false);
    }
  });

  it('keeps all user-facing Korean in content JSON', () => {
    expect(code.length).toBeGreaterThan(20);
    for (const f of code) expect(HANGUL.test(read(f)), f).toBe(false);
  });

  it('defines every string key the code asks for', () => {
    const keys = new Set<string>();
    for (const f of code) {
      for (const m of read(f).matchAll(/\bt(?:List|Pairs)?\(\s*['`]([\w.]+)['`]/g)) keys.add(m[1]);
      for (const m of read(f).matchAll(/'((?:hint|msg|hud|touch|brief|crash)\.[\w.]+)'/g)) keys.add(m[1]);
    }
    expect(keys.size).toBeGreaterThan(20);
    for (const k of keys) expect(hasString(k), k).toBe(true);
  });

  it('defines a message for every crash reason', () => {
    for (const r of ['rotorStrike', 'terrain', 'water', 'tree', 'building', 'ditched', 'hardLanding', 'slideLanding', 'tiltLanding', 'slope']) {
      expect(hasString(`crash.${r}`), r).toBe(true);
    }
  });

  it('fills parameters and returns lists', () => {
    expect(t('hint.spooling', { pct: 42 })).toContain('42%');
    expect(tList('brief.rules', { fpm: 590 })[0]).toContain('590');
    expect(tPairs('brief.keysKeyboard')[0]).toEqual(['I', expect.any(String)]);
    expect(t('no.such.key')).toBe('no.such.key');
  });
});
