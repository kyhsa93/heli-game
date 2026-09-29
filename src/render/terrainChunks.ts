import * as THREE from 'three';
import { ROAD_HALF_WIDTH, type Terrain } from '../sim/terrain';

export const CHUNK = 2000;
export const FAR_STEP = 4;
export const NEAR_DISTANCE = 2600;
export const SKIRT = 40;
export const DETAIL_TILE = 16;

const sand = new THREE.Color(0xc8b98a), wet = new THREE.Color(0x6f6a4f), grassA = new THREE.Color(0x4f7a34);
const grassB = new THREE.Color(0x76883f), rock = new THREE.Color(0x7a746b), snow = new THREE.Color(0xf2f4f6);

export function groundColor(t: Terrain, x: number, z: number, h: number, ny: number, out = new THREE.Color()) {
  if (h < 0) return out.copy(wet);
  if (h < 3) return out.copy(sand);
  out.copy(grassA).lerp(grassB, t.forest(x * 1.7, z * 1.7));
  if (t.forest(x, z) > 0.5) out.multiplyScalar(0.82);
  out.lerp(rock, Math.min(1, Math.max(0, (0.86 - ny) * 6)));
  if (h > 300) out.lerp(rock, Math.min(1, (h - 300) / 80));
  if (h > 400 && ny > 0.7) out.lerp(snow, Math.min(1, (h - 400) / 40));
  return out;
}

export function chunkGeometry(t: Terrain, ci: number, cj: number, step: number) {
  const per = Math.round(CHUNK / t.cell);
  const i0 = ci * per, j0 = cj * per;
  const cells = Math.min(per, t.n - i0), rows = Math.min(per, t.n - j0);
  const nx = Math.floor(cells / step) + 1, nz = Math.floor(rows / step) + 1;
  const ring = 2 * (nx + nz) - 4;
  const count = nx * nz + ring;
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  const c = new THREE.Color();
  const put = (k: number, i: number, j: number, drop: number) => {
    const gi = i0 + i * step, gj = j0 + j * step;
    const x = -t.half + gi * t.cell, z = -t.half + gj * t.cell;
    const h = t.heights[gj * (t.n + 1) + gi];
    const n = t.normalAt(x, z);
    pos.set([x, h - drop, z], k * 3);
    nor.set([n.x, n.y, n.z], k * 3);
    groundColor(t, x, z, h, n.y, c);
    col.set([c.r, c.g, c.b], k * 3);
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) put(j * nx + i, i, j, 0);
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  }
  const edge: number[] = [];
  for (let i = 0; i < nx; i++) edge.push(i);
  for (let j = 1; j < nz; j++) edge.push(j * nx + nx - 1);
  for (let i = nx - 2; i >= 0; i--) edge.push((nz - 1) * nx + i);
  for (let j = nz - 2; j > 0; j--) edge.push(j * nx);
  edge.forEach((v, k) => {
    const i = v % nx, j = Math.floor(v / nx);
    put(nx * nz + k, i, j, SKIRT);
  });
  for (let k = 0; k < edge.length; k++) {
    const a = edge[k], b = edge[(k + 1) % edge.length];
    const sa = nx * nz + k, sb = nx * nz + ((k + 1) % edge.length);
    idx.push(a, sa, b, b, sa, sb);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function terrainMaterial(detail: THREE.Texture | null) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  if (!detail) return mat;
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  detail.colorSpace = THREE.NoColorSpace;
  detail.anisotropy = 4;
  mat.onBeforeCompile = shader => {
    shader.uniforms.detailMap = { value: detail };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDetailPos;\nvarying float vDetailUp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDetailPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvDetailUp = normal.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D detailMap;\nvarying vec3 vDetailPos;\nvarying float vDetailUp;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec4 dA = texture2D(detailMap, vDetailPos.xz / ${DETAIL_TILE.toFixed(1)});
  vec4 dB = texture2D(detailMap, vDetailPos.xz / ${(DETAIL_TILE * 7.3).toFixed(1)});
  vec4 dt = mix(dA, dB, 0.35);
  float rockW = smoothstep(0.9, 0.7, vDetailUp);
  float snowW = smoothstep(380.0, 430.0, vDetailPos.y) * (1.0 - rockW);
  float dirtW = smoothstep(4.0, 1.0, vDetailPos.y);
  float grassW = max(0.0, 1.0 - rockW - snowW - dirtW);
  float d = dt.r * grassW + dt.g * rockW + dt.b * dirtW + dt.a * snowW;
  float fade = smoothstep(1400.0, 300.0, length(vDetailPos - cameraPosition));
  diffuseColor.rgb *= mix(1.0, 0.55 + d * 0.9, fade);`);
  };
  return mat;
}

interface Chunk { near: THREE.Mesh; far: THREE.Mesh; center: THREE.Vector3 }

export class TerrainChunks {
  readonly group = new THREE.Group();
  readonly chunks: Chunk[] = [];
  readonly material: THREE.MeshLambertMaterial;

  constructor(t: Terrain, detail: THREE.Texture | null) {
    this.material = terrainMaterial(detail);
    const per = Math.round(CHUNK / t.cell);
    const count = Math.ceil(t.n / per);
    for (let cj = 0; cj < count; cj++) {
      for (let ci = 0; ci < count; ci++) {
        const near = new THREE.Mesh(chunkGeometry(t, ci, cj, 1), this.material);
        const far = new THREE.Mesh(chunkGeometry(t, ci, cj, FAR_STEP), this.material);
        const cx = -t.half + (ci + 0.5) * CHUNK, cz = -t.half + (cj + 0.5) * CHUNK;
        near.visible = false;
        this.group.add(near, far);
        this.chunks.push({ near, far, center: new THREE.Vector3(Math.min(cx, t.half), 0, Math.min(cz, t.half)) });
      }
    }
  }

  update(camera: THREE.Vector3) {
    for (const c of this.chunks) {
      const d = Math.max(Math.abs(camera.x - c.center.x), Math.abs(camera.z - c.center.z));
      const near = d < NEAR_DISTANCE;
      c.near.visible = near;
      c.far.visible = !near;
    }
  }

  get nearCount() { return this.chunks.filter(c => c.near.visible).length; }
}

export function roadMesh(t: Terrain) {
  const pos: number[] = [], idx: number[] = [];
  for (const road of t.roads) {
    const pts: [number, number][] = [];
    for (let k = 0; k + 1 < road.length; k++) {
      const [ax, az] = road[k], [bx, bz] = road[k + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (t.cell / 2)));
      for (let s = 0; s < n; s++) pts.push([ax + (bx - ax) * s / n, az + (bz - az) * s / n]);
    }
    pts.push(road[road.length - 1]);
    const base = pos.length / 3;
    pts.forEach(([x, z], i) => {
      const [px, pz] = pts[Math.max(0, i - 1)], [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
      const dx = nx - px, dz = nz - pz, len = Math.hypot(dx, dz) || 1;
      const ox = -dz / len * ROAD_HALF_WIDTH, oz = dx / len * ROAD_HALF_WIDTH;
      for (const s of [-1, 1]) {
        const vx = x + ox * s, vz = z + oz * s;
        pos.push(vx, Math.max(0.3, t.heightAt(vx, vz)) + 0.25, vz);
      }
      if (i > 0) { const a = base + (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: 0x8a7355, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return new THREE.Mesh(g, mat);
}
