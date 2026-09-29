import * as THREE from 'three';
import { beamDirection, isSearchlight, lampPosition } from '../sim/ai/searchlight';
import type { World } from '../sim/world';

const BEAM_LENGTH = 1400;

const VERT = `
varying float vT;
void main() {
  vT = position.y / ${BEAM_LENGTH.toFixed(1)};
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
varying float vT;
void main() {
  float a = 0.55 * pow(1.0 - clamp(vT, 0.0, 1.0), 1.3);
  gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * a, a);
}`;

export class SearchlightBeams {
  readonly group = new THREE.Group();
  private geo: THREE.ConeGeometry;
  private mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  private lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc, fog: false });
  private lampGeo = new THREE.SphereGeometry(0.6, 10, 8);
  private beams: THREE.Mesh[] = [];
  private lamps: THREE.Mesh[] = [];
  private dir = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.geo = new THREE.ConeGeometry(Math.tan(5 * Math.PI / 180) * BEAM_LENGTH, BEAM_LENGTH, 24, 1, true);
    this.geo.translate(0, -BEAM_LENGTH / 2, 0);
    this.geo.rotateX(Math.PI);
  }

  update(world: World) {
    const lights = world.conditions.time === 'night' ? world.units.filter(u => isSearchlight(u) && u.alive && u.beam) : [];
    while (this.beams.length < lights.length) {
      const b = new THREE.Mesh(this.geo, this.mat), l = new THREE.Mesh(this.lampGeo, this.lampMat);
      b.renderOrder = 2;
      this.beams.push(b); this.lamps.push(l);
      this.group.add(b, l);
    }
    this.beams.forEach((b, i) => {
      const u = lights[i];
      b.visible = this.lamps[i].visible = !!u;
      if (!u) return;
      lampPosition(u, b.position);
      this.lamps[i].position.copy(b.position);
      b.quaternion.setFromUnitVectors(this.up, beamDirection(u.beam!, this.dir));
    });
  }

  dispose() {
    this.geo.dispose(); this.mat.dispose(); this.lampGeo.dispose(); this.lampMat.dispose();
  }
}
