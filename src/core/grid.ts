export interface Positioned { x: number; z: number }

export class Grid<T extends Positioned> {
  private cells = new Map<number, T[]>();

  constructor(readonly cellSize: number, readonly origin = 0) {}

  private key(ci: number, cj: number) {
    return ci * 73856093 ^ cj * 19349663;
  }

  private cellOf(v: number) {
    return Math.floor((v - this.origin) / this.cellSize);
  }

  clear() {
    this.cells.clear();
  }

  insert(item: T) {
    const k = this.key(this.cellOf(item.x), this.cellOf(item.z));
    const list = this.cells.get(k);
    if (list) list.push(item); else this.cells.set(k, [item]);
  }

  rebuild(items: Iterable<T>) {
    this.clear();
    for (const it of items) this.insert(it);
  }

  query(x: number, z: number, radius: number, out: T[] = []) {
    const i0 = this.cellOf(x - radius), i1 = this.cellOf(x + radius);
    const j0 = this.cellOf(z - radius), j1 = this.cellOf(z + radius);
    const r2 = radius * radius;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const list = this.cells.get(this.key(i, j));
        if (!list) continue;
        for (const it of list) {
          const dx = it.x - x, dz = it.z - z;
          if (dx * dx + dz * dz <= r2) out.push(it);
        }
      }
    }
    return out;
  }
}
