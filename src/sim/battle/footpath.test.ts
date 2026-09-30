import { describe, expect, it } from 'vitest';
import { waterDepth, WADE_DEPTH } from '../infantry/movement';
import { Terrain } from '../terrain';
import { FootField } from './footpath';

const bounds = { minX: -700, maxX: 700, minZ: -700, maxZ: 700 };

function riverWithBridge() {
  return new Terrain(5, { features: [
    { kind: 'flatten', center: [0, 600], radius: 110 },
    { kind: 'flatten', center: [0, -600], radius: 110 },
    { kind: 'river', path: [[-900, 0], [900, 0]], width: 40, bank: 420 },
    { kind: 'bridge', from: [250, -60], to: [250, 60] },
  ] });
}

describe('soldier proxy foot paths (B2-16)', () => {
  it('routes around deep water over the bridge', () => {
    const t = riverWithBridge();
    expect(waterDepth(t, 0, 0)).toBeGreaterThan(WADE_DEPTH);
    const f = new FootField(t, 0, -500, bounds);
    const start = f.dist[f.index(0, 500)];
    expect(Number.isFinite(start)).toBe(true);
    expect(start).toBeGreaterThan(2 * Math.hypot(250, 500) * 0.95);
    let [x, z] = [0, 500];
    let crossedAt: number | null = null;
    for (let i = 0; i < 1000 && Math.hypot(x, z + 500) > 12; i++) {
      const next = f.next(x, z)!;
      if (Math.sign(next[1]) !== Math.sign(z) && crossedAt === null) crossedAt = next[0];
      [x, z] = next;
      expect(waterDepth(t, x, z) <= WADE_DEPTH || t.onBridge(x, z, 4) !== null).toBe(true);
    }
    expect(Math.hypot(x, z + 500)).toBeLessThanOrEqual(12);
    expect(Math.abs(crossedAt! - 250)).toBeLessThan(40);
  });

  it('leaves unreachable cells at infinity and still gives the nearest reachable waypoint', () => {
    const t = riverWithBridge();
    const f = new FootField(t, 0, -500, bounds);
    expect(f.dist[f.index(0, 0)]).toBe(Infinity);
    expect(f.next(0, 2)).not.toBe(null);
  });
});
