import * as THREE from 'three';

export const HIP_FOV = 80;
export const ADS_FOV = 55;
export const ADS_TIME = 0.2;
export const HIP_POS = new THREE.Vector3(0.16, -0.19, -0.42);
export const ADS_POS = new THREE.Vector3(0, -0.105, -0.3);

function part(g: THREE.Group, w: number, h: number, d: number, color: number, x: number, y: number, z: number, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  m.rotation.x = rx;
  g.add(m);
  return m;
}

export function rifleModel() {
  const g = new THREE.Group();
  const metal = 0x2b2e31, polymer = 0x3a3d35, skin = 0xb08a6e, glove = 0x4a4436;
  part(g, 0.05, 0.07, 0.42, metal, 0, 0, 0);
  part(g, 0.022, 0.022, 0.3, metal, 0, 0.012, -0.36);
  part(g, 0.04, 0.12, 0.05, polymer, 0, -0.08, 0.02, 0.25);
  part(g, 0.045, 0.06, 0.2, polymer, 0, -0.01, 0.3);
  part(g, 0.035, 0.03, 0.1, metal, 0, 0.05, -0.02);
  part(g, 0.05, 0.05, 0.16, polymer, 0, -0.005, -0.2);
  part(g, 0.07, 0.05, 0.1, glove, -0.015, -0.05, -0.2);
  part(g, 0.06, 0.07, 0.09, glove, 0.01, -0.07, 0.07);
  part(g, 0.05, 0.05, 0.25, skin, -0.07, -0.08, -0.05, -0.4);
  part(g, 0.05, 0.05, 0.25, skin, 0.08, -0.11, 0.18, -0.3);
  return g;
}

export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(HIP_FOV, 1, 0.01, 10);
  readonly gun = rifleModel();
  aim = 0;

  constructor() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(0.4, 1, 0.3);
    this.scene.add(sun);
    this.scene.add(this.gun);
  }

  update(dt: number, ads: boolean, aspect: number, speed: number, time: number) {
    this.aim = Math.max(0, Math.min(1, this.aim + (ads ? dt : -dt) / ADS_TIME));
    this.camera.aspect = aspect;
    this.camera.fov = fovFor(this.aim);
    this.camera.updateProjectionMatrix();
    const bob = Math.min(1, speed / 5) * (1 - this.aim) * 0.012;
    this.gun.position.lerpVectors(HIP_POS, ADS_POS, this.aim);
    this.gun.position.y += Math.sin(time * 9) * bob;
    this.gun.position.x += Math.cos(time * 4.5) * bob;
  }

  dispose() {
    this.gun.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  }
}

export function fovFor(aim: number) {
  return HIP_FOV + (ADS_FOV - HIP_FOV) * aim;
}
