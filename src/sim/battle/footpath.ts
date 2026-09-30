import { waterDepth, WADE_DEPTH } from '../infantry/movement';
import type { Terrain } from '../terrain';

export const FOOT_CELL = 4;
export const FOOT_SLOPE_DEG = 32;
export const FOOT_AHEAD = 5;

export interface FootBounds { minX: number; minZ: number; maxX: number; maxZ: number }

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

export class FootField {
  readonly nx: number;
  readonly nz: number;
  readonly dist: Float64Array;

  constructor(readonly terrain: Terrain, gx: number, gz: number, readonly bounds: FootBounds, readonly cell = FOOT_CELL, slopeDeg = FOOT_SLOPE_DEG) {
    this.nx = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.nz = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    const n = this.nx, total = n * this.nz, flat = Math.cos((slopeDeg * Math.PI) / 180);
    const h = new Float32Array(total), open = new Uint8Array(total), gentle = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      const [x, z] = this.center(i);
      h[i] = terrain.surfaceAt(x, z);
      open[i] = waterDepth(terrain, x, z) <= WADE_DEPTH ? 1 : 0;
      gentle[i] = terrain.onBridge(x, z, 4) !== null || terrain.normalAt(x, z).y >= flat ? 1 : 0;
    }
    const climb = (to: number, from: number) => {
      if (h[to] <= h[from]) return true;
      if (!gentle[to]) return false;
      const [ax, az] = this.center(to), [bx, bz] = this.center(from);
      return terrain.normalAt((ax + bx) / 2, (az + bz) / 2).y >= flat;
    };
    this.dist = new Float64Array(total).fill(Infinity);
    const start = this.index(gx, gz);
    this.dist[start] = 0;
    const heap = new MinHeap(total);
    heap.push(start, 0);
    while (heap.size) {
      const key = heap.topKey(), i = heap.pop(), d = this.dist[i], cx = i % n, cz = (i - cx) / n;
      if (key > d) continue;
      for (const [dx, dz] of DIRS) {
        const x = cx + dx, z = cz + dz;
        if (x < 1 || z < 1 || x >= n - 1 || z >= this.nz - 1) continue;
        const j = z * n + x;
        if (!open[j]) continue;
        const run = cell * (dx && dz ? Math.SQRT2 : 1);
        if (!climb(i, j)) continue;
        const nd = d + run;
        if (nd < this.dist[j]) { this.dist[j] = nd; heap.push(j, nd); }
      }
    }
  }

  contains(x: number, z: number) {
    const b = this.bounds;
    return x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
  }

  index(x: number, z: number) {
    const cx = Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.bounds.minX) / this.cell)));
    const cz = Math.min(this.nz - 1, Math.max(0, Math.floor((z - this.bounds.minZ) / this.cell)));
    return cz * this.nx + cx;
  }

  center(i: number): [number, number] {
    const cx = i % this.nx, cz = (i - cx) / this.nx;
    return [this.bounds.minX + cx * this.cell + this.cell / 2, this.bounds.minZ + cz * this.cell + this.cell / 2];
  }

  next(x: number, z: number, ahead = FOOT_AHEAD): [number, number] | null {
    let i = this.index(x, z);
    if (!Number.isFinite(this.dist[i])) i = this.nearestOpen(i);
    if (i < 0) return null;
    for (let k = 0; k < ahead; k++) {
      const cx = i % this.nx, cz = (i - cx) / this.nx;
      let best = i;
      for (const [dx, dz] of DIRS) {
        const j = (cz + dz) * this.nx + cx + dx;
        if (j >= 0 && j < this.dist.length && this.dist[j] < this.dist[best]) best = j;
      }
      if (best === i) break;
      i = best;
    }
    return this.center(i);
  }

  private nearestOpen(i: number) {
    const cx = i % this.nx, cz = (i - cx) / this.nx;
    for (let r = 1; r < 6; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const j = (cz + dz) * this.nx + cx + dx;
      if (j >= 0 && j < this.dist.length && Number.isFinite(this.dist[j])) return j;
    }
    return -1;
  }
}

class MinHeap {
  private ids: Int32Array;
  private keys: Float64Array;
  size = 0;

  constructor(cap: number) { this.ids = new Int32Array(cap * 2); this.keys = new Float64Array(cap * 2); }

  topKey() { return this.keys[0]; }

  push(id: number, key: number) {
    if (this.size === this.ids.length) { const ids = new Int32Array(this.size * 2), keys = new Float64Array(this.size * 2); ids.set(this.ids); keys.set(this.keys); this.ids = ids; this.keys = keys; }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.ids[i] = this.ids[p]; this.keys[i] = this.keys[p]; i = p;
    }
    this.ids[i] = id; this.keys[i] = key;
  }

  pop() {
    const top = this.ids[0], id = this.ids[--this.size], key = this.keys[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= key) break;
      this.ids[i] = this.ids[c]; this.keys[i] = this.keys[c]; i = c;
    }
    this.ids[i] = id; this.keys[i] = key;
    return top;
  }
}
