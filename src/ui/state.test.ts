import { describe, expect, it } from 'vitest';
import { parseHash, toHash, UiState } from './state';

describe('screen routing', () => {
  it.each([
    ['', { name: 'title' }],
    ['#/title', { name: 'title' }],
    ['#/settings', { name: 'settings' }],
    ['#/credits', { name: 'credits' }],
    ['#/campaign/m05', { name: 'title' }],
    ['#/flight/t1', { name: 'title' }],
    ['#/nonsense', { name: 'title' }],
  ])('%s', (hash, screen) => {
    expect(parseHash(hash)).toEqual(screen);
  });

  it('round-trips every screen', () => {
    for (const s of [{ name: 'title' }, { name: 'settings' }, { name: 'credits' }] as const) expect(parseHash(toHash(s))).toEqual(s);
  });

  it('writes the hash on navigation and follows external hash changes', () => {
    const loc = { hash: '#/settings' };
    const ui = new UiState(loc);
    expect(ui.getSnapshot()).toEqual({ name: 'settings' });
    ui.go({ name: 'credits' });
    expect(loc.hash).toBe('#/credits');
    loc.hash = '#/title';
    ui.syncFromLocation();
    expect(ui.getSnapshot()).toEqual({ name: 'title' });
  });
});
