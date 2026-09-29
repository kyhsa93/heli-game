import { describe, expect, it } from 'vitest';
import { creditCategory, creditGroups } from '../assets/credits';
import { QUALITY, treeOrder } from './quality';

describe('quality levels (07 7.8)', () => {
  it('trades pixels, trees and the MPD video for speed', () => {
    expect(QUALITY.low).toEqual({ pixelRatio: 1, trees: 0.5, mpdVideo: false });
    expect(QUALITY.high.trees).toBe(1);
    expect(QUALITY.medium.pixelRatio).toBeGreaterThan(QUALITY.low.pixelRatio);
  });

  it('orders trees so any leading fraction is spread over the whole list', () => {
    const n = 1000, order = treeOrder(n);
    expect(new Set(order).size).toBe(n);
    const half = order.slice(0, n / 2);
    expect(half.filter(i => i < n / 2).length).toBeGreaterThan(n / 2 * 0.4);
    expect(half.filter(i => i < n / 2).length).toBeLessThan(n / 2 * 0.6);
    expect(treeOrder(7919 * 2)).toHaveLength(7919 * 2);
    expect(new Set(treeOrder(7919 * 2)).size).toBe(7919 * 2);
  });
});

describe('credits by category (07 7.8)', () => {
  it('groups CREDITS.md rows by folder', () => {
    expect(creditCategory('fonts/a.woff2')).toBe('fonts');
    expect(creditCategory('models/tank.glb')).toBe('models');
    expect(creditCategory('misc.txt')).toBe('other');
    const rows = ['audio/a.mp3', 'fonts/b.woff2', 'audio/c.mp3'].map(file => ({ file, title: '', author: '', url: '', license: '', modified: '', checked: '' }));
    expect(creditGroups(rows).map(([c, l]) => [c, l.length])).toEqual([['fonts', 1], ['audio', 2]]);
  });
});
