import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { UNIT_DEFS } from '../sim/units';
import { World } from '../sim/world';
import { bakeModel, normalize, SOLDIER_HEIGHT } from './unitModels';
import { UnitRenderer } from './unitRenderer';

describe('UnitRenderer (M1-2)', () => {
  it('draws 100 units of four types in a handful of draw calls', () => {
    const w = new World({ seed: 3 });
    const types = ['tank', 'truck', 'apc', 'inf'];
    for (let i = 0; i < 100; i++) w.spawnUnit(types[i % 4], (i % 10) * 30, Math.floor(i / 10) * 30);
    const r = new UnitRenderer();
    r.update(w);
    expect(r.drawCalls).toBeLessThanOrEqual(4);
    expect(r.drawCalls).toBeLessThanOrEqual(30);
    const soldiers = r.group.children.find(c => c.name === 'soldier') as THREE.InstancedMesh;
    expect(soldiers.count).toBe(25 * 6);
  });

  it('keeps wrecks on the same mesh but darkens them', () => {
    const w = new World({ seed: 3 });
    const a = w.spawnUnit('tank', 0, 0), b = w.spawnUnit('tank', 30, 0);
    w.damageUnit(b, 1e4, true);
    const r = new UnitRenderer();
    r.update(w);
    const mesh = r.group.children.find(c => c.name === 'tank') as THREE.InstancedMesh;
    const ca = new THREE.Color(), cb = new THREE.Color();
    mesh.getColorAt(0, ca); mesh.getColorAt(1, cb);
    expect(a.alive && !b.alive).toBe(true);
    expect(cb.r).toBeLessThan(ca.r * 0.3);
    expect(r.drawCalls).toBe(1);
  });

  it('grows past its initial capacity', () => {
    const w = new World({ seed: 3 });
    for (let i = 0; i < 40; i++) w.spawnUnit('truck', i * 15, 0);
    const r = new UnitRenderer();
    r.update(w);
    expect((r.group.children.find(c => c.name === 'truck') as THREE.InstancedMesh).count).toBe(40);
  });
});

describe('model normalisation', () => {
  it('turns a model lying along X to face along Z, scales it to the unit length and stands it on the ground', () => {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 3), new THREE.MeshStandardMaterial({ color: 0x336699 }));
    mesh.position.set(5, 2, -1);
    scene.add(mesh);
    const geo = bakeModel(scene, UNIT_DEFS.truck, 'truck');
    const b = geo.boundingBox!;
    expect(b.max.z - b.min.z).toBeCloseTo(UNIT_DEFS.truck.size[2], 3);
    expect(b.min.y).toBeCloseTo(0, 5);
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(0, 5);
    const col = geo.getAttribute('color');
    expect(col.getZ(0)).toBeGreaterThan(col.getX(0));
  });

  it('dequantizes normalized integer positions before transforming (KHR_mesh_quantization)', () => {
    const box = new THREE.BoxGeometry(1, 0.4, 0.5).toNonIndexed();
    const src = box.getAttribute('position');
    const q = new Int16Array(src.count * 3);
    for (let i = 0; i < src.count * 3; i++) q[i] = Math.round((src.array as Float32Array)[i] * 32767);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(q, 3, true));
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial());
    mesh.scale.setScalar(20);
    const scene = new THREE.Group().add(mesh);
    const geo = bakeModel(scene, UNIT_DEFS.tank, 'tank');
    const b = geo.boundingBox!;
    expect(b.max.z - b.min.z).toBeCloseTo(UNIT_DEFS.tank.size[2], 2);
    const ratio = (b.max.y - b.min.y) / (b.max.z - b.min.z);
    expect(ratio).toBeCloseTo(0.4, 2);
  });

  it('turns glTF models (+Z forward) to face -Z like everything else in the world', () => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 6), new THREE.MeshStandardMaterial());
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 1), new THREE.MeshStandardMaterial());
    nose.position.set(0, 1, 3.5);
    const scene = new THREE.Group().add(body, nose);
    const geo = bakeModel(scene, UNIT_DEFS.tank, 'tank');
    const pos = geo.getAttribute('position');
    let topZ = 0, n = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > geo.boundingBox!.max.y - 0.01) { topZ += pos.getZ(i); n++; }
    expect(topZ / n).toBeLessThan(0);
  });

  it('scales soldiers by height', () => {
    const g = new THREE.BoxGeometry(0.4, 10, 0.3);
    normalize(g, UNIT_DEFS.inf, 'soldier');
    expect(g.boundingBox!.max.y - g.boundingBox!.min.y).toBeCloseTo(SOLDIER_HEIGHT, 5);
  });
});
