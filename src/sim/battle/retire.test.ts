import { describe, expect, it } from 'vitest';
import { makeWorld } from '../testing';
import { STEP } from '../world';
import { UNIT_BUDGET } from './schema';
import { WRECK_SECONDS } from './runtime';

describe('wreck retirement (wiki 9.6)', () => {
  it('keeps the unit list within budget after 500 units are spawned and killed', () => {
    const { world } = makeWorld(2);
    world.clearCombat();
    world.retireAfter = WRECK_SECONDS;
    let peak = 0;
    for (let k = 0; k < 500; k++) {
      const u = world.spawnUnit(k % 2 ? 'inf' : 'c_truck', (k % 25) * 30 - 360, Math.floor(k / 25) * 30 - 300);
      world.damageUnit(u, 1e4, false);
      for (let i = 0; i < 30; i++) world.step(STEP * 8);
      peak = Math.max(peak, world.units.length);
    }
    expect(peak).toBeLessThanOrEqual(UNIT_BUDGET);
    expect(world.retired.length).toBeGreaterThan(400);
    expect(world.retired[0].id).toBe(1);
    const ids = world.units.map(u => u.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('keeps wrecks for 90 s and never retires the living', () => {
    const { world } = makeWorld(2);
    world.clearCombat();
    world.retireAfter = WRECK_SECONDS;
    const alive = world.spawnUnit('tank', 0, 0);
    const dead = world.spawnUnit('tank', 50, 0);
    world.damageUnit(dead, 1e4, false);
    for (let i = 0; i < 120 * (WRECK_SECONDS - 1); i++) world.step(STEP);
    expect(world.unit(dead.id)).toBe(dead);
    for (let i = 0; i < 120 * 2; i++) world.step(STEP);
    expect(world.unit(dead.id)).toBeUndefined();
    expect(world.unit(alive.id)).toBe(alive);
  });

  it('retires nothing unless asked', () => {
    const { world } = makeWorld(2);
    world.clearCombat();
    const dead = world.spawnUnit('tank', 50, 0);
    world.damageUnit(dead, 1e4, false);
    for (let i = 0; i < 120 * 100; i++) world.step(STEP * 1);
    expect(world.unit(dead.id)).toBe(dead);
  }, 60000);
});
