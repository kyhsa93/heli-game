import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../events';
import { airborneAt, makeWorld, openPair, popupPair } from '../testing';
import { STEP } from '../world';
import { aseThreats, FLARE_PER_DROP } from './ase';

function scene(defId: string, dist = 2500) {
  const { world, events } = makeWorld(7);
  world.clearCombat();
  const g = openPair(world, dist, 80);
  const u = world.spawnUnit(defId, g.unit.x, g.unit.z, 0, { passive: defId === 'manpads' });
  airborneAt(world, g.player.x, g.player.z, world.terrain.surfaceAt(g.player.x, g.player.z) + 80);
  return { world, events: events as SimEvent[], u, g };
}

describe('ASE: RWR, CMWS and countermeasures (04-weapons-and-sensors.md 4.4)', () => {
  it('RWR shows a radar in search, then track, then launch', () => {
    const { world, u } = scene('sam_short');
    const t0 = aseThreats(world);
    expect(t0).toHaveLength(1);
    expect(t0[0]).toMatchObject({ symbol: 'S', state: 'search' });
    u.ai.radar = 'track';
    expect(aseThreats(world)[0].state).toBe('track');
    world.launchEnemyMissile(u, 'sam_radar');
    expect(aseThreats(world)[0].state).toBe('launch');
    const z = scene('spaag');
    expect(aseThreats(z.world)[0].symbol).toBe('Z');
  });

  it('RWR stays quiet for a radar masked by terrain', () => {
    const { world } = makeWorld(7);
    world.clearCombat();
    const g = popupPair(world);
    world.spawnUnit('spaag', g.unit.x, g.unit.z);
    airborneAt(world, g.low.x, g.low.z, g.low.y);
    expect(aseThreats(world)).toHaveLength(0);
  });

  it('CMWS warns of an approaching IR missile with its bearing', () => {
    const { world, u } = scene('manpads');
    expect(aseThreats(world)).toHaveLength(0);
    world.launchEnemyMissile(u, 'sa_ir');
    for (let i = 0; i < 30; i++) world.step(STEP);
    const t = aseThreats(world);
    expect(t).toHaveLength(1);
    expect(t[0].symbol).toBe('M');
    const want = Math.atan2(-(u.pos.x - world.player.pos.x), -(u.pos.z - world.player.pos.z)) - world.player.yaw;
    expect(Math.abs(Math.atan2(Math.sin(t[0].bearing - want), Math.cos(t[0].bearing - want)))).toBeLessThan(0.1);
  });

  it('flares decoy 55-65% of IR missiles over 1,000 seeded trials (60% beyond 1 km)', () => {
    const { world, u } = scene('manpads', 2500);
    let decoyed = 0;
    for (let i = 0; i < 1000; i++) {
      world.enemyMissiles = []; world.flares = [];
      world.cm.flares = 30;
      world.launchEnemyMissile(u, 'sa_ir');
      world.dropFlare();
      if (world.enemyMissiles[0].target) decoyed++;
    }
    expect(decoyed / 1000).toBeGreaterThan(0.55);
    expect(decoyed / 1000).toBeLessThan(0.65);
  });

  it('flares work about half as well inside 1 km', () => {
    const { world, u } = scene('manpads', 2500);
    let decoyed = 0;
    for (let i = 0; i < 1000; i++) {
      world.enemyMissiles = []; world.flares = [];
      world.cm.flares = 30;
      const m = world.launchEnemyMissile(u, 'sa_ir');
      m.pos.copy(world.player.pos).add(new Vector3(600, 0, 0));
      world.dropFlare();
      if (m.target) decoyed++;
    }
    expect(decoyed / 1000).toBeGreaterThan(0.25);
    expect(decoyed / 1000).toBeLessThan(0.35);
  });

  it('a decoyed missile misses the helicopter', () => {
    let saved = 0;
    for (let k = 0; k < 10; k++) {
      const { world, u, events } = scene('manpads', 2500);
      world.launchEnemyMissile(u, 'sa_ir');
      for (let i = 0; i < 120; i++) world.step(STEP);
      for (let j = 0; j < k; j++) world.rng();
      world.dropFlare();
      const decoyed = !!world.enemyMissiles[0]?.target;
      for (let i = 0; i < 120 * 10 && world.enemyMissiles.length; i++) world.step(STEP);
      const end = events.find(e => e.t === 'missileEnd');
      if (decoyed) { expect(end).toMatchObject({ hit: false }); saved++; }
    }
    expect(saved).toBeGreaterThan(0);
  });

  it('uses two flares per drop and stops at zero; chaff breaks radar tracks for 2 s', () => {
    const { world, u } = scene('spaag');
    for (let i = 0; i < 20; i++) world.dropFlare();
    expect(world.cm.flares).toBe(30 - 15 * FLARE_PER_DROP);
    u.ai.radar = 'track'; u.ai.detected = true;
    expect(world.dropChaff()).toBe(true);
    expect(world.cm.chaff).toBe(29);
    for (let i = 0; i < 13; i++) world.step(STEP);
    expect(u.ai.radar).toBe('search');
    expect(u.ai.jammed).toBeGreaterThan(1.5);
    world.cm.chaffUnlocked = false;
    expect(world.dropChaff()).toBe(false);
  });

  it('auto mode drops a flare when an IR missile is launched', () => {
    const { world, u, events } = scene('manpads');
    world.assists.autoCountermeasures = true;
    world.launchEnemyMissile(u, 'sa_ir');
    world.step(STEP);
    expect(world.cm.flares).toBe(28);
    expect(events.some(e => e.t === 'countermeasure' && e.auto)).toBe(true);
  });
});
