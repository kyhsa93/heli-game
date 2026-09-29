import { clamp, rng, smooth } from '../core/math';

export const DEFAULT_SIZE = 4000;
export const MISSION_SIZE = 12000;
export const CELL = 12.5;
export const PAD_R = 10;
export const ROAD_HALF_WIDTH = 4;
export const ROAD_SHOULDER = 15;
export const ROAD_FLAT = ROAD_HALF_WIDTH + CELL * 1.5;

export type Vec2 = [number, number];

export type TerrainFeature =
  | { kind: 'village'; center: Vec2; radius: number; houses?: number }
  | { kind: 'base'; center: Vec2; radius: number }
  | { kind: 'flatten'; center: Vec2; radius: number }
  | { kind: 'forest'; center: Vec2; radius: number; density?: number }
  | { kind: 'bridge'; from: Vec2; to: Vec2 };

export interface TerrainOptions {
  size?: number;
  features?: readonly TerrainFeature[];
  roads?: readonly Vec2[][];
  pads?: readonly { x: number; z: number; name: string; base?: boolean }[];
}

export interface Bridge { from: Vec2; to: Vec2; y: number }

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
  readonly size: number;
  readonly n: number;
  readonly cell = CELL;
  readonly half: number;
  readonly heights: Float32Array;
  readonly pads: Pad3[] = [];
  readonly trees: Tree[] = [];
  readonly buildings: Building[] = [];
  readonly bridges: Bridge[] = [];
  readonly roads: Vec2[][];
  readonly forest: (x: number, z: number) => number;
  private treeGrid = new Map<number, Tree[]>();

  constructor(seed: number, opts: TerrainOptions = {}) {
    this.size = opts.size ?? DEFAULT_SIZE;
    this.n = Math.round(this.size / CELL);
    this.half = this.size / 2;
    this.heights = new Float32Array((this.n + 1) * (this.n + 1));
    this.roads = (opts.roads ?? []).map(r => r.map(p => [p[0], p[1]] as Vec2));
    const N = this.n, HALF = this.half;
    const r = rng(seed);
    const n1 = makeNoise(seed ^ 0x51ed), n2 = makeNoise(seed ^ 0x2c1b), n3 = makeNoise(seed ^ 0x7a3f);
    const forests = (opts.features ?? []).filter((f): f is Extract<TerrainFeature, { kind: 'forest' }> => f.kind === 'forest');
    this.forest = (x, z) => {
      let v = fbm(n3, x / 420, z / 420, 3);
      for (const f of forests) {
        const d = Math.hypot(x - f.center[0], z - f.center[1]) / f.radius;
        if (d < 1) v = Math.max(v, 0.5 + (f.density ?? 0.6) * 0.5 * (1 - d * d));
      }
      return v;
    };

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

    for (const f of opts.features ?? []) {
      if (f.kind === 'flatten' || f.kind === 'base' || f.kind === 'village') {
        const y = Math.max(4, this.meanHeight(f.center[0], f.center[1], f.radius * 0.5));
        this.flatten(f.center[0], f.center[1], y, f.radius * (f.kind === 'village' ? 0.6 : 1), f.radius * (f.kind === 'village' ? 1.2 : 1.6));
      } else if (f.kind === 'bridge') {
        const y = Math.max(6, (this.heightAt(f.from[0], f.from[1]) + this.heightAt(f.to[0], f.to[1])) / 2);
        this.bridges.push({ from: f.from, to: f.to, y });
      }
    }
    for (const road of this.roads) this.flattenRoad(road);

    if (opts.pads) this.setPads(opts.pads);
    else this.placePads(r);
    for (const f of opts.features ?? []) if (f.kind === 'village') this.placeVillage(r, f.center, f.radius, f.houses ?? 6);
    this.placeBuildings(r);
    this.placeTrees(r);
  }

  private meanHeight(x: number, z: number, rad: number) {
    let sum = 0, cnt = 0;
    const step = Math.max(4, rad / 4);
    for (let dz = -rad; dz <= rad; dz += step) for (let dx = -rad; dx <= rad; dx += step) { sum += this.heightAt(x + dx, z + dz); cnt++; }
    return sum / cnt;
  }

  private vtx(i: number, j: number) { const N = this.n; return this.heights[clamp(j, 0, N) * (N + 1) + clamp(i, 0, N)]; }

  heightAt(x: number, z: number) {
    const N = this.n, HALF = this.half;
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

  private setPads(list: readonly { x: number; z: number; name: string; base?: boolean }[]) {
    list.forEach((p, i) => {
      const y = Math.max(4, this.meanHeight(p.x, p.z, 12));
      this.pads.push({ x: p.x, z: p.z, y, name: p.name, base: p.base ?? i === 0 });
      this.flatten(p.x, p.z, y, 22, 70);
    });
  }

  roadHeightAt(x: number, z: number): number | null {
    let best: number | null = null, bestD = ROAD_HALF_WIDTH + 0.01;
    for (const road of this.roads) {
      for (let k = 0; k + 1 < road.length; k++) {
        const [ax, az] = road[k], [bx, bz] = road[k + 1];
        const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
        const t = len2 > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1) : 0;
        const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
        if (d < bestD) { bestD = d; best = this.heightAt(x, z); }
      }
    }
    return best;
  }

  private flattenRoad(road: readonly Vec2[]) {
    const pts: { x: number; z: number; y: number }[] = [];
    for (let k = 0; k + 1 < road.length; k++) {
      const [ax, az] = road[k], [bx, bz] = road[k + 1];
      const len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(len / 25));
      for (let s = 0; s < steps; s++) { const t = s / steps; pts.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, y: 0 }); }
    }
    const last = road[road.length - 1];
    pts.push({ x: last[0], z: last[1], y: 0 });
    for (const p of pts) p.y = this.heightAt(p.x, p.z);
    const smoothY = pts.map((_, i) => {
      let sum = 0, cnt = 0;
      for (let k = Math.max(0, i - 4); k <= Math.min(pts.length - 1, i + 4); k++) { sum += pts[k].y; cnt++; }
      return Math.max(1.5, sum / cnt);
    });
    const N = this.n, HALF = this.half, reach = ROAD_FLAT + ROAD_SHOULDER;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1], ya = smoothY[k], yb = smoothY[k + 1];
      const i0 = Math.floor((Math.min(a.x, b.x) - reach + HALF) / CELL), i1 = Math.ceil((Math.max(a.x, b.x) + reach + HALF) / CELL);
      const j0 = Math.floor((Math.min(a.z, b.z) - reach + HALF) / CELL), j1 = Math.ceil((Math.max(a.z, b.z) + reach + HALF) / CELL);
      const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
      for (let j = Math.max(0, j0); j <= Math.min(N, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(N, i1); i++) {
          const x = -HALF + i * CELL, z = -HALF + j * CELL;
          const t = len2 > 0 ? clamp(((x - a.x) * dx + (z - a.z) * dz) / len2, 0, 1) : 0;
          const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
          if (d >= reach) continue;
          const y = ya + (yb - ya) * t;
          const w = d <= ROAD_FLAT ? 1 : 1 - smooth((d - ROAD_FLAT) / (reach - ROAD_FLAT));
          const idx = j * (N + 1) + i;
          this.heights[idx] = this.heights[idx] * (1 - w) + y * w;
        }
      }
    }
  }

  private placeVillage(r: () => number, center: Vec2, radius: number, houses: number) {
    for (let k = 0, tries = 0; k < houses && tries < houses * 30; tries++) {
      const ang = r() * Math.PI * 2, dist = Math.sqrt(r()) * radius;
      const x = center[0] + Math.cos(ang) * dist, z = center[1] + Math.sin(ang) * dist;
      const [w, d, h] = [7 + r() * 4, 6 + r() * 3, 4 + r() * 3];
      const { lo, hi } = this.relief(x, z, Math.max(w, d) / 2);
      if (lo < 2 || hi - lo > 5) continue;
      if (this.buildings.some(b => Math.hypot(b.x - x, b.z - z) < 14)) continue;
      if (this.roadHeightAt(x, z) !== null || this.roads.some(rd => rd.some(p => Math.hypot(p[0] - x, p[1] - z) < 10))) continue;
      this.buildings.push({ x, z, y: lo, w, d, h, kind: 'house' });
      k++;
    }
  }

  private placePads(r: () => number) {
    const HALF = this.half;
    const spread = Math.min(HALF - 550, 1450 * (this.size / DEFAULT_SIZE));
    for (let relax = 0; relax < 4 && this.pads.length < PAD_NAMES.length; relax++) {
      for (let tries = 0; tries < 5000 && this.pads.length < PAD_NAMES.length; tries++) {
        const base = this.pads.length === 0;
        const span = base ? 500 : spread;
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
    const N = this.n, HALF = this.half;
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
    const HALF = this.half, area = (this.size / DEFAULT_SIZE) ** 2;
    const max = Math.round(4000 * Math.min(area, 5)), budget = Math.round(16000 * Math.min(area, 5));
    for (let tries = 0; tries < budget && this.trees.length < max; tries++) {
      const x = (r() * 2 - 1) * (HALF - 80), z = (r() * 2 - 1) * (HALF - 80);
      if (this.forest(x, z) < 0.5) continue;
      const y = this.heightAt(x, z);
      if (y < 3 || y > 330) continue;
      if (this.normalAt(x, z).y < 0.82) continue;
      if (this.pads.some(p => Math.hypot(p.x - x, p.z - z) < 60)) continue;
      if (this.buildings.some(b => Math.hypot(b.x - x, b.z - z) < 22)) continue;
      if (this.roads.length && this.nearRoad(x, z, 8)) continue;
      const h = 7 + r() * 9;
      const t: Tree = { x, z, y, h, r: h * 0.26 };
      this.trees.push(t);
      const key = this.treeKey(x, z);
      const list = this.treeGrid.get(key);
      if (list) list.push(t); else this.treeGrid.set(key, [t]);
    }
  }

  nearRoad(x: number, z: number, dist: number) {
    for (const road of this.roads) {
      for (let k = 0; k + 1 < road.length; k++) {
        const [ax, az] = road[k], [bx, bz] = road[k + 1];
        const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
        const t = len2 > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1) : 0;
        if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < dist) return true;
      }
    }
    return false;
  }

  private treeKey(x: number, z: number) {
    const HALF = this.half;
    return Math.floor((x + HALF) / TREE_CELL) * 10000 + Math.floor((z + HALF) / TREE_CELL);
  }

  treesNear(x: number, z: number): Tree[] {
    const out: Tree[] = [];
    const HALF = this.half;
    const ci = Math.floor((x + HALF) / TREE_CELL), cj = Math.floor((z + HALF) / TREE_CELL);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const list = this.treeGrid.get((ci + di) * 10000 + cj + dj);
        if (list) out.push(...list);
      }
    }
    return out;
  }
}
