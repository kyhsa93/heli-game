export const PINCH_STEP = 1.3;

export class Pinch {
  private points = new Map<number, { x: number; y: number }>();
  private base = 0;

  get active() { return this.points.size >= 2; }

  down(id: number, x: number, y: number) {
    this.points.set(id, { x, y });
    if (this.points.size === 2) this.base = this.spread();
    return this.active;
  }

  move(id: number, x: number, y: number): 1 | -1 | 0 {
    const p = this.points.get(id);
    if (!p) return 0;
    p.x = x; p.y = y;
    if (!this.active || this.base <= 0) return 0;
    const ratio = this.spread() / this.base;
    if (ratio >= PINCH_STEP) { this.base = this.spread(); return 1; }
    if (ratio <= 1 / PINCH_STEP) { this.base = this.spread(); return -1; }
    return 0;
  }

  up(id: number) {
    this.points.delete(id);
    if (this.points.size < 2) this.base = 0;
  }

  private spread() {
    const [a, b] = [...this.points.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
