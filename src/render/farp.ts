import * as THREE from 'three';
import type { Pad3 } from '../sim/terrain';
import { bakeProp } from './unitModels';

export type PropId = 'crate' | 'barrel' | 'gas_can' | 'barracks' | 'sandbags';

export const PROP_EXTENT: Record<PropId, number> = { crate: 1.2, barrel: 0.7, gas_can: 0.45, barracks: 9, sandbags: 6 };

export interface Placement { prop: PropId; x: number; z: number; yaw: number }

export function farpLayout(): Placement[] {
  const out: Placement[] = [];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) out.push({ prop: 'crate', x: -15 + i * 1.3, z: 8 + j * 1.3, yaw: 0 });
  out.push({ prop: 'crate', x: -14.35, z: 8.65, yaw: 0.2 });
  for (let i = 0; i < 5; i++) out.push({ prop: 'barrel', x: -17 + (i % 3) * 0.8, z: -6 - Math.floor(i / 3) * 0.8, yaw: i });
  for (let i = 0; i < 3; i++) out.push({ prop: 'gas_can', x: -14.5 + i * 0.55, z: -7.2, yaw: i * 0.4 });
  out.push({ prop: 'barracks', x: 2, z: -21, yaw: 0.15 });
  out.push({ prop: 'sandbags', x: 19, z: -11, yaw: -0.6 });
  return out;
}

function box(g: THREE.Group, w: number, h: number, d: number, color: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y + h / 2, z);
  g.add(m);
  return m;
}

export function farpCodeProps(pad: Pad3) {
  const g = new THREE.Group();
  g.position.set(pad.x, pad.y, pad.z);
  const bladder = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), new THREE.MeshLambertMaterial({ color: 0x1c1d1f }));
  bladder.scale.set(3.4, 0.7, 2.2);
  bladder.position.set(16, 0.55, 6);
  g.add(bladder);
  box(g, 0.25, 0.25, 6, 0x2a2b2d, 13, 0.05, 3);
  const truck = new THREE.Group();
  truck.position.set(15, 0, 15);
  truck.rotation.y = -0.5;
  box(truck, 2.4, 1.1, 2.1, 0x4f5a3c, 0, 0.9, -2.6);
  box(truck, 2.4, 0.9, 4.6, 0x4f5a3c, 0, 0.9, 0.9);
  box(truck, 2.3, 0.6, 0.1, 0x2a3a44, 0, 1.4, -3.66);
  for (const [x, z] of [[-1.1, -2.4], [1.1, -2.4], [-1.1, 1.6], [1.1, 1.6]]) box(truck, 0.35, 0.9, 0.9, 0x1a1a1a, x, 0, z);
  g.add(truck);
  return g;
}

export class FarpProps {
  readonly group = new THREE.Group();
  private material = new THREE.MeshLambertMaterial({ vertexColors: true });

  constructor(private pads: readonly Pad3[]) {
    for (const p of pads) if (p.base) this.group.add(farpCodeProps(p));
  }

  setModels(models: Partial<Record<PropId, THREE.Object3D>>) {
    const layout = farpLayout();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const farps = this.pads.filter(p => p.base);
    for (const [id, scene] of Object.entries(models) as [PropId, THREE.Object3D][]) {
      const places = layout.filter(l => l.prop === id);
      if (!places.length || !farps.length) continue;
      const geo = bakeProp(scene, PROP_EXTENT[id]);
      const inst = new THREE.InstancedMesh(geo, this.material, places.length * farps.length);
      let k = 0;
      for (const p of farps) for (const l of places) {
        q.setFromAxisAngle(up, l.yaw);
        inst.setMatrixAt(k++, m.compose(new THREE.Vector3(p.x + l.x, p.y, p.z + l.z), q, s));
      }
      inst.name = `farp-${id}`;
      this.group.add(inst);
    }
  }
}
