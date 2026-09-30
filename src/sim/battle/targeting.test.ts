import { describe, expect, it } from 'vitest';
import { pairKey } from '../los';
import { hiddenPair, makeWorld, ofSide, openPair, otherSide, putPlayer, SIDES } from '../testing';
import { STEP, type World } from '../world';
import { brainSystems, composeHooks } from './index';
import { MAX_CANDIDATES, roleOf, targetClass, Targeting } from './targeting';
import { UNIT_DEFS } from '../units';

function battle(seed = 7) {
  const { world, events } = makeWorld(seed);
  world.clearCombat();
  world.battleHooks = composeHooks(brainSystems());
  return { world, events };
}

function steps(world: World, seconds: number, until?: () => boolean) {
  for (let i = 0; i < seconds * 120; i++) {
    world.step(STEP);
    if (until?.()) return world.time;
  }
  return Infinity;
}

function parkPlayer(world: World) {
  putPlayer(world, -world.terrain.half + 50, -world.terrain.half + 50, 0);
}

describe('bot targeting (wiki 5.3, 5.9)', () => {
  it('classifies units for the matchup table', () => {
    expect(roleOf(UNIT_DEFS.inf_at)).toBe('at');
    expect(roleOf(UNIT_DEFS.manpads)).toBe('aa');
    expect(roleOf(UNIT_DEFS.c_sniper)).toBe('sniper');
    expect(roleOf(UNIT_DEFS.tank)).toBe('tank');
    expect(roleOf(UNIT_DEFS.c_jet)).toBe('jet');
    expect(roleOf(UNIT_DEFS.heli_attack)).toBe('heli');
    expect(targetClass(UNIT_DEFS.c_apc)).toBe('apc');
    expect(targetClass(UNIT_DEFS.inf_at)).toBe('atInf');
    expect(targetClass(UNIT_DEFS.c_heli_transport)).toBe('air');
  });

  it.each(SIDES)('5.9-1, 5.9-12: one tank destroys the other across 1.5 km of open ground within 120 s (player %s)', side => {
    for (const seed of [7, 11, 23]) {
      const { world } = battle(seed);
      world.playerSide = side;
      const g = openPair(world, 1500, 4.4);
      parkPlayer(world);
      const a = world.spawnUnit(ofSide('tank', side), g.unit.x, g.unit.z);
      const b = world.spawnUnit(ofSide('tank', otherSide(side)), g.player.x, g.player.z);
      const t = steps(world, 120, () => !a.alive || !b.alive);
      expect(t, `seed ${seed}`).toBeLessThan(120);
      expect(t, `seed ${seed}`).toBeGreaterThan(8);
    }
  }, 60000);

  it.each(SIDES)('5.9-2, 5.9-12: two tanks with a ridge between them never shoot at each other (player %s)', side => {
    const { world } = battle(5);
    world.playerSide = side;
    const g = hiddenPair(world, 1500);
    parkPlayer(world);
    const a = world.spawnUnit(ofSide('tank', side), g.unit.x, g.unit.z);
    const b = world.spawnUnit(ofSide('tank', otherSide(side)), g.player.x, g.player.z);
    steps(world, 60);
    expect(a.hp).toBe(a.def.hp);
    expect(b.hp).toBe(b.def.hp);
    expect(a.battle?.target ?? null).toBe(null);
    expect(b.battle?.target ?? null).toBe(null);
  }, 60000);

  it.each(SIDES)('5.9-7, 5.9-12: an enemy bot does not consider the player until it has spotted the player (player %s)', side => {
    const { world } = battle(7);
    world.playerSide = side;
    const g = openPair(world, 1200, 60);
    const u = world.spawnUnit(ofSide('spaag', otherSide(side)), g.unit.x, g.unit.z, 0, { passive: false });
    putPlayer(world, g.player.x, g.player.z, 60);
    const t = new Targeting();
    u.ai.detected = false;
    t.step(world);
    t.choose(world, u);
    expect(u.battle?.target ?? null).toBe(null);
    u.ai.detected = true;
    t.choose(world, u);
    expect(u.battle?.target).toEqual({ kind: 'player' });
    const friend = world.spawnUnit(ofSide('spaag', side), g.unit.x + 20, g.unit.z, 0, { passive: false });
    friend.ai.detected = true;
    t.step(world);
    t.choose(world, friend);
    expect(friend.battle?.target ?? null).toBe(null);
  });

  it('prefers the matchup it is built for, among at most four nearest candidates', () => {
    const { world } = battle(7);
    const g = openPair(world, 900, 4.4);
    parkPlayer(world);
    const at = world.spawnUnit('c_inf_at', g.unit.x, g.unit.z);
    world.spawnUnit('inf', g.player.x, g.player.z);
    const tank = world.spawnUnit('tank', g.player.x + 20, g.player.z);
    const t = new Targeting();
    t.step(world);
    t.choose(world, at);
    expect(at.battle?.target).toEqual({ kind: 'unit', id: tank.id });
    expect(MAX_CANDIDATES).toBe(4);
  });

  it('picks targets for a tenth of the units each tick and keeps the pair sight cache bounded', () => {
    const { world } = battle(7);
    const g = openPair(world, 600, 4.4);
    parkPlayer(world);
    for (let i = 0; i < 20; i++) world.spawnUnit(i % 2 ? 'inf' : 'c_inf', g.unit.x + (i % 2 ? 600 : 0) + i, g.unit.z + i);
    const t = new Targeting();
    t.step(world);
    expect(world.units.filter(u => u.battle?.target).length).toBeLessThanOrEqual(2);
    for (let i = 0; i < 9; i++) t.step(world);
    expect(world.units.every(u => u.battle)).toBe(true);
    steps(world, 30);
    expect(world.los.size).toBeLessThan(20 * 20);
    expect(pairKey(3, 4)).not.toBe(pairKey(4, 3));
  }, 60000);
});
