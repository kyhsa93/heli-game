import type { BattleSide } from './schema';

export const MEMORY = 20;

export class Intel {
  private seen: Record<BattleSide, Map<number, number>> = { coalition: new Map(), veros: new Map() };
  private marks: Record<BattleSide, Map<number, number>> = { coalition: new Map(), veros: new Map() };

  mark(side: BattleSide, unitId: number, until: number) {
    this.marks[side].set(unitId, until);
    this.spot(side, unitId, until - MEMORY);
  }

  marked(side: BattleSide, time: number) {
    const out: number[] = [];
    for (const [id, until] of this.marks[side]) { if (until > time) out.push(id); else this.marks[side].delete(id); }
    return out;
  }

  spot(side: BattleSide, unitId: number, time: number) {
    this.seen[side].set(unitId, time);
  }

  knows(side: BattleSide, unitId: number, time: number) {
    const t = this.seen[side].get(unitId);
    return t !== undefined && time - t <= MEMORY;
  }

  forget(time: number) {
    for (const m of Object.values(this.seen)) for (const [id, t] of m) if (time - t > MEMORY) m.delete(id);
  }
}
