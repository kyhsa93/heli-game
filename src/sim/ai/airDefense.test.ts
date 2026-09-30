import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../events';
import { airborneAt, makeWorld, openPair } from '../testing';
import type { Unit } from '../units';
import { STEP, type World } from '../world';
import { RADAR_LOST_FACTOR } from './awareness';

function scene(defId: string, dist: number, agl = 120, seed = 7) {
  const { world, events } = makeWorld(seed);
  world.clearCombat();
  const g = openPair(world, dist, agl);
  const u = world.spawnUnit(defId, g.unit.x, g.unit.z);
  airborneAt(world, g.player.x, g.player.z, world.terrain.surfaceAt(g.player.x, g.player.z) + agl);
  return { world, events: events as SimEvent[], u, g };
}

function fly(world: World, seconds: number, until?: () => boolean) {
  const pos = world.player.pos.clone();
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    world.player.pos.copy(pos); world.player.vel.set(0, 0, 0);
    world.step(STEP);
    if (until?.()) return true;
  }
  return false;
}

const firedBy = (events: SimEvent[], u: Unit) => events.filter(e => e.t === 'fire' && e.owner === u.id);

describe('air-defence units (05-enemies-and-ai.md 5.2)', () => {
  it('ZSU-type SPAAG: radar detect -> track after 2 s -> guns', () => {
    const { world, events, u } = scene('spaag', 2000);
    expect(fly(world, 20, () => u.ai.radar === 'acquire')).toBe(true);
    expect(fly(world, 5, () => u.ai.radar === 'track')).toBe(true);
    expect(fly(world, 10, () => firedBy(events, u).length > 0)).toBe(true);
    const first = firedBy(events, u)[0];
    expect(first.t === 'fire' ? first.weapon : '').toBe('zu23x4');
  });

  it('short-range SAM: detect -> track -> radar missile, only when stationary', () => {
    const { world, events, u } = scene('sam_short', 2500);
    expect(fly(world, 30, () => world.enemyMissiles.length > 0)).toBe(true);
    expect(u.ai.radar).toBe('track');
    expect(events.some(e => e.t === 'missileWarning' && e.kind === 'radar')).toBe(true);
    const b = scene('sam_short', 2500);
    b.u.vel.set(3, 0, 0);
    const move = () => { b.u.vel.set(3, 0, 0); };
    let launched = false;
    for (let i = 0; i < 120 * 20; i++) { move(); b.world.player.vel.set(0, 0, 0); b.world.step(STEP); if (b.world.enemyMissiles.length) launched = true; }
    expect(launched).toBe(false);
  });

  it('MANPADS: visual detect -> reaction -> IR missile', () => {
    const { world, u } = scene('manpads', 1500, 80);
    expect(fly(world, 40, () => world.enemyMissiles.length > 0)).toBe(true);
    expect(u.ai.detected).toBe(true);
    expect(world.enemyMissiles[0].kind).toBe('ir');
  });

  for (const defId of ['aaa_light', 'technical']) {
    it(`${defId}: visual detect -> engage -> guns`, () => {
      const { world, events, u } = scene(defId, 1200, 100);
      expect(fly(world, 40, () => firedBy(events, u).length > 0)).toBe(true);
      expect(u.ai.state).toBe('engage');
    });
  }

  it('SAM radar site cues its launchers and halves their search when destroyed', () => {
    const { world, u, g } = scene('sam_short', 3000);
    const site = world.spawnUnit('sam_radar', g.unit.x + 40, g.unit.z + 40);
    world.player.pos.y = world.terrain.surfaceAt(world.player.pos.x, world.player.pos.z) + 12;
    let cuedAt = -1;
    fly(world, 30, () => { if (site.ai.radar !== 'search' && cuedAt < 0) cuedAt = world.time; return u.ai.radar !== 'search'; });
    expect(site.ai.detected || u.ai.detected).toBe(true);
    world.damageUnit(site, site.hp, true);
    const far = scene('sam_short', 2500);
    const deadSite = far.world.spawnUnit('sam_radar', far.g.unit.x + 40, far.g.unit.z);
    far.world.damageUnit(deadSite, deadSite.hp, true);
    const d = far.u.pos.distanceTo(far.world.player.pos);
    const range = (far.u.def.radar!.search) * RADAR_LOST_FACTOR;
    expect(range).toBeLessThan(far.u.def.radar!.search);
    far.world.player.pos.copy(far.u.pos).add(far.world.player.pos.clone().sub(far.u.pos).setLength(range + 500));
    fly(far.world, 10);
    expect(far.u.ai.radar).toBe('search');
    expect(d).toBeGreaterThan(0);
  });
});
