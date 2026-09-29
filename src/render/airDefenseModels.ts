import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const OLIVE = 0x5b6444, DARK = 0x2e3326, METAL = 0x4a4f55, SAND = 0xa89366, GLASS = 0x2a3a44;

function paint(g: THREE.BufferGeometry, color: number) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
  return geo;
}

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, rx = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(rx); g.rotateY(ry);
  g.translate(x, y, z);
  return paint(g, color);
}

function tube(r: number, len: number, color: number, x: number, y: number, z: number, elev = 0, seg = 8) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -len / 2);
  g.rotateX(elev);
  g.translate(x, y, z);
  return paint(g, color);
}

function disc(r: number, t: number, color: number, x: number, y: number, z: number, tilt = 0) {
  const g = new THREE.CylinderGeometry(r, r, t, 16);
  g.rotateX(Math.PI / 2 + tilt);
  g.translate(x, y, z);
  return paint(g, color);
}

function wheel(x: number, z: number) {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12);
  g.rotateZ(Math.PI / 2);
  g.translate(x, 0.5, z);
  return paint(g, DARK);
}

function tracks(w: number, l: number) {
  return [box(0.55, 0.9, l, DARK, -w / 2 + 0.28, 0.45, 0), box(0.55, 0.9, l, DARK, w / 2 - 0.28, 0.45, 0)];
}

function spaag(): THREE.BufferGeometry[] {
  const parts = [...tracks(3.1, 6.3), box(2.2, 0.8, 6.1, OLIVE, 0, 1.1, 0), box(2.5, 0.9, 2.8, OLIVE, 0, 1.95, 0.3)];
  for (const x of [-0.75, -0.45, 0.45, 0.75]) parts.push(tube(0.06, 2.4, METAL, x, 2.15, -1.0, 0.3));
  parts.push(box(0.12, 1.0, 0.12, METAL, 0, 2.8, 1.3), disc(0.65, 0.08, METAL, 0, 3.35, 1.3, -0.3));
  return parts;
}

function samShort(): THREE.BufferGeometry[] {
  const parts = [
    box(2.6, 0.5, 7.2, DARK, 0, 0.55, 0), box(2.5, 1.6, 2.0, OLIVE, 0, 1.6, -2.6), box(2.3, 0.6, 0.1, GLASS, 0, 1.9, -3.62),
    box(2.6, 1.0, 4.8, OLIVE, 0, 1.3, 1.0), box(1.2, 0.5, 1.2, METAL, 0, 2.05, 1.4),
  ];
  for (const x of [-0.95, 0.95]) for (const y of [0, 0.42]) for (const k of [-0.2, 0.2]) parts.push(tube(0.17, 3.2, OLIVE, x + k, 2.6 + y, 2.6, 0.5));
  parts.push(box(1.4, 1.1, 0.25, METAL, 0, 3.1, 1.0, -0.2), disc(0.55, 0.12, METAL, 0, 3.8, 1.6, 0.2));
  for (let i = 0; i < 6; i++) parts.push(wheel(1.35 * (i % 2 ? 1 : -1), -2.4 + Math.floor(i / 2) * 2.4));
  return parts;
}

function samRadar(): THREE.BufferGeometry[] {
  const parts = [box(8, 0.4, 8, METAL, 0, 0.2, 0), box(2.4, 2.0, 3.5, OLIVE, -2.4, 1.4, 1.8), box(2.4, 2.0, 3.5, OLIVE, 2.4, 1.4, 1.8)];
  parts.push(tube(0.25, 3.2, METAL, 0, 0.4, 0, -Math.PI / 2));
  parts.push(box(5.2, 2.6, 0.25, OLIVE, 0, 4.5, -0.6, -0.35));
  for (let i = -2; i <= 2; i++) parts.push(box(0.12, 2.4, 0.3, DARK, i * 1.0, 4.5, -0.45, -0.35));
  parts.push(box(1.2, 0.8, 1.2, METAL, 0, 3.3, 0));
  return parts;
}

function aaaLight(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    parts.push(box(1.3, 0.7, 0.6, SAND, Math.sin(a) * 1.85, 0.35, Math.cos(a) * 1.85, 0, a));
  }
  parts.push(box(1.1, 0.5, 1.6, OLIVE, 0, 0.55, 0), box(0.9, 0.7, 0.9, OLIVE, 0, 1.1, 0.1));
  for (const x of [-0.18, 0.18]) parts.push(tube(0.05, 2.2, METAL, x, 1.3, -0.2, 0.35));
  parts.push(box(0.35, 0.5, 0.35, DARK, 0.6, 1.1, 0.3));
  return parts;
}

const BUILDERS: Record<string, () => THREE.BufferGeometry[]> = { spaag, sam_short: samShort, sam_radar: samRadar, aaa_light: aaaLight };

export function hasAirDefenseModel(defId: string) {
  return defId in BUILDERS;
}

export function airDefenseModel(defId: string): THREE.BufferGeometry {
  const g = mergeGeometries(BUILDERS[defId](), false)!;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
