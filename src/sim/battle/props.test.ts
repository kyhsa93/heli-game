import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import harekRaw from '../../content/battle/maps/harek.json?raw';
import { pairKey } from '../los';
import { segmentBlocked, type Obstacle } from '../obstacles';
import { STEP, World } from '../world';
import { mapObstacles, PROP_BOX } from './props';
import type { BattleMapDef } from './schema';
import { battleTerrainOptions } from './terrain';

const harek = JSON.parse(harekRaw) as BattleMapDef;

function world() {
  const w = new World({ seed: 2, terrain: battleTerrainOptions(harek), terrainSeed: harek.environment.seed });
  w.active = true;
  w.obstacles = mapObstacles(harek, w.terrain);
  w.los.obstacles = w.obstacles;
  return w;
}

describe('cover props (wiki 12.3, 6.2 principle 5)', () => {
  it('turns every point prop into a box on the ground', () => {
    const w = world();
    expect(w.obstacles.length).toBe(harek.points.reduce((n, p) => n + p.props.length, 0));
    const o = w.obstacles[0];
    expect(o.y).toBeCloseTo(w.terrain.surfaceAt(o.x, o.z), 5);
    expect([o.w, o.d, o.h]).toEqual(Object.values(PROP_BOX[harek.points[0].props[0].kind]));
  });

  it('blocks a sight line through its box and lets one pass above it', () => {
    const o: Obstacle = { x: 0, z: 0, y: 0, w: 6, d: 1.2, h: 1, yaw: 0.4 };
    expect(segmentBlocked(o, new Vector3(0, 0.5, 20), new Vector3(0, 0.5, -20))).toBe(true);
    expect(segmentBlocked(o, new Vector3(0, 2, 20), new Vector3(0, 2, -20))).toBe(false);
    expect(segmentBlocked(o, new Vector3(20, 0.5, 20), new Vector3(20, 0.5, -20))).toBe(false);
    const w = world();
    const s = w.obstacles.find(b => b.h >= 3)!;
    const nx = Math.sin(s.yaw), nz = Math.cos(s.yaw);
    const eye = (d: number) => new Vector3(s.x + nx * d, w.terrain.surfaceAt(s.x + nx * d, s.z + nz * d) + 1.5, s.z + nz * d);
    expect(w.los.visual(pairKey(1, 2), eye(8), eye(-8), 0).clear).toBe(false);
    w.los.obstacles = [];
    expect(w.los.visual(pairKey(1, 3), eye(8), eye(-8), 0).clear).toBe(true);
  });

  it('stops a soldier at a tall prop and lets one vault a low one', () => {
    const w = world();
    const tall = w.obstacles.find(b => b.h > 1.1)!;
    const nx = Math.sin(tall.yaw), nz = Math.cos(tall.yaw);
    w.spawnAvatar({ kind: 'soldier', x: tall.x + nx * (tall.d / 2 + 3), z: tall.z + nz * (tall.d / 2 + 3), headingDeg: 0, cls: 'assault' });
    const s = w.soldier!;
    w.soldierCommands.yaw = Math.atan2(nx, nz); w.soldierCommands.forward = 1;
    for (let i = 0; i < 360; i++) w.step(STEP);
    const side = (s.pos.x - tall.x) * nx + (s.pos.z - tall.z) * nz;
    expect(side).toBeGreaterThan(0);
    const low = w.obstacles.find(b => b.h <= 1.1 && b.d < 2)!;
    const lx = Math.sin(low.yaw), lz = Math.cos(low.yaw);
    w.spawnAvatar({ kind: 'soldier', x: low.x + lx * (low.d / 2 + 1), z: low.z + lz * (low.d / 2 + 1), headingDeg: 0, cls: 'assault' });
    const v = w.soldier!;
    w.soldierCommands.yaw = Math.atan2(lx, lz); w.soldierCommands.jump = true;
    for (let i = 0; i < 120; i++) w.step(STEP);
    const after = (v.pos.x - low.x) * lx + (v.pos.z - low.z) * lz;
    expect(after).toBeLessThan(0);
  });
});
