import { describe, expect, it } from 'vitest';
import harekRaw from '../../content/battle/maps/harek.json?raw';
import { UNIT_DEFS } from '../units';
import type { World } from '../world';
import { Conquest } from './conquest';
import { conquestRules } from './modes';
import { buildRoster, rosterCounts, ROSTERS, validateRosters } from './roster';
import { activeUnits, Spawner } from './spawner';
import { badGround, UNIT_BUDGET, type BattleMapDef } from './schema';
import { battleTerrainOptions } from './terrain';
import { World as W } from '../world';

const harek = JSON.parse(harekRaw) as BattleMapDef;
const rules = conquestRules('quick');

function setup(difficulty: 'easy' | 'normal' | 'hard' = 'normal') {
  const world = new W({ seed: 9, terrain: battleTerrainOptions(harek), terrainSeed: harek.environment.seed });
  world.active = true;
  const conquest = new Conquest(harek, 'quick', rules);
  const slots = {
    coalition: buildRoster({ scale: 'quick', side: 'coalition', playerSide: 'coalition', difficulty }),
    veros: buildRoster({ scale: 'quick', side: 'veros', playerSide: 'coalition', difficulty }),
  };
  const spawner = new Spawner(harek, slots, conquest, rules.botWaveSec);
  return { world, conquest, spawner, slots };
}

function seconds(world: World, s: Spawner, n: number) {
  for (let i = 0; i < n; i++) { world.time += 1; s.step(world, 1); }
}

describe('rosters (wiki 5.1)', () => {
  it('is a valid, symmetric table', () => {
    expect(validateRosters(ROSTERS)).toEqual([]);
    for (const [cls, [c, v]] of Object.entries(ROSTERS.units)) {
      const { side: _a, size: _b, ...cd } = UNIT_DEFS[c];
      const { side: _c, size: _d, ...vd } = UNIT_DEFS[v];
      expect(cd, cls).toEqual(vd);
    }
  });

  it('gives quick conquest 10 squads and 7 ground vehicles, one rifle squad fewer on the player side', () => {
    const enemy = rosterCounts({ scale: 'quick', side: 'veros', playerSide: 'coalition', difficulty: 'normal' });
    const own = rosterCounts({ scale: 'quick', side: 'coalition', playerSide: 'coalition', difficulty: 'normal' });
    const squads = (c: typeof own) => (c.rifle ?? 0) + (c.at ?? 0) + (c.mg ?? 0) + (c.aa ?? 0) + (c.sniper ?? 0);
    const vehicles = (c: typeof own) => (c.tank ?? 0) + (c.apc ?? 0) + (c.light ?? 0) + (c.truck ?? 0) + (c.spaag ?? 0);
    expect([squads(enemy), vehicles(enemy)]).toEqual([10, 7]);
    expect([squads(own), vehicles(own)]).toEqual([9, 7]);
    expect(enemy.attackHeli).toBeUndefined();
    expect(rosterCounts({ scale: 'quick', side: 'veros', playerSide: 'coalition', difficulty: 'hard' }).rifle).toBe(6);
    expect(rosterCounts({ scale: 'quick', side: 'veros', playerSide: 'coalition', difficulty: 'easy' }).rifle).toBe(4);
    expect(buildRoster({ scale: 'quick', side: 'veros', playerSide: 'veros', difficulty: 'normal' })[0]).toMatchObject({ key: 'rifle#0', defId: 'inf' });
  });

  it('rejects unknown units and wrong sides', () => {
    const bad = structuredClone(ROSTERS);
    bad.units.tank = ['tank', 'ufo'];
    expect(validateRosters(bad)).toEqual(['units.tank[0]: tank is not coalition', 'units.tank[1]: unknown unit ufo']);
  });
});

describe('wave spawner (wiki 3.3)', () => {
  it('fields the whole roster at the start, on firm ground near the bases', () => {
    const { world, spawner, slots } = setup();
    spawner.wave(world);
    expect(world.units.length).toBe(slots.coalition.length + slots.veros.length);
    for (const u of world.units) {
      expect(badGround(world.terrain, [u.pos.x, u.pos.z]), u.defId).toBe(null);
      const base = harek.bases.find(b => b.side === u.side)!.position;
      const near = Math.hypot(u.pos.x - base[0], u.pos.z - base[1]) < 200 || Math.hypot(u.pos.x - (u.side === 'coalition' ? -1000 : 1000), u.pos.z - (u.side === 'coalition' ? 1300 : -1350)) < 80;
      expect(near, `${u.defId} at ${u.pos.x.toFixed(0)},${u.pos.z.toFixed(0)}`).toBe(true);
    }
  });

  it('brings a lost squad back with the next 30 s wave, not before', () => {
    const { world, spawner, slots } = setup();
    spawner.wave(world);
    seconds(world, spawner, 5);
    const slot = slots.veros[0];
    const lost = world.unit(slot.unit!)!;
    world.damageUnit(lost, 1000, false);
    seconds(world, spawner, 24);
    expect(slot.unit).toBe(lost.id);
    seconds(world, spawner, 1);
    expect(slot.unit).not.toBe(lost.id);
    expect(world.unit(slot.unit!)!.alive).toBe(true);
  });

  it('waits out a vehicle\'s own respawn time', () => {
    const { world, spawner, slots } = setup();
    spawner.wave(world);
    const slot = slots.coalition.find(s => s.cls === 'tank')!;
    const tank = world.unit(slot.unit!)!;
    seconds(world, spawner, 1);
    world.damageUnit(tank, 1e4, false);
    seconds(world, spawner, 89);
    expect(slot.unit).toBe(tank.id);
    seconds(world, spawner, 30);
    expect(slot.unit).not.toBe(tank.id);
  });

  it('spawns nothing for a side without tickets', () => {
    const { world, spawner, slots, conquest } = setup();
    spawner.wave(world);
    for (const s of slots.veros) world.damageUnit(world.unit(s.unit!)!, 1e4, false);
    conquest.tickets.veros = 0;
    seconds(world, spawner, 200);
    expect(world.units.filter(u => u.side === 'veros' && u.alive && u.def.move).length).toBe(0);
  });

  it('never lets the active units go over the budget', () => {
    const { world, spawner, slots } = setup();
    for (let i = 0; i < UNIT_BUDGET - 5; i++) world.spawnUnit('c_truck', 3000 + (i % 20) * 20, 3000 + Math.floor(i / 20) * 20);
    spawner.wave(world);
    expect(activeUnits(world)).toBe(UNIT_BUDGET);
    expect(slots.coalition.filter(s => s.unit !== null).length + slots.veros.filter(s => s.unit !== null).length).toBe(5);
  });
});

