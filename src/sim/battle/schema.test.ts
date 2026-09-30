import { describe, expect, it } from 'vitest';
import harekRaw from '../../content/battle/maps/harek.json?raw';
import { checkPrinciples, insidePolygon, MAP_BYTES, validateBattleMap, type BattleMapDef } from './schema';
import { battleTerrain } from './terrain';

const harek = JSON.parse(harekRaw) as BattleMapDef;
const clone = () => structuredClone(harek);
const TESTED = [1, 2, 3, 4, 6, 7, 9, 11, 13];

describe('battle map schema (wiki 9.8)', () => {
  it('accepts the Harek valley map', () => {
    expect(validateBattleMap(harek)).toEqual([]);
  });

  it('reports malformed maps with the path of each problem', () => {
    const bad = clone();
    bad.points[1].position = [9000, 0];
    bad.points[2].id = bad.points[0].id;
    bad.bases[0].farp = 'nowhere';
    bad.farps[2].point = 'Z';
    bad.fixed[0].unit = 'ufo';
    bad.fixed[1].side = 'veros';
    bad.modes.quick!.points.push('Q');
    bad.modes.quick!.start.D = 'purple' as never;
    bad.modes.conquest!.start = { A: 'coalition' };
    bad.combatZone = [[0, 0], [1, 1]];
    bad.terrain.roads[0] = [[0, 0]];
    bad.environment.times = ['noon' as never];
    const errors = validateBattleMap(bad);
    for (const expected of [
      'points[1].position: [9000, 0] outside the map',
      `points[2].id: duplicate id ${harek.points[0].id}`,
      'bases[0].farp: unknown farp nowhere',
      'farps[2].point: unknown point Z',
      'fixed[0].unit: unknown unit ufo',
      'fixed[1].side: c_aaa belongs to coalition',
      'modes.quick.points[3]: unknown point Q',
      'modes.quick.start.D: unknown owner purple',
      'modes.conquest.start: missing owner for B',
      'combatZone: polygon needs at least 3 corners',
      'terrain.roads[0]: needs at least 2 points',
      'environment.times[0]: unknown time noon',
    ]) expect(errors, expected).toContain(expected);
  });

  it('asks for exactly one base per side and at least one mode', () => {
    const bad = clone();
    bad.bases[1].side = 'coalition';
    bad.modes = {};
    expect(validateBattleMap(bad)).toEqual(expect.arrayContaining(['bases: needs exactly one coalition and one veros base', 'modes: needs at least one mode']));
  });

  it('keeps each map file within 40 KB (principle 12)', () => {
    expect(new TextEncoder().encode(harekRaw).length).toBeLessThanOrEqual(MAP_BYTES);
  });
});

describe('Harek valley follows the placement principles (wiki 6.2)', () => {
  const terrain = battleTerrain(harek);

  for (const mode of ['quick', 'conquest'] as const) {
    it(`${mode}: principles ${TESTED.join(', ')} hold`, () => {
      expect(checkPrinciples(harek, terrain, mode, TESTED)).toEqual([]);
    });
  }

  it('fails the principles when the layout breaks them', () => {
    const bad = clone();
    bad.bases[1].position = [0, -3000];
    bad.points[3].position = [-1000, 900];
    bad.waypoints = [];
    const t = battleTerrain(bad);
    const found = new Set(checkPrinciples(bad, t, 'quick', TESTED).map(f => f.principle));
    for (const p of [1, 3, 4, 6]) expect(found.has(p), `principle ${p}`).toBe(true);
    const noRoads = clone();
    noRoads.terrain.roads = noRoads.terrain.roads.slice(0, 1);
    expect(checkPrinciples(noRoads, battleTerrain(noRoads), 'quick', [7]).length).toBeGreaterThan(0);
  });

  it('builds the terrain the map describes', () => {
    expect(terrain.size).toBe(harek.terrain.size);
    expect(terrain.bridges.length).toBe(2);
    expect(terrain.heightAt(1700, 1175)).toBeLessThan(0);
    expect(terrain.onBridge(900, 1150)).not.toBe(null);
    expect(terrain.pads.map(p => p.name)).toEqual(harek.farps.map(f => f.id));
    expect(terrain.pads.filter(p => p.base).map(p => p.name)).toEqual(['c_base', 'v_base']);
    const again = battleTerrain(harek);
    expect(again.heights[123456]).toBe(terrain.heights[123456]);
  });

  it('tells inside from outside of a combat zone', () => {
    const zone = harek.modes.quick!.combatZone;
    expect(insidePolygon(zone, 0, 0)).toBe(true);
    expect(insidePolygon(zone, 2600, 0)).toBe(false);
    expect(insidePolygon(zone, 0, 4999)).toBe(true);
  });
});
