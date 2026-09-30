import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildHeliExterior } from './heliModel';
import { bakeScene } from './unitModels';

describe('baking code models into one geometry (#79)', () => {
  it('bakes the player exterior with its own colours, standing on its gear', () => {
    const g = bakeScene(buildHeliExterior());
    const c = g.getAttribute('color');
    let sum = 0;
    for (let i = 0; i < c.count; i++) sum += c.getX(i) + c.getY(i) + c.getZ(i);
    expect(sum / c.count / 3).toBeLessThan(0.1);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 5);
  });

  it('colours every face of a multi-group box from its single material', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x3d4632 })));
    const c = bakeScene(root).getAttribute('color');
    for (let i = 0; i < c.count; i++) expect(c.getX(i)).toBeLessThan(0.1);
  });
});
