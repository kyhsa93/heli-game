import { describe, expect, it } from 'vitest';
import { makeWorld, openPair, putPlayer } from '../testing';
import { squadMembers } from '../units';
import { STEP, type World } from '../world';
import { FIRE_EVENT_RADIUS, hitDamage, manpower } from './combat';
import { brainSystems, composeHooks } from './index';
import type { SimEvent } from '../events';
import { eyeOf } from '../ai/awareness';
import { visualSight } from '../los';

const SEEDS = Array.from({ length: 20 }, (_, i) => 101 + i * 7);

function duel(first: number, shooter: string, target: string, dist: number, air = false): number {
  for (let seed = first; ; seed += 1000) {
    const t = tryDuel(seed, shooter, target, dist, air);
    if (t !== null) return t;
  }
}

function tryDuel(seed: number, shooter: string, target: string, dist: number, air: boolean) {
  const { world } = makeWorld(seed);
  world.clearCombat();
  world.battleHooks = composeHooks(brainSystems());
  const g = openPair(world, dist, air ? 60 : 4.4);
  putPlayer(world, -world.terrain.half + 50, -world.terrain.half + 50, 0);
  const a = world.spawnUnit(shooter, g.unit.x, g.unit.z);
  const b = world.spawnUnit(target, g.player.x, g.player.z, 0, { passive: true });
  if (air) b.pos.y = world.terrain.surfaceAt(b.pos.x, b.pos.z) + 60;
  if (!visualSight(world.terrain, eyeOf(a), eyeOf(b)).clear) return null;
  for (let t = 0; t < 900; t += STEP) {
    if (air) b.pos.y = world.terrain.surfaceAt(b.pos.x, b.pos.z) + 60;
    world.step(STEP);
    if (!b.alive) return world.time;
  }
  return Infinity;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('bot versus bot fire (wiki 4.3)', () => {
  const cases: [string, string, string, number, number, boolean?][] = [
    ['tank vs tank, 1.5 km', 'c_tank', 'tank', 1500, 48],
    ['AT squad vs tank, 1 km', 'inf_at', 'c_tank', 1000, 48],
    ['APC 30 mm vs rifle squad, 1 km', 'c_apc', 'inf', 1000, 9],
    ['rifle squad vs rifle squad, 300 m', 'inf', 'c_inf', 300, 180],
    ['MANPADS vs attack helicopter, 3 km', 'manpads', 'c_apache', 3000, 80, true],
    ['SPAAG vs attack helicopter, 2 km', 'c_spaag', 'heli_attack', 2000, 180, true],
  ];
  for (const [name, a, b, dist, expected, air] of cases) {
    it(`${name}: 20-seed mean within ±40% of ${expected} s`, () => {
      const times = SEEDS.map(s => duel(s, a, b, dist, air));
      expect(times.every(Number.isFinite), `${name} ${times}`).toBe(true);
      const m = mean(times);
      expect(m, `${name} mean ${m.toFixed(1)}`).toBeGreaterThan(expected * 0.6);
      expect(m, `${name} mean ${m.toFixed(1)}`).toBeLessThan(expected * 1.4);
    }, 120000);
  }

  it('scales a squad\'s fire with the members still standing', () => {
    const { world } = makeWorld(3);
    const s = world.spawnUnit('inf', 0, 0);
    expect(manpower(s)).toBe(1);
    world.damageUnit(s, 24, false);
    expect(squadMembers(s)).toBe(2);
    expect(manpower(s)).toBeCloseTo(2 / 5);
  });

  it('lets one explosive hit take at most two members of a squad', () => {
    const { world } = makeWorld(3);
    const tank = world.spawnUnit('tank', 0, 0);
    const squad = world.spawnUnit('c_inf', 50, 0);
    const main = tank.def.weapons.find(w => w.id === 'g_main')!;
    const coax = tank.def.weapons.find(w => w.id === 'g_coax')!;
    expect(hitDamage(main, squad)).toBe(16);
    expect(hitDamage(coax, squad)).toBeCloseTo(2.4);
    expect(hitDamage(main, world.spawnUnit('c_tank', 90, 0))).toBeCloseTo(216);
  });

  it('only reports bot shots near the player', () => {
    const run = (near: boolean) => {
      const { world, events } = makeWorld(9);
      world.clearCombat();
      world.battleHooks = composeHooks(brainSystems());
      const g = openPair(world, 800, 4.4);
      const a = world.spawnUnit('c_tank', g.unit.x, g.unit.z);
      world.spawnUnit('tank', g.player.x, g.player.z, 0, { passive: true });
      const far = FIRE_EVENT_RADIUS + 500;
      putPlayer(world, g.unit.x + (near ? 100 : far), g.unit.z, 0);
      if (!near && Math.abs(world.player.pos.x) > world.terrain.half) putPlayer(world, g.unit.x - far, g.unit.z, 0);
      for (let i = 0; i < 20 * 120; i++) world.step(STEP);
      return (events as SimEvent[]).filter(e => e.t === 'fire' && e.owner === a.id).length;
    };
    expect(run(true)).toBeGreaterThan(0);
    expect(run(false)).toBe(0);
  }, 60000);
});

export type { World };
