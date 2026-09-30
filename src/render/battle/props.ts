import * as THREE from 'three';
import type { Obstacle } from '../../sim/obstacles';
import { bakeProp } from '../unitModels';

export type BattlePropKind = 'sandbags' | 'crates' | 'barracks' | 'wall';

export const MODEL_FOR: Partial<Record<BattlePropKind, string>> = { sandbags: 'sandbags', crates: 'crate', barracks: 'barracks' };
export const FALLBACK_COLOR: Record<BattlePropKind, number> = { sandbags: 0x9a8a62, crates: 0x6e5a3a, barracks: 0x5d6650, wall: 0x8c8378 };

export interface PlacedProp { kind: BattlePropKind; box: Obstacle }

export function fitBox(geo: THREE.BufferGeometry, w: number, h: number, d: number) {
  geo.computeBoundingBox();
  let bb = geo.boundingBox!;
  if ((bb.max.z - bb.min.z > bb.max.x - bb.min.x) !== (d > w)) { geo.rotateY(Math.PI / 2); geo.computeBoundingBox(); bb = geo.boundingBox!; }
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geo.computeBoundingBox();
  bb = geo.boundingBox!;
  geo.scale(w / Math.max(1e-6, bb.max.x - bb.min.x), h / Math.max(1e-6, bb.max.y - bb.min.y), d / Math.max(1e-6, bb.max.z - bb.min.z));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

export class BattleProps {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];

  constructor(private props: readonly PlacedProp[]) {
    this.group.name = 'battle-props';
    this.build({});
  }

  setModels(models: Partial<Record<string, THREE.Object3D>>) {
    this.build(models);
  }

  private build(models: Partial<Record<string, THREE.Object3D>>) {
    for (const m of this.meshes) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); m.removeFromParent(); }
    this.meshes = [];
    const kinds = [...new Set(this.props.map(p => p.kind))];
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const kind of kinds) {
      const list = this.props.filter(p => p.kind === kind);
      const scene = MODEL_FOR[kind] ? models[MODEL_FOR[kind]!] : undefined;
      const b = list[0].box;
      const geo = scene ? fitBox(bakeProp(scene, Math.max(b.w, b.d)), b.w, b.h, b.d) : new THREE.BoxGeometry(b.w, b.h, b.d).translate(0, b.h / 2, 0);
      const material = scene ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshLambertMaterial({ color: FALLBACK_COLOR[kind] });
      const inst = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.box.yaw);
        inst.setMatrixAt(i, mat.compose(new THREE.Vector3(p.box.x, p.box.y, p.box.z), q, new THREE.Vector3(1, 1, 1)));
      });
      inst.name = `prop-${kind}`;
      this.group.add(inst);
      this.meshes.push(inst);
    }
  }

  get drawCalls() { return this.meshes.length; }

  dispose() {
    for (const m of this.meshes) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    this.group.removeFromParent();
  }
}
