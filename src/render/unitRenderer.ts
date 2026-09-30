import * as THREE from 'three';
import { squadMembers, UNIT_DEFS, type Unit } from '../sim/units';
import type { World } from '../sim/world';
import { airDefenseModel, hasAirDefenseModel } from './airDefenseModels';
import { buildHeliExterior } from './heliModel';
import { bakeModel, bakeScene, fallbackModel, MODEL_FOR_UNIT } from './unitModels';

const APACHE_UNIT = 'c_apache';

const TINT = {
  veros: new THREE.Color(0.9, 0.92, 0.88),
  coalition: new THREE.Color(1.35, 1.2, 0.95),
  civilian: new THREE.Color(1, 1, 1),
  wreck: new THREE.Color(0.13, 0.12, 0.11),
};

export const WRECK_HEAT = 0.35;

const FORMATION = [[0, 0], [2.2, 0.6], [-2.2, 0.6], [1.1, 2.4], [-1.1, 2.4], [0, 4], [3.3, 2.8], [-3.3, 2.8]];

interface Visual { key: string; mesh: THREE.InstancedMesh; capacity: number; count: number; fromAsset: boolean }

export class UnitRenderer {
  readonly group = new THREE.Group();
  private visuals = new Map<string, Visual>();
  private material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private heatMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x400000 });
  private heat = false;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);
  private p = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private c = new THREE.Color();

  keyFor(defId: string) {
    return MODEL_FOR_UNIT[defId] ?? `code:${defId}`;
  }

  private visual(key: string, defId: string): Visual {
    let v = this.visuals.get(key);
    if (!v) {
      const def = UNIT_DEFS[defId];
      const geo = defId === APACHE_UNIT ? bakeScene(buildHeliExterior()) : hasAirDefenseModel(defId) ? airDefenseModel(defId) : fallbackModel(def, key === 'soldier' ? 'infantry' : def.category);
      v = this.makeVisual(key, geo, 16, false);
      this.visuals.set(key, v);
    }
    return v;
  }

  private makeVisual(key: string, geo: THREE.BufferGeometry, capacity: number, fromAsset: boolean): Visual {
    const mesh = new THREE.InstancedMesh(geo, this.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.name = key;
    this.group.add(mesh);
    return { key, mesh, capacity, count: 0, fromAsset };
  }

  setModel(key: string, scene: THREE.Object3D) {
    const defId = Object.keys(MODEL_FOR_UNIT).find(d => MODEL_FOR_UNIT[d] === key);
    if (!defId) return;
    const geo = bakeModel(scene, UNIT_DEFS[defId], key);
    const old = this.visuals.get(key);
    if (old) { this.group.remove(old.mesh); old.mesh.geometry.dispose(); old.mesh.dispose(); }
    this.visuals.set(key, this.makeVisual(key, geo, old?.capacity ?? 16, true));
  }

  hasAssetModel(key: string) {
    return this.visuals.get(key)?.fromAsset ?? false;
  }

  private grow(v: Visual, need: number) {
    if (need <= v.capacity) return;
    const cap = Math.max(need, v.capacity * 2);
    this.group.remove(v.mesh);
    v.mesh.dispose();
    const nv = this.makeVisual(v.key, v.mesh.geometry, cap, v.fromAsset);
    Object.assign(v, nv);
  }

  private place(v: Visual, u: Unit, x: number, z: number, yaw: number, y: number) {
    const i = v.count++;
    this.p.set(x, y, z);
    this.q.setFromAxisAngle(this.up, yaw);
    this.m.compose(this.p, this.q, this.s);
    v.mesh.setMatrixAt(i, this.m);
    if (this.heat) this.c.setRGB(u.alive ? u.def.heat : WRECK_HEAT, 0, 0);
    else this.c.copy(u.alive ? TINT[u.side] : TINT.wreck);
    v.mesh.setColorAt(i, this.c);
  }

  update(world: World, heat = false) {
    this.heat = heat;
    const need = new Map<string, number>();
    for (const u of world.units) {
      const key = this.keyFor(u.defId);
      const n = key === 'soldier' ? Math.max(1, squadMembers(u) || (u.alive ? 1 : 0)) : 1;
      need.set(key, (need.get(key) ?? 0) + n);
    }
    for (const [key, n] of need) {
      const defId = world.units.find(u => this.keyFor(u.defId) === key)!.defId;
      this.grow(this.visual(key, defId), n);
    }
    for (const v of this.visuals.values()) v.count = 0;
    for (const u of world.units) {
      const key = this.keyFor(u.defId);
      const v = this.visuals.get(key)!;
      if (key === 'soldier') {
        const n = u.alive ? squadMembers(u) : Math.min(2, u.def.squad ?? 1);
        const cy = Math.cos(u.yaw), sy = Math.sin(u.yaw);
        for (let k = 0; k < n; k++) {
          const [fx, fz] = FORMATION[k % FORMATION.length];
          const x = u.pos.x + fx * cy + fz * sy, z = u.pos.z - fx * sy + fz * cy;
          this.place(v, u, x, z, u.yaw, world.terrain.surfaceAt(x, z));
        }
      } else {
        this.place(v, u, u.pos.x, u.pos.z, u.yaw, u.pos.y);
      }
    }
    for (const v of this.visuals.values()) {
      v.mesh.material = heat ? this.heatMaterial : this.material;
      v.mesh.count = v.count;
      v.mesh.visible = v.count > 0;
      v.mesh.instanceMatrix.needsUpdate = true;
      if (v.mesh.instanceColor) v.mesh.instanceColor.needsUpdate = true;
    }
  }

  get drawCalls() {
    let n = 0;
    for (const v of this.visuals.values()) if (v.mesh.visible) n++;
    return n;
  }

  dispose() {
    for (const v of this.visuals.values()) { v.mesh.geometry.dispose(); v.mesh.dispose(); }
    this.material.dispose();
    this.heatMaterial.dispose();
  }
}
