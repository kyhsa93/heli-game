import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { World } from '../../sim/world';
import { CORPSE_TIME, LOD_FAR, LOD_MID, LOD_NEAR, puppetLod, Puppets } from './puppets';

function world() {
  const w = new World({ seed: 3, terrain: { features: [{ kind: 'flatten', center: [0, 0], radius: 900 }] } });
  const c = w.spawnUnit('c_inf', 0, 0);
  const v = w.spawnUnit('inf', 20, 0);
  return { w, c, v };
}

const ground = (w: World) => (x: number, z: number) => w.terrain.surfaceAt(x, z);

describe('code puppets (wiki 12.7)', () => {
  it('uses at most 11 draw calls for every puppet on the field', () => {
    const p = new Puppets();
    expect(p.meshCount).toBe(11);
    const { w } = world();
    for (let i = 0; i < 30; i++) w.spawnUnit(i % 2 ? 'inf' : 'c_inf', (i % 6) * 150, Math.floor(i / 6) * 150);
    p.update(w.units, ground(w), { pos: new Vector3(0, 2, 0), fovDeg: 80 }, 0.016);
    expect(p.drawCalls).toBeLessThanOrEqual(11);
    p.dispose();
  });

  it('picks the level of detail by distance and keeps narrow sights sharp at 1.5 km', () => {
    expect(puppetLod(LOD_NEAR - 1, 80)).toBe('near');
    expect(puppetLod(LOD_MID - 1, 80)).toBe('mid');
    expect(puppetLod(LOD_FAR - 1, 80)).toBe('far');
    expect(puppetLod(LOD_FAR + 1, 80)).toBe('none');
    expect(puppetLod(1500, 10)).not.toBe('none');
    expect(puppetLod(1500, 3)).toBe('near');
    const { w } = world();
    const p = new Puppets();
    p.update(w.units, ground(w), { pos: new Vector3(0, 2, 1600), fovDeg: 80 }, 0.016);
    expect(p.drawCalls).toBe(0);
    p.update(w.units, ground(w), { pos: new Vector3(0, 2, 1600), fovDeg: 3 }, 0.016);
    expect(p.count('torso')).toBe(10);
  });

  it('shows the side by head shape: round helmet for the coalition, brimmed cap for the VPA', () => {
    const { w } = world();
    const p = new Puppets();
    p.update(w.units, ground(w), { pos: new Vector3(10, 2, 30), fovDeg: 80 }, 0.016);
    expect(p.count('helmet')).toBe(5);
    expect(p.count('cap')).toBe(5);
  });

  it('keeps fallen members on the ground for 30 s, then clears them', () => {
    const { w, c } = world();
    const p = new Puppets();
    w.damageUnit(c, 16, false);
    p.update(w.units, ground(w), { pos: new Vector3(10, 2, 30), fovDeg: 80 }, 0.016);
    expect(p.count('torso')).toBe(10);
    p.update(w.units, ground(w), { pos: new Vector3(10, 2, 30), fovDeg: 80 }, CORPSE_TIME + 1);
    expect(p.count('torso')).toBe(8);
  });
});
