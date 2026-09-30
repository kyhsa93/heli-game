import type { BattleSide } from './schema';

export const MEMORY = 20;

export class Intel {
  private seen: Record<BattleSide, Map<number, number>> = { coalition: new Map(), veros: new Map() };

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
