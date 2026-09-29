import { describe, expect, it } from 'vitest';
import { parseHash, toHash, UiState } from './state';

describe('screen routing', () => {
  it.each([
    ['', { name: 'title' }],
    ['#/title', { name: 'title' }],
    ['#/training', { name: 'training' }],
    ['#/flight/t1', { name: 'flight', missionId: 't1' }],
    ['#/flight/t9', { name: 'title' }],
    ['#/nonsense', { name: 'title' }],
  ])('%s', (hash, screen) => {
    expect(parseHash(hash)).toEqual(screen);
  });

  it('round-trips every screen', () => {
    for (const s of [{ name: 'title' }, { name: 'training' }, { name: 'flight', missionId: 't1' }] as const) {
      expect(parseHash(toHash(s))).toEqual(s);
    }
  });

  it('writes the hash on navigation and follows external hash changes', () => {
    const loc = { hash: '#/training' };
    const ui = new UiState(loc);
    expect(ui.getSnapshot()).toEqual({ name: 'training' });
    ui.go({ name: 'flight', missionId: 't1' });
    expect(loc.hash).toBe('#/flight/t1');
    let calls = 0;
    ui.subscribe(() => calls++);
    loc.hash = '#/title';
    ui.syncFromLocation();
    expect(ui.getSnapshot()).toEqual({ name: 'title' });
    expect(calls).toBe(1);
  });
});
