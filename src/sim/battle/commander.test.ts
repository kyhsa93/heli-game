import { describe, expect, it } from 'vitest';
import harekRaw from '../../content/battle/maps/harek.json?raw';
import { STEP, World } from '../world';
import { Commander, MIN_ORDER } from './commander';
import { Conquest } from './conquest';
import { Intel } from './intel';
import { conquestRules } from './modes';
import { buildPlatoons, Platoon, STAGED_RADIUS } from './platoon';
import type { Slot } from './roster';
import { createBattleSession } from './runtime';
import type { BattleMapDef } from './schema';
import { battleTerrainOptions } from './terrain';
import { ofSide, otherSide, SIDES } from '../testing';

const harek = JSON.parse(harekRaw) as BattleMapDef;

function world() {
  const w = new World({ seed: 4, terrain: battleTerrainOptions(harek), terrainSeed: harek.environment.seed });
  w.active = true;
  return w;
}

function slot(w: World, key: string, defId: string, x: number, z: number): Slot {
  const u = w.spawnUnit(defId, x, z);
  return { key, cls: 'rifle', defId, unit: u.id, deadAt: null };
}

describe('platoons and commanders (wiki 5.2, 5.9)', () => {
  it('builds platoons of two squads plus a vehicle, and keeps the last one in reserve', () => {
    const { runtime } = createBattleSession(harek, 'quick', { side: 'coalition', seed: 1 });
    const { session } = { session: null };
    void session;
    const w = world();
    runtime.start(w);
    const [coalition, veros] = runtime.commanders;
    expect(veros.platoons.length).toBe(7);
    expect(veros.platoons[0].slots.map(s => s.cls)).toEqual(['rifle', 'rifle', 'tank']);
    expect(coalition.platoons.flatMap(p => p.slots).length).toBe(runtime.spawner.slots.coalition.length);
    expect(veros.reserve()).toBe(veros.platoons[6]);
  });

  it('waits at the staging point before moving into the point', () => {
    const w = world();
    const base = harek.bases[0].position;
    const slots = [slot(w, 'a', 'c_inf', base[0], base[1] - 60), slot(w, 'b', 'c_inf', base[0] + 20, base[1] - 60)];
    const pl = new Platoon('coalition:0', 'coalition', slots, base);
    const c = new Conquest(harek, 'quick', conquestRules('quick'));
    const d = c.points.find(p => p.id === 'D')!;
    pl.give({ kind: 'attack', point: 'D', utility: 1 }, 0);
    let staged = -1, inside = -1;
    for (let s = 1; s <= 1500 && inside < 0; s++) {
      pl.step(w, c.points, s);
      for (let i = 0; i < 120; i++) w.step(STEP);
      const m = pl.members(w);
      const inD = m.filter(u => Math.hypot(u.pos.x - d.x, u.pos.z - d.z) <= d.radius).length;
      if (staged < 0 && pl.state === 'assault') {
        staged = s;
        expect(inD).toBe(0);
        const dist = m.map(u => Math.hypot(u.pos.x - d.x, u.pos.z - d.z));
        expect(Math.min(...dist)).toBeGreaterThan(350 - STAGED_RADIUS - 30);
      }
      if (inD === m.length) inside = s;
    }
    expect(staged).toBeGreaterThan(0);
    expect(inside).toBeGreaterThan(staged);
  }, 120000);

  it.each(SIDES)('5.9-5, 5.9-12: sends the nearest reserve to a friendly point under attack within 10 s (%s)', side => {
    const w = world();
    w.playerSide = side;
    const home = side === 'coalition' ? 0 : 1;
    const base = harek.bases[home].position;
    const toward = Math.sign(-base[1]) || 1;
    const intel = new Intel();
    const slots = (k: string, dx: number) => [slot(w, `${k}a`, ofSide('inf', side), base[0] + dx, base[1] + toward * 100)];
    const platoons = [new Platoon(`${side}:0`, side, slots('p', 0), base), new Platoon(`${side}:1`, side, slots('r', 40), base)];
    const cmd = new Commander(side, platoons, intel);
    const c = new Conquest(harek, 'quick', conquestRules('quick'));
    for (let t = 0; t <= 20; t++) { c.step(w, 1); cmd.step(w, c.points, t); }
    expect(cmd.reserve()!.order?.kind).toBe('reserve');
    const own = c.points.find(p => p.owner === side && p.id === (side === 'coalition' ? 'A' : 'G'))!;
    w.spawnUnit(ofSide('inf', otherSide(side)), own.x, own.z);
    let at = -1;
    for (let t = 21; t <= 40 && at < 0; t++) { c.step(w, 1); cmd.step(w, c.points, t); if (cmd.reserve()!.order?.kind === 'defend') at = t; }
    expect(at).toBeGreaterThan(0);
    expect(at - 21).toBeLessThanOrEqual(10);
    expect(cmd.reserve()!.order?.point).toBe(own.id);
  });

  it('lets vehicles take an undefended point themselves when the platoon infantry is far behind', () => {
    const w = world();
    const base = harek.bases[0].position;
    const c = new Conquest(harek, 'quick', conquestRules('quick'));
    const d = c.points.find(p => p.id === 'D')!;
    const slots = [slot(w, 'v', 'c_apc', d.x + 400, d.z + 400), slot(w, 'i', 'c_inf', base[0], base[1] - 60)];
    const pl = new Platoon('coalition:0', 'coalition', slots, base);
    pl.give({ kind: 'attack', point: 'D', utility: 1 }, 0);
    const apc = w.units.find(u => u.defId === 'c_apc')!;
    for (let s = 1; s <= 300; s++) {
      pl.step(w, c.points, s);
      c.step(w, 1);
      for (let i = 0; i < 120; i++) w.step(STEP);
    }
    expect(pl.state).not.toBe('move');
    expect(Math.hypot(apc.pos.x - d.x, apc.pos.z - d.z)).toBeLessThanOrEqual(d.radius);
  }, 120000);

  it('knows only enemies its side has seen in the last 20 s', () => {
    const w = world();
    const intel = new Intel();
    const cmd = new Commander('coalition', buildPlatoons('coalition', [], harek.bases[0].position), intel);
    const c = new Conquest(harek, 'quick', conquestRules('quick'));
    const d = c.points.find(p => p.id === 'D')!;
    const e = w.spawnUnit('inf', d.x + 50, d.z);
    expect(cmd.knownEnemy(w, d, 0)).toBe(0);
    intel.spot('coalition', e.id, 0);
    expect(cmd.knownEnemy(w, d, 10)).toBe(1);
    expect(cmd.knownEnemy(w, d, 21)).toBe(0);
  });

  it('5.9-4: never changes a platoon\'s order within 60 s over a ten-minute battle', () => {
    for (const side of ['coalition', 'veros'] as const) {
      const { session, runtime } = createBattleSession(harek, 'quick', { side, seed: 17 });
      session.start();
      session.frozen = false;
      const history = new Map<string, { since: number; point: string | null }[]>();
      for (let s = 0; s < 600; s++) {
        for (let i = 0; i < 120; i++) session.step(STEP);
        for (const cmd of runtime.commanders) for (const pl of cmd.platoons) {
          if (pl === cmd.reserve() || !pl.order) continue;
          const h = history.get(pl.id) ?? [];
          if (!h.length || h[h.length - 1].since !== pl.order.since) h.push({ since: pl.order.since, point: pl.order.point });
          history.set(pl.id, h);
        }
      }
      let changes = 0;
      for (const [id, h] of history) for (let k = 1; k < h.length; k++) {
        changes++;
        expect(h[k].since - h[k - 1].since, `${side} ${id}`).toBeGreaterThanOrEqual(MIN_ORDER);
      }
      expect(history.size).toBeGreaterThan(3);
      expect(changes, side).toBeGreaterThan(0);
    }
  }, 300000);
});
