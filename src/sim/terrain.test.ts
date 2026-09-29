import { describe, expect, it } from 'vitest';
import { DEFAULT_SIZE, MISSION_SIZE, ROAD_HALF_WIDTH, Terrain, type TerrainOptions } from './terrain';

const hash = (a: Float32Array) => { let h = 0; for (let i = 0; i < a.length; i += 97) h = (h * 31 + Math.round(a[i] * 100)) | 0; return h; };

const ROAD: [number, number][] = [[-3000, -2000], [-1000, -500], [1200, 400], [3000, 2500]];
const opts: TerrainOptions = {
  size: MISSION_SIZE,
  roads: [ROAD],
  features: [
    { kind: 'village', center: [1500, -2600], radius: 180, houses: 8 },
    { kind: 'flatten', center: [-2500, 3000], radius: 150 },
    { kind: 'bridge', from: [0, 0], to: [0, 120] },
    { kind: 'forest', center: [2000, 3000], radius: 500, density: 0.9 },
  ],
  pads: [{ x: -4200, z: 3800, name: 'A', base: true }, { x: 3000, z: -3000, name: 'B' }],
};

describe('terrain (06-missions-and-world.md 6.1)', () => {
  it('keeps the 4 km default with a 12.5 m grid', () => {
    const t = new Terrain(7);
    expect(t.size).toBe(DEFAULT_SIZE);
    expect(t.n).toBe(320);
    expect(t.cell).toBe(12.5);
  });

  const big = new Terrain(1101, opts);

  it('builds a 12 km map as a 961 x 961 height array', () => {
    expect(big.n).toBe(960);
    expect(big.heights.length).toBe(961 * 961);
  });

  it('produces the same heights for the same seed and features', () => {
    const again = new Terrain(1101, opts);
    expect(hash(again.heights)).toBe(hash(big.heights));
    expect(again.trees.length).toBe(big.trees.length);
    expect(hash(new Terrain(1102, opts).heights)).not.toBe(hash(big.heights));
  });

  it('flattens roads to an 8 m band that follows a smoothed profile', () => {
    for (let k = 0; k < 40; k++) {
      const seg = Math.floor(k / 14), f = (k % 14) / 14 + 0.03;
      const [ax, az] = ROAD[seg], [bx, bz] = ROAD[seg + 1];
      const x = ax + (bx - ax) * f, z = az + (bz - az) * f;
      const len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
      const mid = big.heightAt(x, z);
      for (const off of [-ROAD_HALF_WIDTH, -2, 2, ROAD_HALF_WIDTH]) {
        expect(Math.abs(big.heightAt(x + nx * off, z + nz * off) - mid)).toBeLessThan(0.6);
      }
      expect(big.roadHeightAt(x, z)).not.toBeNull();
      expect(big.heightAt(x, z)).toBeGreaterThan(1);
    }
    expect(big.roadHeightAt(-3000 + 500, 2000)).toBeNull();
  });

  it('applies village, flatten, bridge, forest features and explicit pads', () => {
    const houses = big.buildings.filter(b => b.kind === 'house' && Math.hypot(b.x - 1500, b.z + 2600) <= 180);
    expect(houses.length).toBeGreaterThanOrEqual(5);
    const c = big.heightAt(-2500, 3000);
    for (const [dx, dz] of [[80, 0], [0, -80], [-60, 60]]) expect(Math.abs(big.heightAt(-2500 + dx, 3000 + dz) - c)).toBeLessThan(0.5);
    expect(big.bridges).toHaveLength(1);
    expect(big.forest(2000, 3000)).toBeGreaterThan(0.9);
    expect(big.pads.map(p => p.name)).toEqual(['A', 'B']);
    expect(big.pads[0].base).toBe(true);
    expect(big.trees.every(t => !big.nearRoad(t.x, t.z, 8))).toBe(true);
  });

  it('generates a 12 km map in reasonable time', () => {
    const t0 = performance.now();
    new Terrain(5, { size: MISSION_SIZE });
    expect(performance.now() - t0).toBeLessThan(4000);
  });
});

describe('bridges', () => {
  it('keeps the water under a bridge and lets vehicles drive on the deck', () => {
    const t = new Terrain(1103, { size: MISSION_SIZE, features: [{ kind: 'bridge', from: [2220, -750], to: [2480, -750] }], roads: [[[3300, -850], [2480, -750], [2220, -750], [1300, -500]]] });
    expect(t.heightAt(2350, -750)).toBeLessThan(0);
    expect(t.driveHeightAt(2350, -750)).toBeGreaterThan(5);
    expect(t.driveHeightAt(2350, -700)).toBe(t.surfaceAt(2350, -700));
  });
});
