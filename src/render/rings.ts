import * as THREE from 'three';
import type { RingMarker } from '../sim/objective';

const COLOR: Record<RingMarker['state'], number> = { next: 0xffd166, done: 0x06d6a0, ahead: 0xe8eef7 };
const OPACITY: Record<RingMarker['state'], number> = { next: 0.95, done: 0.25, ahead: 0.45 };

export class RingGates {
  readonly group = new THREE.Group();
  private geo = new THREE.TorusGeometry(1, 0.06, 8, 40);
  private meshes: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];

  update(markers: readonly RingMarker[]) {
    while (this.meshes.length < markers.length) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      this.meshes.push(m);
      this.group.add(m);
    }
    this.meshes.forEach((m, i) => {
      const r = markers[i];
      m.visible = !!r;
      if (!r) return;
      m.position.set(r.x, r.y, r.z);
      m.rotation.set(0, r.heading, 0);
      m.scale.setScalar(r.size * 0.95);
      m.material.color.setHex(COLOR[r.state]);
      m.material.opacity = OPACITY[r.state];
    });
  }

  dispose() {
    this.geo.dispose();
    for (const m of this.meshes) m.material.dispose();
  }
}
