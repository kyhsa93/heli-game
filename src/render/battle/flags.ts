import * as THREE from 'three';

export const POLE_HEIGHT = 12;
export const FLAG_SIZE: [number, number] = [3.2, 2];
export const SIDE_COLORS = { coalition: 0x3d7bd9, veros: 0xd94b3d } as const;

export interface FlagPoint { id: string; x: number; z: number; owner: 'coalition' | 'veros' | 'neutral'; v: number }

function squareFlag() {
  const g = new THREE.PlaneGeometry(FLAG_SIZE[0], FLAG_SIZE[1]);
  g.translate(FLAG_SIZE[0] / 2, -FLAG_SIZE[1] / 2, 0);
  return g;
}

function triangleFlag() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -FLAG_SIZE[1], 0, FLAG_SIZE[0], -FLAG_SIZE[1] / 2, 0], 3));
  g.computeVertexNormals();
  return g;
}

export class Flags {
  readonly group = new THREE.Group();
  private items: { pole: THREE.Mesh; square: THREE.Mesh; triangle: THREE.Mesh }[] = [];
  private poleGeo = new THREE.CylinderGeometry(0.12, 0.15, POLE_HEIGHT, 6);
  private poleMat = new THREE.MeshLambertMaterial({ color: 0xcfd6df });
  private squareGeo = squareFlag();
  private triangleGeo = triangleFlag();
  private mats = {
    coalition: new THREE.MeshLambertMaterial({ color: SIDE_COLORS.coalition, side: THREE.DoubleSide }),
    veros: new THREE.MeshLambertMaterial({ color: SIDE_COLORS.veros, side: THREE.DoubleSide }),
  };

  constructor(points: readonly FlagPoint[], ground: (x: number, z: number) => number) {
    this.group.name = 'flags';
    for (const p of points) {
      const y = ground(p.x, p.z);
      const pole = new THREE.Mesh(this.poleGeo, this.poleMat);
      pole.position.set(p.x, y + POLE_HEIGHT / 2, p.z);
      const square = new THREE.Mesh(this.squareGeo, this.mats.coalition);
      const triangle = new THREE.Mesh(this.triangleGeo, this.mats.veros);
      for (const f of [square, triangle]) { f.position.set(p.x + 0.15, y + POLE_HEIGHT, p.z); this.group.add(f); }
      this.group.add(pole);
      this.items.push({ pole, square, triangle });
    }
    this.update(points, ground);
  }

  update(points: readonly FlagPoint[], ground: (x: number, z: number) => number, wind = 0) {
    points.forEach((p, i) => {
      const it = this.items[i];
      if (!it) return;
      const y = ground(p.x, p.z);
      const lift = Math.min(1, Math.abs(p.v) / 100);
      const top = y + FLAG_SIZE[1] + (POLE_HEIGHT - FLAG_SIZE[1]) * lift;
      it.square.visible = p.v > 0;
      it.triangle.visible = p.v < 0;
      for (const f of [it.square, it.triangle]) { f.position.y = top; f.rotation.y = wind; }
    });
  }

  flagHeight(i: number) {
    const it = this.items[i];
    return it.square.visible ? it.square.position.y : it.triangle.visible ? it.triangle.position.y : null;
  }

  dispose() {
    this.poleGeo.dispose(); this.squareGeo.dispose(); this.triangleGeo.dispose(); this.poleMat.dispose();
    this.mats.coalition.dispose(); this.mats.veros.dispose();
    this.group.removeFromParent();
  }
}
