import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildHeli } from './heliModel';

const meshes = (o: THREE.Object3D) => { let n = 0; o.traverse(x => { if ((x as THREE.Mesh).isMesh) n++; }); return n; };

describe('draw-call budget of the own aircraft (08 8.7, #73)', () => {
  it('merges static parts by material so the whole model stays under 125 meshes', () => {
    const m = buildHeli();
    expect(meshes(m.root)).toBeLessThanOrEqual(125);
    expect(meshes(m.cockpit)).toBeLessThanOrEqual(60);
  });

  it('keeps every animated or swappable part as its own object', () => {
    const m = buildHeli();
    for (const part of [m.cyclic, m.collective, m.pedalL, m.pedalR, m.tailRotor, m.rotor, ...m.stingers, ...Object.values(m.screens)]) {
      let attached = false;
      for (let p = part.parent; p; p = p.parent) if (p === m.root) attached = true;
      expect(attached).toBe(true);
    }
    for (const s of Object.values(m.stores)) { expect(s.hellfire.parent).not.toBeNull(); expect(s.pod.parent).not.toBeNull(); }
  });
});
