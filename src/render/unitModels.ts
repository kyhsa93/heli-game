import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Category, UnitDef } from '../sim/units';

export const MODEL_FOR_UNIT: Readonly<Record<string, string>> = {
  tank: 'tank', c_tank: 'tank',
  apc: 'apc', c_apc: 'apc',
  truck: 'truck', c_truck: 'truck',
  fuel_truck: 'fuel_truck',
  technical: 'technical',
  inf: 'soldier', inf_mg: 'soldier', manpads: 'soldier', c_inf: 'soldier',
  civ_car: 'civ_car',
};

export const MODEL_YAW: Readonly<Record<string, number>> = {};

export const GLTF_FORWARD_FIX = Math.PI;

export const SOLDIER_HEIGHT = 1.8;

function readPixels(tex: THREE.Texture | null | undefined): ImageData | null {
  const img = tex?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || typeof document === 'undefined' || !img.width) return null;
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, cv.width, cv.height);
}

export function toFloat(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const n = a.count, k = a.itemSize, out = new Float32Array(n * k);
  for (let i = 0; i < n; i++) {
    out[i * k] = a.getX(i);
    if (k > 1) out[i * k + 1] = a.getY(i);
    if (k > 2) out[i * k + 2] = a.getZ(i);
    if (k > 3) out[i * k + 3] = a.getW(i);
  }
  return new THREE.BufferAttribute(out, k);
}

function bakeMesh(mesh: THREE.Mesh, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const count = src.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const groups = src.groups.length ? src.groups : [{ start: 0, count, materialIndex: 0 }];
  const uv = src.getAttribute('uv');
  const vc = src.getAttribute('color');
  const c = new THREE.Color();
  for (const gr of groups) {
    const m = (mats[gr.materialIndex ?? 0] ?? mats[0]) as THREE.MeshStandardMaterial;
    const base = m?.color ?? new THREE.Color(1, 1, 1);
    const px = readPixels(m?.map);
    for (let i = gr.start; i < Math.min(count, gr.start + gr.count); i++) {
      c.copy(base);
      if (px && uv) {
        const u = ((uv.getX(i) % 1) + 1) % 1, v = ((uv.getY(i) % 1) + 1) % 1;
        const x = Math.min(px.width - 1, Math.floor(u * px.width)), y = Math.min(px.height - 1, Math.floor(v * px.height));
        const k = (y * px.width + x) * 4;
        c.multiply(new THREE.Color().setRGB(px.data[k] / 255, px.data[k + 1] / 255, px.data[k + 2] / 255, THREE.SRGBColorSpace));
      }
      if (vc) c.multiply(new THREE.Color(vc.getX(i), vc.getY(i), vc.getZ(i)));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', toFloat(src.getAttribute('position')));
  if (src.getAttribute('normal')) out.setAttribute('normal', toFloat(src.getAttribute('normal')));
  out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  out.applyMatrix4(matrix);
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  return out;
}

export function bakeScene(scene: THREE.Object3D): THREE.BufferGeometry {
  scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  scene.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry && m.visible) parts.push(bakeMesh(m, m.matrixWorld));
  });
  const geo = mergeGeometries(parts.map(p => { for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'color'].includes(k)) p.deleteAttribute(k); return p; }), false)!;
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox!.min.y, 0);
  geo.computeBoundingSphere();
  return geo;
}

export function bakeModel(scene: THREE.Object3D, def: UnitDef, modelKey: string): THREE.BufferGeometry {
  scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  scene.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) parts.push(bakeMesh(m, m.matrixWorld));
  });
  const merged = mergeGeometries(parts, false)!;
  merged.rotateY(GLTF_FORWARD_FIX);
  normalize(merged, def, modelKey);
  return merged;
}

export function normalize(geo: THREE.BufferGeometry, def: UnitDef, modelKey: string) {
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
  const yaw = MODEL_YAW[modelKey] ?? (sx > sz * 1.15 ? Math.PI / 2 : 0);
  const center = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
  geo.translate(-center.x, -center.y, -center.z);
  if (yaw) geo.rotateY(yaw);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const scale = modelKey === 'soldier'
    ? SOLDIER_HEIGHT / Math.max(1e-6, bb.max.y - bb.min.y)
    : def.size[2] / Math.max(1e-6, bb.max.z - bb.min.z);
  geo.scale(scale, scale, scale);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

function coloredBox(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y + h / 2, z);
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

export function fallbackModel(def: UnitDef, category: Category): THREE.BufferGeometry {
  const [w, h, l] = def.size;
  const olive = 0x5b6444, dark = 0x2e3326, grey = 0x8a8f96;
  let parts: THREE.BufferGeometry[];
  switch (category) {
    case 'tracked':
      parts = [coloredBox(w, h * 0.45, l, olive), coloredBox(w * 0.6, h * 0.3, l * 0.4, olive, 0, h * 0.45, 0.05 * l), coloredBox(0.25, 0.25, l * 0.55, dark, 0, h * 0.58, -l * 0.45)];
      break;
    case 'vehicle':
      parts = [coloredBox(w, h * 0.55, l, olive, 0, h * 0.1), coloredBox(w, h * 0.35, l * 0.3, dark, 0, h * 0.65, -l * 0.33)];
      break;
    case 'airDefense':
      parts = [coloredBox(w, h * 0.4, l, olive), coloredBox(w * 0.7, h * 0.35, l * 0.45, olive, 0, h * 0.4, 0), coloredBox(w * 0.6, h * 0.25, 0.3, dark, 0, h * 0.72, -l * 0.25)];
      break;
    case 'infantry':
      parts = [coloredBox(0.5, 1.4, 0.35, olive), coloredBox(0.3, 0.3, 0.3, dark, 0, 1.45, 0)];
      break;
    case 'air': {
      const glass = 0x9fb3c2, blade = l * 0.95;
      parts = [
        coloredBox(w * 0.34, h * 0.34, l * 0.5, olive, 0, h * 0.18, 0),
        coloredBox(w * 0.24, h * 0.22, l * 0.14, olive, 0, h * 0.16, -l * 0.31),
        coloredBox(w * 0.2, h * 0.16, l * 0.1, glass, 0, h * 0.36, -l * 0.29),
        coloredBox(w * 0.24, h * 0.2, l * 0.12, glass, 0, h * 0.44, -l * 0.18),
        coloredBox(w * 0.3, h * 0.14, l * 0.24, dark, 0, h * 0.52, l * 0.02),
        coloredBox(w * 0.98, 0.14, l * 0.09, olive, 0, h * 0.34, l * 0.04),
        coloredBox(0.5, 0.5, 1.7, dark, -w * 0.42, h * 0.24, l * 0.03),
        coloredBox(0.5, 0.5, 1.7, dark, w * 0.42, h * 0.24, l * 0.03),
        coloredBox(0.55, 0.55, l * 0.44, olive, 0, h * 0.4, l * 0.44),
        coloredBox(0.16, h * 0.42, 1.5, olive, 0, h * 0.5, l * 0.63),
        coloredBox(0.12, 0.12, 0.9, dark, 0, h * 0.66, 0),
        coloredBox(blade, 0.06, 0.45, dark, 0, h * 0.78, 0),
        coloredBox(0.45, 0.06, blade, dark, 0, h * 0.78, 0),
      ];
      break;
    }
    default:
      parts = [coloredBox(w, h, l, def.side === 'civilian' ? 0xd8cdb4 : grey)];
  }
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function bakeProp(scene: THREE.Object3D, extent: number): THREE.BufferGeometry {
  scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  scene.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) parts.push(bakeMesh(m, m.matrixWorld));
  });
  const geo = mergeGeometries(parts, false)!;
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  const k = extent / Math.max(1e-6, b.max.x - b.min.x, b.max.z - b.min.z);
  geo.scale(k, k, k);
  geo.computeBoundingSphere();
  return geo;
}
