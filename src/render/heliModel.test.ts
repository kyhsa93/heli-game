import { describe, expect, it } from 'vitest';
import { createLoadout, STANDARD_LOADOUT } from '../sim/heli/loadout';
import { applyLoadout, buildHeli } from './heliModel';

describe('Apache model stores (M2-2)', () => {
  it('shows each pylon store and hides missiles as they are fired', () => {
    const model = buildHeli();
    const lo = createLoadout({ ...STANDARD_LOADOUT, pylons: { L2: 'hydra70', L1: 'agm114k', R1: 'empty', R2: 'agm114l' }, stingers: true });
    lo.rounds.L1 = 3;
    applyLoadout(model, lo);
    expect(model.stores.L2.pod.visible).toBe(true);
    expect(model.stores.L2.hellfire.visible).toBe(false);
    expect(model.stores.L1.hellfire.visible).toBe(true);
    expect(model.stores.L1.missiles.map(m => m.visible)).toEqual([true, true, true, false]);
    expect(model.stores.R1.hellfire.visible || model.stores.R1.pod.visible).toBe(false);
    expect(model.stores.R2.missiles.every(m => m.visible)).toBe(true);
    expect(model.stingers.every(g => g.visible)).toBe(true);
    lo.rounds.L1 = 0;
    applyLoadout(model, lo);
    expect(model.stores.L1.missiles.some(m => m.visible)).toBe(false);
    expect(model.stores.L1.hellfire.visible).toBe(true);
  });
});
