import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../sim/testing';
import { bezelHitAt, MPD_SIZE, MpdState, PAGES } from './mpd';
import { wpnPylons, wpnSelected } from './pages/wpn';

const uv = (x: number, y: number) => [x / MPD_SIZE, 1 - y / MPD_SIZE] as const;

describe('MPD pages (07-ui-ux.md 7.4)', () => {
  it('starts FLT left, TSD right and cycles each side independently', () => {
    const m = new MpdState();
    expect([m.left, m.right]).toEqual(['FLT', 'TSD']);
    const seen = [m.next('left'), m.next('left'), m.next('left')];
    expect(seen).toEqual(['TSD', 'WPN', 'TADS']);
    expect(m.next('left')).toBe('FLT');
    expect(m.right).toBe('TSD');
  });

  it('maps bottom bezel buttons B1-B6 to page slots', () => {
    for (let i = 0; i < 6; i++) expect(bezelHitAt(...uv(86 + i * 68, 491))).toEqual({ kind: 'page', index: i });
    expect(bezelHitAt(...uv(86 + 34, 491))).toBeNull();
    expect(bezelHitAt(...uv(256, 256))).toEqual({ kind: 'screen' });
    expect(bezelHitAt(...uv(20, 256))).toBeNull();
  });

  it('selects a page by bezel button and cycles on a screen tap', () => {
    const m = new MpdState();
    expect(m.press('right', bezelHitAt(...uv(86 + 2 * 68, 491)))).toBe(true);
    expect(m.right).toBe(PAGES[2]);
    m.press('right', bezelHitAt(...uv(86 + 5 * 68, 491)));
    expect(m.right).toBe(PAGES[2]);
    m.press('left', bezelHitAt(...uv(256, 256)));
    expect(m.left).toBe('TSD');
    expect(m.press('left', null)).toBe(false);
  });
});

describe('WPN page data', () => {
  it('lists each pylon with its store and rounds and marks the selected weapon', () => {
    const { world } = makeWorld();
    world.selectWeapon(3);
    world.loadout.rounds.L1 = 2;
    const lines = wpnPylons(world);
    expect(lines.map(l => [l.id, l.label, l.rounds, l.selected])).toEqual([
      ['L2', 'RKT', 19, false], ['L1', 'K', 2, true], ['R1', 'K', 4, true], ['R2', 'RKT', 19, false],
    ]);
    world.selectWeapon(2); world.selectWeapon(2);
    expect(wpnSelected(world)).toBe('RKT x2');
    world.selectWeapon(1);
    expect(wpnSelected(world)).toBe('GUN');
  });
});
