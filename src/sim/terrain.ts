import { clamp, rng, smooth } from '../core/math';

export const SIZE = 4000;
export const N = 320;
export const CELL = SIZE / N;
export const HALF = SIZE / 2;
export const PAD_R = 10;

export interface Pad3 { x: number; z: number; y: number; name: string; base: boolean }
export interface Tree { x: number; z: number; y: number; h: number; r: number }
export interface Building { x: number; z: number; y: number; w: number; d: number; h: number; kind: 'house' | 'hangar' }

const PAD_NAMES = 'HABCDFGJ';
const TREE_CELL = 50;

function makeNoise(seed: number) {
  const r = rng(seed);
  const P = 256;
  const vals = new Float32Array(P * P);
  for (let i = 0; i < vals.length; i++) vals[i] = r();
  const v = (x: number, y: number) => vals[(((y % P) + P) % P) * P + (((x % P) + P) % P)];
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = smooth(x - xi), w = smooth(y - yi);
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, oct: number) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += noise(x, y) * amp; norm += amp;
    x *= 2.03; y *= 2.03; amp *= 0.5;
  }
  return sum / norm;
}

export class Terrain {
  readonly heights = new Float32Array((N + 1) * (N + 1));
  readonly pads: Pad3[] = [];
  readonly trees: Tree[] = [];
  readonly buildings: Building[] = [];
  readonly forest: (x: number, z: number) => number;
  private treeGrid = new Map<number, Tree[]>();

  constructor(seed: number) {
    const r = rng(seed);
    const n1 = makeNoise(seed ^ 0x51ed), n2 = makeNoise(seed ^ 0x2c1b), n3 = makeNoise(seed ^ 0x7a3f);
    this.forest = (x, z) => fbm(n3, x / 420, z / 420, 3);

    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const x = -HALF + i * CELL, z = -HALF + j * CELL;
        const base = fbm(n1, x / 1100 + 17, z / 1100 + 5, 5);
        const ridge = 1 - Math.abs(fbm(n2, x / 650, z / 650, 4) * 2 - 1);
        let h = (base - 0.42) * 560 + ridge ** 3 * 190 * base;
        const d = Math.max(Math.abs(x), Math.abs(z)) / HALF;
        h += smooth(clamp((d - 0.74) / 0.26, 0, 1)) * 480;
        this.heights[j * (N + 1) + i] = h;
      }
    }

    this.placePads(r);
    this.placeBuildings(r);
    this.placeTrees(r);
  }

  private vtx(i: number, j: number) { return this.heights[clamp(j, 0, N) * (N + 1) + clamp(i, 0, N)]; }

  heightAt(x: number, z: number) {
    const fx = clamp((x + HALF) / CELL, 0, N - 1e-6), fz = clamp((z + HALF) / CELL, 0, N - 1e-6);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const h00 = this.vtx(i, j), h10 = this.vtx(i + 1, j), h01 = this.vtx(i, j + 1), h11 = this.vtx(i + 1, j + 1);
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  surfaceAt(x: number, z: number) { return Math.max(0, this.heightAt(x, z)); }

  normalAt(x: number, z: number) {
    const e = 2;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const nx = -dx, ny = 2 * e, nz = -dz, l = Math.hypot(nx, ny, nz);
    return { x: nx / l, y: ny / l, z: nz / l };
  }

  private relief(x: number, z: number, rad: number) {
    let lo = Infinity, hi = -Infinity;
    for (let dz = -rad; dz <= rad; dz += rad / 3) {
      for (let dx = -rad; dx <= rad; dx += rad / 3) {
        const h = this.heightAt(x + dx, z + dz);
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
    }
    return { lo, hi };
  }

  private placePads(r: () => number) {
    for (let relax = 0; relax < 4 && this.pads.length < PAD_NAMES.length; relax++) {
      for (let tries = 0; tries < 5000 && this.pads.length < PAD_NAMES.length; tries++) {
        const base = this.pads.length === 0;
        const span = base ? 500 : 1450;
        const x = (r() * 2 - 1) * span, z = (r() * 2 - 1) * span;
        const h = this.heightAt(x, z);
        if (h < 8 || h > 280) continue;
        const { lo, hi } = this.relief(x, z, 36);
        if (lo < 4 || hi - lo > 16 + relax * 10) continue;
        if (this.pads.some(p => Math.hypot(p.x - x, p.z - z) < 520 - relax * 60)) continue;
        this.pads.push({ x, z, y: h, name: PAD_NAMES[this.pads.length], base });
      }
    }
    for (const p of this.pads) {
      let sum = 0, cnt = 0;
      for (let dz = -12; dz <= 12; dz += 4) for (let dx = -12; dx <= 12; dx += 4) { sum += this.heightAt(p.x + dx, p.z + dz); cnt++; }
      p.y = Math.max(4, sum / cnt);
      this.flatten(p.x, p.z, p.y, 22, 70);
    }
  }

  private flatten(x: number, z: number, y: number, inner: number, outer: number) {
    const i0 = Math.floor((x - outer + HALF) / CELL), i1 = Math.ceil((x + outer + HALF) / CELL);
    const j0 = Math.floor((z - outer + HALF) / CELL), j1 = Math.ceil((z + outer + HALF) / CELL);
    for (let j = Math.max(0, j0); j <= Math.min(N, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(N, i1); i++) {
        const d = Math.hypot(-HALF + i * CELL - x, -HALF + j * CELL - z);
        if (d >= outer) continue;
        const t = d <= inner ? 1 : 1 - smooth((d - inner) / (outer - inner));
        const k = j * (N + 1) + i;
        this.heights[k] = this.heights[k] * (1 - t) + y * t;
      }
    }
  }

  private placeBuildings(r: () => number) {
    for (const p of this.pads) {
      const count = p.base ? 1 : 1 + Math.floor(r() * 3);
      for (let k = 0, tries = 0; k < count && tries < 60; tries++) {
        const ang = r() * Math.PI * 2, dist = p.base ? 42 : 45 + r() * 45;
        const x = p.x + Math.cos(ang) * dist, z = p.z + Math.sin(ang) * dist;
        const [w, d, h] = p.base ? [22, 16, 9] : [7 + r() * 4, 6 + r() * 3, 4 + r() * 3];
        const { lo, hi } = this.relief(x, z, Math.max(w, d) / 2);
        if (lo < 2 || hi - lo > 5) continue;
        if (this.buildings.some(b => Math.hypot(b.x - x, b.z - z) < 16)) continue;
        this.buildings.push({ x, z, y: lo, w, d, h, kind: p.base ? 'hangar' : 'house' });
        k++;
      }
    }
  }

  private placeTrees(r: () => number) {
    for (let tries = 0; tries < 16000 && this.trees.length < 4000; tries++) {
      const x = (r() * 2 - 1) * (HALF - 80), z = (r() * 2 - 1) * (HALF - 80);
      if (this.forest(x, z) < 0.5) continue;
      const y = this.heightAt(x, z);
      if (y < 3 || y > 330) continue;
      if (this.normalAt(x, z).y < 0.82) continue;
      if (this.pads.some(p => Math.hypot(p.x - x, p.z - z) < 60)) continue;
      if (this.buildings.some(b => Math.hypot(b.x - x, b.z - z) < 22)) continue;
      const h = 7 + r() * 9;
      const t: Tree = { x, z, y, h, r: h * 0.26 };
      this.trees.push(t);
      const key = this.treeKey(x, z);
      const list = this.treeGrid.get(key);
      if (list) list.push(t); else this.treeGrid.set(key, [t]);
    }
  }

  private treeKey(x: number, z: number) {
    return Math.floor((x + HALF) / TREE_CELL) * 1000 + Math.floor((z + HALF) / TREE_CELL);
  }

  treesNear(x: number, z: number): Tree[] {
    const out: Tree[] = [];
    const ci = Math.floor((x + HALF) / TREE_CELL), cj = Math.floor((z + HALF) / TREE_CELL);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const list = this.treeGrid.get((ci + di) * 1000 + cj + dj);
        if (list) out.push(...list);
      }
    }
    return out;
  }
}
