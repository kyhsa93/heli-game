import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { LosCache, radarSight, terrainClear, treeOcclusion, visualSight } from './los';
import { HALF, Terrain, type Tree } from './terrain';

const terrain = new Terrain(7);

function findRidge() {
  for (let i = 0; i < 4000; i++) {
    const x = ((i * 7919) % 173) / 173 * HALF * 1.6 - HALF * 0.8, z = ((i * 104729) % 181) / 181 * HALF * 1.6 - HALF * 0.8;
    const a = new Vector3(x, terrain.surfaceAt(x, z) + 30, z);
    const ang = (i % 12) * Math.PI / 6;
    const bx = x + Math.sin(ang) * 1500, bz = z + Math.cos(ang) * 1500;
    if (Math.abs(bx) > HALF - 50 || Math.abs(bz) > HALF - 50) continue;
    const b = new Vector3(bx, terrain.surfaceAt(bx, bz) + 30, bz);
    const mx = (x + bx) / 2, mz = (z + bz) / 2;
    if (terrain.surfaceAt(mx, mz) > Math.max(a.y, b.y) + 40) return { a, b };
  }
  throw new Error('no ridge');
}

describe('line of sight (05-enemies-and-ai.md 5.4)', () => {
  it('hides a target behind a ridge, for eyes and radar alike', () => {
    const { a, b } = findRidge();
    expect(terrainClear(terrain, a, b)).toBe(false);
    expect(visualSight(terrain, a, b).clear).toBe(false);
    expect(radarSight(terrain, a, b)).toBe(false);
  });

  it('sees across open air above every hill', () => {
    const a = new Vector3(-1500, 2000, -1500), b = new Vector3(1500, 2000, 1500);
    expect(terrainClear(terrain, a, b)).toBe(true);
    expect(visualSight(terrain, a, b)).toEqual({ clear: true, occlusion: 0 });
  });

  const tree = (x: number, z: number): Tree => ({ x, z, y: 0, h: 10, r: 2 });
  const a = new Vector3(0, 6, 0), b = new Vector3(100, 6, 0);

  it('adds 40% occlusion per canopy and blocks completely at two', () => {
    expect(treeOcclusion([], a, b)).toBe(0);
    expect(treeOcclusion([tree(50, 1)], a, b)).toBeCloseTo(0.4);
    expect(treeOcclusion([tree(30, 0), tree(70, -1)], a, b)).toBe(1);
    expect(treeOcclusion([tree(50, 5)], a, b)).toBe(0);
    expect(treeOcclusion([tree(50, 0)], new Vector3(0, 12, 0), new Vector3(100, 12, 0))).toBe(0);
    expect(treeOcclusion([tree(50, 0)], new Vector3(0, 1, 0), new Vector3(100, 1, 0))).toBe(0);
  });

  it('radar ignores trees that blind the eye', () => {
    let pair: { a: Vector3; b: Vector3 } | null = null;
    for (const tr of terrain.trees) {
      const lo = new Vector3(tr.x - 80, tr.y + tr.h * 0.7, tr.z), hi = new Vector3(tr.x + 80, tr.y + tr.h * 0.7, tr.z);
      if (!terrainClear(terrain, lo, hi)) continue;
      const s = visualSight(terrain, lo, hi);
      if (!s.clear) { pair = { a: lo, b: hi }; break; }
    }
    expect(pair).not.toBeNull();
    expect(radarSight(terrain, pair!.a, pair!.b)).toBe(true);
  });

  it('caches until the target moves 5 m or half a second passes', () => {
    const c = new LosCache(terrain);
    const o = new Vector3(0, 800, 0), t = new Vector3(300, 800, 0);
    c.visual(1, o, t, 0);
    c.visual(1, o, t, 0.3);
    c.visual(1, o, t.clone().setX(304), 0.4);
    expect(c.computed).toBe(1);
    c.visual(1, o, t.clone().setX(306), 0.4);
    expect(c.computed).toBe(2);
    c.visual(1, o, t.clone().setX(306), 0.95);
    expect(c.computed).toBe(3);
    c.radar(2, o, t, 1);
    expect(c.computed).toBe(4);
  });
});
