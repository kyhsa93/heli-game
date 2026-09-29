import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MISSION_SIZE, Terrain } from '../sim/terrain';
import { chunkGeometry, CHUNK, FAR_STEP, NEAR_DISTANCE, SKIRT, TerrainChunks } from './terrainChunks';

const t = new Terrain(3, { size: MISSION_SIZE });

describe('chunked terrain (06 6.1, 08 8.6)', () => {
  it('splits a 12 km map into 6 x 6 chunks of 2 km', () => {
    const c = new TerrainChunks(t, null);
    expect(c.chunks).toHaveLength(36);
    expect(new TerrainChunks(new Terrain(3), null).chunks).toHaveLength(4);
  });

  it('uses 161 x 161 vertices near and 41 x 41 far, each with a skirt ring', () => {
    const near = chunkGeometry(t, 2, 2, 1), far = chunkGeometry(t, 2, 2, FAR_STEP);
    const ring = (n: number) => 4 * n - 4;
    expect(near.getAttribute('position').count).toBe(161 * 161 + ring(161));
    expect(far.getAttribute('position').count).toBe(41 * 41 + ring(41));
    const ys = near.getAttribute('position').array as Float32Array;
    const top = ys[1], skirt = ys[(161 * 161) * 3 + 1];
    expect(top - skirt).toBeCloseTo(SKIRT, 3);
  });

  it('shares edge heights between neighbouring chunks so there are no cracks', () => {
    const a = chunkGeometry(t, 1, 1, 1).getAttribute('position'), b = chunkGeometry(t, 2, 1, 1).getAttribute('position');
    for (let j = 0; j < 161; j += 20) {
      const ia = j * 161 + 160, ib = j * 161;
      expect(a.getX(ia)).toBeCloseTo(b.getX(ib), 5);
      expect(a.getY(ia)).toBeCloseTo(b.getY(ib), 5);
    }
  });

  it('switches chunks near the camera to full detail', () => {
    const c = new TerrainChunks(t, null);
    c.update(new THREE.Vector3(0, 100, 0));
    const near = c.chunks.filter(k => k.near.visible);
    expect(near.length).toBeGreaterThanOrEqual(4);
    expect(near.length).toBeLessThanOrEqual(16);
    for (const k of c.chunks) expect(k.near.visible).not.toBe(k.far.visible);
    expect(NEAR_DISTANCE).toBeGreaterThan(CHUNK);
  });
});
