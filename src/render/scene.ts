import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { PAD_R, type Pad3, type Terrain } from '../sim/terrain';
import { roadMesh, TerrainChunks } from './terrainChunks';
import type { TimeOfDay } from '../sim/ai/awareness';
import { starField, TIME_PRESETS } from './timeOfDay';
import { treeOrder } from './quality';

export const WATER_SEGMENTS = 96;
export const SKY_HORIZON = new THREE.Color(0xbcd6ea);
export const FOG_GREY = new THREE.Color(0xb4b8bc);
export const FOG_BANK = { near: 60, far: 800 };
export const SUN_DIR = new THREE.Vector3(0.45, 0.8, 0.35).normalize();

export interface PadVisual {
  group: THREE.Group;
  lights: THREE.Mesh[];
  sock: THREE.Object3D;
}

export interface WorldScene {
  scene: THREE.Scene;
  sky: THREE.Mesh;
  pads: PadVisual[];
  beam: THREE.Mesh;
  shadow: THREE.Mesh;
  terrain: TerrainChunks;
  stars: THREE.Points;
  setTreeFraction(f: number): void;
  time: TimeOfDay;
  fog: boolean;
  setTime(time: TimeOfDay, fog?: boolean): void;
  dispose(): void;
}

export const SKY_SETTINGS = {
  turbidity: 2.5,
  rayleigh: 1.2,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.8,
  cloudCoverage: 0.35,
  cloudDensity: 0.45,
  cloudElevation: 0.5,
};

const SKY_EXPOSURE = 0.5;

const SKY_TONEMAP = `
vec3 skyRrt(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 skyAces(vec3 c) {
  const mat3 i = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 o = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c = o * skyRrt(i * (c / 0.6));
  return clamp(c, 0.0, 1.0);
}`;

function skyDome() {
  const sky = new Sky();
  sky.scale.setScalar(4500);
  const u = (sky.material as THREE.ShaderMaterial).uniforms;
  for (const [k, v] of Object.entries(SKY_SETTINGS)) u[k].value = v;
  u.sunPosition.value.copy(SUN_DIR);
  (sky.material as THREE.ShaderMaterial).onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${SKY_TONEMAP}\nvoid main() {`)
      .replace('#include <tonemapping_fragment>', `gl_FragColor.rgb = skyAces(gl_FragColor.rgb * ${SKY_EXPOSURE.toFixed(3)});`);
  };
  sky.renderOrder = -1;
  return sky;
}

function padTexture(p: Pad3) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#5d6168'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = p.base ? '#4cc9f0' : '#f1f1f1'; g.lineWidth = 12;
  g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  g.fillStyle = p.base ? '#4cc9f0' : '#f1f1f1';
  g.fillRect(84, 70, 20, 116); g.fillRect(152, 70, 20, 116); g.fillRect(84, 118, 88, 20);
  g.fillStyle = '#ffd166'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
  g.fillText(p.base ? 'FUEL' : p.name, 128, 226);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildPad(p: Pad3): PadVisual {
  const group = new THREE.Group();
  group.position.set(p.x, p.y, p.z);
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(PAD_R + 1, PAD_R + 1.5, 1, 40), new THREE.MeshLambertMaterial({ color: 0x55585e }));
  slab.position.y = -0.48;
  group.add(slab);
  const top = new THREE.Mesh(new THREE.CircleGeometry(PAD_R + 0.9, 40), new THREE.MeshLambertMaterial({ map: padTexture(p) }));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.03;
  group.add(top);

  const lights: THREE.Mesh[] = [];
  const lg = new THREE.SphereGeometry(0.12, 8, 6);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const m = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: p.base ? 0x4cc9f0 : 0xffd166 }));
    m.position.set(Math.cos(a) * (PAD_R + 0.6), 0.15, Math.sin(a) * (PAD_R + 0.6));
    group.add(m); lights.push(m);
  }

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
  pole.position.set(PAD_R + 5, 2.5, 0);
  group.add(pole);
  const sock = new THREE.Group();
  sock.position.set(PAD_R + 5, 4.8, 0);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.2, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0xff7b39, side: THREE.DoubleSide }));
  cone.rotation.z = Math.PI / 2; cone.position.x = 1.1;
  sock.add(cone);
  group.add(sock);
  return { group, lights, sock };
}

function trees(t: Terrain) {
  const n = t.trees.length;
  const canopy = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 1, 5), new THREE.MeshLambertMaterial({ color: 0x5a4330 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const c = new THREE.Color();
  treeOrder(n).forEach((k, i) => {
    const tr = t.trees[k];
    p.set(tr.x, tr.y + tr.h * 0.25 + tr.h * 0.375, tr.z); s.set(tr.r, tr.h * 0.75, tr.r);
    m.compose(p, q, s); canopy.setMatrixAt(i, m);
    c.setHSL(0.27 + (i % 7) * 0.012, 0.45, 0.2 + (i % 5) * 0.025); canopy.setColorAt(i, c);
    p.set(tr.x, tr.y + tr.h * 0.15, tr.z); s.set(1, tr.h * 0.3, 1);
    m.compose(p, q, s); trunk.setMatrixAt(i, m);
  });
  return [canopy, trunk];
}

function bridges(t: Terrain) {
  const group = new THREE.Group();
  const deck = new THREE.MeshLambertMaterial({ color: 0x77736b });
  for (const b of t.bridges) {
    const dx = b.to[0] - b.from[0], dz = b.to[1] - b.from[1], len = Math.hypot(dx, dz);
    const m = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, len), deck);
    m.position.set((b.from[0] + b.to[0]) / 2, b.y, (b.from[1] + b.to[1]) / 2);
    m.rotation.y = Math.atan2(dx, dz);
    group.add(m);
    for (let k = 0; k <= Math.floor(len / 40); k++) {
      const f = len ? k * 40 / len : 0;
      const px = b.from[0] + dx * f, pz = b.from[1] + dz * f;
      const ground = t.heightAt(px, pz);
      if (b.y - ground < 2) continue;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(2, b.y - ground, 2), deck);
      pier.position.set(px, (b.y + ground) / 2, pz);
      group.add(pier);
    }
  }
  return group;
}

function buildings(t: Terrain) {
  const group = new THREE.Group();
  const wall = new THREE.MeshLambertMaterial({ color: 0xe8dcc6 });
  const hangarMat = new THREE.MeshLambertMaterial({ color: 0x9aa3ad });
  const roof = new THREE.MeshLambertMaterial({ color: 0x8e3b2f });
  for (const b of t.buildings) {
    const wallH = b.kind === 'hangar' ? b.h * 0.6 : b.h;
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, wallH + 5, b.d), b.kind === 'hangar' ? hangarMat : wall);
    body.position.set(b.x, b.y + (wallH - 5) / 2, b.z);
    group.add(body);
    if (b.kind === 'house') {
      const r = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(b.w, b.d) / 2 * 1.02, 2.4, 4), roof);
      r.rotation.y = Math.PI / 4;
      r.scale.set(b.w / Math.hypot(b.w, b.d) * Math.SQRT2, 1, b.d / Math.hypot(b.w, b.d) * Math.SQRT2);
      r.position.set(b.x, b.y + b.h + 1.2, b.z);
      group.add(r);
    } else {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(b.d / 2, b.d / 2, b.w, 20), hangarMat);
      r.rotation.z = Math.PI / 2;
      r.position.set(b.x, b.y + b.h - b.d / 2, b.z);
      group.add(r);
    }
  }
  return group;
}

export function buildWorld(t: Terrain, detail: THREE.Texture | null = null): WorldScene {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY_HORIZON, 500, 3600);
  scene.background = SKY_HORIZON.clone();

  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x4a4030, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.copy(SUN_DIR).multiplyScalar(100);
  scene.add(sun);

  const sky = skyDome();
  scene.add(sky);
  const stars = starField();
  scene.add(stars);
  const terrain = new TerrainChunks(t, detail);
  scene.add(terrain.group);
  if (t.roads.length) scene.add(roadMesh(t));

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(t.size * 3, t.size * 3, WATER_SEGMENTS, WATER_SEGMENTS),
    new THREE.MeshPhongMaterial({ color: 0x2d6d8e, specular: 0x9fc8e0, shininess: 80, transparent: true, opacity: 0.88 }),
  );
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  const treeMeshes = trees(t);
  for (const m of treeMeshes) scene.add(m);
  scene.add(buildings(t));
  scene.add(bridges(t));

  const pads = t.pads.map(buildPad);
  for (const p of pads) scene.add(p.group);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(PAD_R - 1, PAD_R - 1, 500, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  scene.add(beam);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;
  scene.add(shadow);

  const view: WorldScene = {
    scene, sky, pads, beam, shadow, terrain, stars, time: 'day', fog: false,
    setTreeFraction(f: number) { for (const m of treeMeshes) m.count = Math.round(t.trees.length * Math.min(1, Math.max(0, f))); },
    setTime(time: TimeOfDay, fogBank = view.fog) {
      const p = TIME_PRESETS[time];
      view.time = time;
      view.fog = fogBank;
      const dir = new THREE.Vector3(...p.sun).normalize();
      sun.position.copy(dir).multiplyScalar(100);
      sun.color.setHex(p.sunColor); sun.intensity = p.sunIntensity;
      hemi.color.setHex(p.hemiSky); hemi.groundColor.setHex(p.hemiGround); hemi.intensity = p.hemiIntensity;
      const fog = scene.fog as THREE.Fog;
      fog.color.setHex(p.fog); fog.near = p.fogNear; fog.far = p.fogFar;
      if (fogBank) { fog.color.lerp(FOG_GREY, time === 'night' ? 0.15 : 0.6); fog.near = FOG_BANK.near; fog.far = FOG_BANK.far; }
      (scene.background as THREE.Color).copy(fog.color);
      sky.visible = p.sky && !fogBank;
      const u = (sky.material as THREE.ShaderMaterial).uniforms;
      if (p.sky) { u.sunPosition.value.copy(dir); u.rayleigh.value = p.rayleigh; u.turbidity.value = p.turbidity; }
      stars.visible = p.stars > 0;
      (beam.material as THREE.MeshBasicMaterial).opacity = time === 'night' ? 0.3 : 0.14;
    },
    dispose() {
      scene.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          const map = (mat as THREE.MeshLambertMaterial).map;
          if (map) map.dispose();
          mat.dispose();
        }
      });
    },
  };
  return view;
}
