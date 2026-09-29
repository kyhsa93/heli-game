import { describe, expect, it } from 'vitest';
import { hasString } from '../content/strings';
import type { SimEvent } from './events';
import { squadMembers, UNIT_DEFS, validateUnitDefs } from './units';
import { World } from './world';

const DOC_UNITS = [
  'inf', 'inf_mg', 'manpads', 'truck', 'fuel_truck', 'technical', 'apc', 'tank', 'spaag', 'sam_short', 'sam_radar', 'aaa_light',
  'heli_attack', 'bunker', 'ammo_depot', 'hq',
  'c_inf', 'c_apc', 'c_tank', 'c_truck', 'c_heli_rescue', 'farp', 'civ_car', 'civ_bus', 'civ_house',
];

describe('units.json (05-enemies-and-ai.md 5.2, 5.3)', () => {
  it('is valid', () => {
    expect(validateUnitDefs(UNIT_DEFS)).toEqual([]);
  });

  it('defines every unit in the design tables, each with a display name', () => {
    for (const id of DOC_UNITS) {
      expect(UNIT_DEFS[id], id).toBeDefined();
      expect(hasString(`units.${id}`), id).toBe(true);
    }
    expect(Object.keys(UNIT_DEFS).sort()).toEqual([...DOC_UNITS].sort());
  });

  it('matches key numbers from the design tables', () => {
    expect(UNIT_DEFS.tank).toMatchObject({ hp: 300, armor: 4, score: 150, side: 'veros' });
    expect(UNIT_DEFS.bunker.armor).toBe(5);
    expect(UNIT_DEFS.spaag.radar).toEqual({ search: 8000, track: 4000 });
    expect(UNIT_DEFS.manpads.detect).toBe('visual');
    expect(UNIT_DEFS.civ_car.side).toBe('civilian');
  });

  it('catches malformed definitions', () => {
    const bad = { x: { ...UNIT_DEFS.tank, armor: 7, detect: 'radar' as const, radar: undefined } };
    expect(validateUnitDefs(bad).length).toBe(2);
  });
});

describe('world units', () => {
  function world() {
    const w = new World({ seed: 7 });
    const events: SimEvent[] = [];
    w.events.onAny(e => events.push(e));
    return { w, events };
  }

  it('spawns on the terrain with full health and unique ids', () => {
    const { w } = world();
    const p = w.pads[1];
    const a = w.spawnUnit('tank', p.x + 30, p.z, 1), b = w.spawnUnit('inf', p.x - 30, p.z);
    expect(a.id).not.toBe(b.id);
    expect(a.pos.y).toBeCloseTo(w.terrain.surfaceAt(p.x + 30, p.z));
    expect(a).toMatchObject({ hp: 300, alive: true, side: 'veros', defId: 'tank' });
    expect(() => w.spawnUnit('nope', 0, 0)).toThrow();
  });

  it('destroys a unit at zero health and emits unitDestroyed exactly once', () => {
    const { w, events } = world();
    const t = w.spawnUnit('truck', 0, 0);
    w.damageUnit(t, 40, true);
    expect(t.alive).toBe(true);
    w.damageUnit(t, 40, true);
    w.damageUnit(t, 40, true);
    w.step(1 / 120);
    expect(t.alive).toBe(false);
    expect(t.hp).toBe(0);
    expect(events.filter(e => e.t === 'unitDestroyed')).toEqual([{ t: 'unitDestroyed', id: t.id, defId: 'truck', side: 'veros', byPlayer: true }]);
    expect(w.units).toContain(t);
  });

  it('never damages indestructible units', () => {
    const { w } = world();
    const f = w.spawnUnit('farp', 0, 0);
    w.damageUnit(f, 1e6, true);
    expect(f.alive).toBe(true);
  });

  it('shrinks an infantry squad as it takes damage', () => {
    const { w } = world();
    const s = w.spawnUnit('inf', 0, 0);
    expect(squadMembers(s)).toBe(6);
    w.damageUnit(s, 20, false);
    expect(squadMembers(s)).toBe(3);
    w.damageUnit(s, 20, false);
    expect(squadMembers(s)).toBe(0);
  });

  it('puts air units above the terrain', () => {
    const { w } = world();
    const h = w.spawnUnit('heli_attack', 0, 0);
    expect(h.pos.y).toBeGreaterThan(w.terrain.surfaceAt(0, 0) + 30);
  });
});
