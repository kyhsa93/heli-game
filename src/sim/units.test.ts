import { describe, expect, it } from 'vitest';
import { hasString } from '../content/strings';
import type { SimEvent } from './events';
import { hitsAir, squadMembers, UNIT_DEFS, validateUnitDefs } from './units';
import { WEAPONS } from './weapons/damage';
import { World } from './world';

const DOC_UNITS = [
  'inf', 'inf_mg', 'manpads', 'truck', 'fuel_truck', 'technical', 'apc', 'tank', 'spaag', 'sam_short', 'sam_radar', 'aaa_light',
  'heli_attack', 'bunker', 'ammo_depot', 'hq', 'searchlight',
  'c_inf', 'c_apc', 'c_tank', 'c_truck', 'c_heli_rescue', 'c_apache', 'farp', 'civ_car', 'civ_bus', 'civ_house',
  'inf_at', 'sniper', 'heli_transport', 'jet', 'v_farp',
  'c_inf_at', 'c_inf_mg', 'c_manpads', 'c_sniper', 'c_technical', 'c_spaag', 'c_heli_transport', 'c_jet', 'c_aaa', 'c_sam_short',
];

const PAIRS: [string, string][] = [
  ['c_inf', 'inf'], ['c_inf_at', 'inf_at'], ['c_inf_mg', 'inf_mg'], ['c_manpads', 'manpads'], ['c_sniper', 'sniper'],
  ['c_tank', 'tank'], ['c_apc', 'apc'], ['c_technical', 'technical'], ['c_truck', 'truck'], ['c_spaag', 'spaag'],
  ['c_apache', 'heli_attack'], ['c_heli_transport', 'heli_transport'], ['c_jet', 'jet'],
  ['c_aaa', 'aaa_light'], ['c_sam_short', 'sam_short'], ['farp', 'v_farp'],
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

  it('gives both sides identical numbers for the same class (wiki 4.1)', () => {
    for (const [c, v] of PAIRS) {
      const { side: cs, size: _c, ...coalition } = UNIT_DEFS[c];
      const { side: vs, size: _v, ...veros } = UNIT_DEFS[v];
      expect([cs, vs], `${c}/${v}`).toEqual(['coalition', 'veros']);
      expect(coalition, `${c} vs ${v}`).toEqual(veros);
    }
  });

  it('matches the battle unit table (wiki 4.2)', () => {
    for (const id of ['inf', 'inf_at', 'inf_mg']) expect(UNIT_DEFS[id]).toMatchObject({ squad: 5, hp: 40, armor: 0 });
    expect(UNIT_DEFS.manpads).toMatchObject({ squad: 3, hp: 24 });
    expect(UNIT_DEFS.sniper).toMatchObject({ squad: 2, hp: 16 });
    expect(UNIT_DEFS.heli_attack.hp).toBe(300);
    expect(UNIT_DEFS.heli_transport).toMatchObject({ hp: 150, armor: 1, carry: 2 });
    expect(UNIT_DEFS.apc.carry).toBe(1);
    expect(UNIT_DEFS.truck.carry).toBe(1);
    expect(UNIT_DEFS.sam_short.weapons[0].range).toBe(3000);
    const main = UNIT_DEFS.tank.weapons.find(w => w.id === 'g_main');
    expect(main).toMatchObject({ vs: 'ground', range: 2500, damage: 180, penetration: 5, accuracy: 0.45 });
    expect(main!.rate).toBeCloseTo(1 / 7);
    expect(UNIT_DEFS.inf_at.weapons[0]).toMatchObject({ vs: 'ground', range: 1500, damage: 250, penetration: 5 });
  });

  it('keeps every unit that fought the player helicopter armed against it', () => {
    for (const [id, d] of Object.entries(UNIT_DEFS)) {
      if (id.startsWith('c_') || d.side === 'civilian') continue;
      if (d.weapons.length && !['inf_at', 'sniper'].includes(id)) expect(d.weapons.some(hitsAir), id).toBe(true);
    }
    expect(UNIT_DEFS.inf_at.weapons.some(hitsAir)).toBe(false);
  });

  it('gives every unit missile the penetration of its real missile', () => {
    for (const [id, d] of Object.entries(UNIT_DEFS)) for (const w of d.weapons) {
      if (w.kind === 'missileIR' || w.kind === 'missileRadar') expect(w.penetration, `${id} ${w.id}`).toBe(WEAPONS[w.id].penetration);
    }
  });

  it('rejects an unknown target class or penetration', () => {
    const w = UNIT_DEFS.tank.weapons[0];
    const bad = {
      a: { ...UNIT_DEFS.tank, weapons: [{ ...w, vs: 'sea' as never }] },
      b: { ...UNIT_DEFS.tank, weapons: [{ ...w, penetration: 6 }] },
      c: { ...UNIT_DEFS.tank, weapons: [{ ...w, vs: undefined as never }] },
      d: { ...UNIT_DEFS.tank, carry: 0 },
    };
    const errors = validateUnitDefs(bad);
    expect(errors).toEqual([expect.stringMatching(/^a: g_main vs sea/), expect.stringMatching(/^b: g_main penetration 6/), expect.stringMatching(/^c: g_main vs undefined/), expect.stringMatching(/^d: carry 0/)]);
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
    expect(squadMembers(s)).toBe(5);
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
