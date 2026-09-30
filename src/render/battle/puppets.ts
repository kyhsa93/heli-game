import * as THREE from 'three';
import { memberPos } from '../../sim/infantry/squad';
import type { Unit } from '../../sim/units';
import { UNIFORM } from './uniform';

export type PuppetLod = 'near' | 'mid' | 'far' | 'none';
export const LOD_NEAR = 120;
export const LOD_MID = 500;
export const LOD_FAR = 1500;
export const NARROW_FOV = 10;
export const BASE_FOV = 72;
export const FALL_TIME = 0.8;
export const CORPSE_TIME = 30;
export const STRIDE = 1.4;
export const MAX_PUPPETS = 256;

export function puppetLod(distance: number, fovDeg: number): PuppetLod {
  const d = fovDeg <= NARROW_FOV ? distance * (fovDeg / BASE_FOV) : distance;
  if (d < LOD_NEAR) return 'near';
  if (d < LOD_MID) return 'mid';
  if (d < LOD_FAR) return 'far';
  return 'none';
}

const COLORS = {
  coalition: { cloth: new THREE.Color(UNIFORM.coalition.cloth), gear: new THREE.Color(UNIFORM.coalition.gear) },
  veros: { cloth: new THREE.Color(UNIFORM.veros.cloth), gear: new THREE.Color(UNIFORM.veros.gear) },
};
const SKIN = new THREE.Color(0xb08a6e);
const DARK = new THREE.Color(0x222222);

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

function merge(parts: THREE.BufferGeometry[]) {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  let base = 0;
  for (const g of parts) {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.getAttribute('position'), n = ng.getAttribute('normal');
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); idx.push(base + i); }
    base += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

export const PART_GEOMETRY = {
  helmet: () => new THREE.SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.66, 0),
  cap: () => merge([box(0.22, 0.14, 0.22, 0, 1.68, 0), box(0.24, 0.025, 0.12, 0, 1.63, -0.15)]),
  torso: () => merge([box(0.42, 0.55, 0.24, 0, 1.25, 0), box(0.06, 0.06, 0.7, 0.12, 1.22, -0.3)]),
  arm: () => box(0.11, 0.55, 0.11, 0, -0.26, 0),
  leg: () => box(0.15, 0.92, 0.16, 0, -0.46, 0),
  midHead: () => box(0.24, 0.24, 0.24, 0, 1.66, 0),
  midBody: () => merge([box(0.62, 0.6, 0.26, 0, 1.25, 0), box(0.06, 0.06, 0.7, 0.12, 1.22, -0.3)]),
  midLegs: () => merge([box(0.15, 0.92, 0.16, -0.1, -0.46, 0), box(0.15, 0.92, 0.16, 0.1, -0.46, 0)]),
  far: () => box(0.5, 1.8, 0.3, 0, 0.9, 0),
};

type PartId = 'helmet' | 'cap' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR' | 'midHead' | 'midBody' | 'midLegs' | 'far';
const PART_GEO: Record<PartId, keyof typeof PART_GEOMETRY> = {
  helmet: 'helmet', cap: 'cap', torso: 'torso', armL: 'arm', armR: 'arm', legL: 'leg', legR: 'leg', midHead: 'midHead', midBody: 'midBody', midLegs: 'midLegs', far: 'far',
};

export interface PuppetView { pos: THREE.Vector3; fovDeg: number }

export class Puppets {
  readonly group = new THREE.Group();
  private meshes = new Map<PartId, THREE.InstancedMesh>();
  private counts = new Map<PartId, number>();
  private fallen = new Map<number, number>();
  private material = new THREE.MeshLambertMaterial();
  private heatMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x400000 });
  private root = new THREE.Matrix4();
  private local = new THREE.Matrix4();
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private c = new THREE.Color();
  time = 0;

  constructor() {
    this.group.name = 'puppets';
    for (const id of Object.keys(PART_GEO) as PartId[]) {
      const mesh = new THREE.InstancedMesh(PART_GEOMETRY[PART_GEO[id]](), this.material, MAX_PUPPETS);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.name = `puppet-${id}`;
      this.meshes.set(id, mesh);
      this.group.add(mesh);
    }
  }

  get drawCalls() {
    let n = 0;
    for (const m of this.meshes.values()) if (m.visible && m.count > 0) n++;
    return n;
  }

  get meshCount() { return this.meshes.size; }

  count(part: PartId) { return this.counts.get(part) ?? 0; }

  update(units: readonly Unit[], ground: (x: number, z: number) => number, view: PuppetView, dt: number, heat = false) {
    this.time += dt;
    for (const id of this.meshes.keys()) this.counts.set(id, 0);
    for (const u of units) {
      if (!u.members || (u.side !== 'coalition' && u.side !== 'veros')) continue;
      const speed = Math.hypot(u.vel.x, u.vel.z);
      const aiming = !!u.battle?.target && speed < 0.5;
      u.members.forEach((m, i) => {
        const key = u.id * 16 + i;
        let fall = 0;
        if (!m.alive || !u.alive) {
          if (!this.fallen.has(key)) this.fallen.set(key, this.time);
          const since = this.time - this.fallen.get(key)!;
          if (since > CORPSE_TIME) return;
          fall = Math.min(1, since / FALL_TIME);
        }
        memberPos(u, m, this.v);
        this.v.y = ground(this.v.x, this.v.z);
        const lod = puppetLod(this.v.distanceTo(view.pos), view.fovDeg);
        if (lod === 'none') return;
        this.e.set(-fall * Math.PI / 2, u.yaw, 0, 'YXZ');
        this.root.compose(this.v, this.q.setFromEuler(this.e), this.one);
        const cloth = heat ? this.c.setRGB(u.alive && m.alive ? 0.7 : 0.3, 0, 0) : COLORS[u.side as 'coalition' | 'veros'].cloth;
        const gear = heat ? cloth : COLORS[u.side as 'coalition' | 'veros'].gear;
        if (lod === 'far') { this.put('far', this.root, cloth); return; }
        const phase = this.time * (speed / STRIDE) * Math.PI + i * 1.7;
        const amp = fall > 0 ? 0 : speed > 3 ? 0.7 : speed > 0.3 ? 0.44 : 0;
        const swing = Math.sin(phase) * amp;
        if (lod === 'mid') {
          this.put('midHead', this.root, heat ? cloth : SKIN);
          this.put('midBody', this.root, cloth);
          this.put('midLegs', this.limb(0, 0.92, 0, 0), gear);
          return;
        }
        this.put(u.side === 'coalition' ? 'helmet' : 'cap', this.root, heat ? cloth : gear);
        this.put('torso', this.root, cloth);
        const armPitch = aiming ? -1.25 : -swing;
        this.put('armL', this.limb(-0.27, 1.5, 0, aiming ? armPitch + 0.2 : armPitch), heat ? cloth : SKIN);
        this.put('armR', this.limb(0.27, 1.5, 0, aiming ? armPitch : swing), heat ? cloth : SKIN);
        this.put('legL', this.limb(-0.1, 0.92, 0, swing), gear);
        this.put('legR', this.limb(0.1, 0.92, 0, -swing), heat ? cloth : DARK.clone().lerp(gear, 0.8));
      });
    }
    for (const [id, mesh] of this.meshes) {
      mesh.material = heat ? this.heatMaterial : this.material;
      mesh.count = this.counts.get(id) ?? 0;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private limb(x: number, y: number, z: number, pitch: number) {
    this.local.makeRotationX(pitch).setPosition(x, y, z);
    return this.tmp.multiplyMatrices(this.root, this.local);
  }

  private put(id: PartId, m: THREE.Matrix4, color: THREE.Color) {
    const mesh = this.meshes.get(id)!;
    const i = this.counts.get(id)!;
    if (i >= MAX_PUPPETS) return;
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color);
    this.counts.set(id, i + 1);
  }

  dispose() {
    for (const m of this.meshes.values()) { m.geometry.dispose(); m.dispose(); }
    this.material.dispose();
    this.heatMaterial.dispose();
  }
}
