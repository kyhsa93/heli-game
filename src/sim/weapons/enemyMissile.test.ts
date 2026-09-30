import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../events';
import { SYSTEMS } from '../heli/damage';
import { airborneAt, makeWorld, openPair, popupPair } from '../testing';
import { UNIT_DEFS } from '../units';
import { STEP, type World } from '../world';
import { WEAPONS } from './damage';

function hold(world: World, seconds: number, each?: () => void) {
  const pos = world.player.pos.clone();
  for (let i = 0; i < Math.round(seconds / STEP) && world.enemyMissiles.length; i++) {
    each?.();
    world.player.pos.copy(pos); world.player.vel.set(0, 0, 0);
    world.step(STEP);
  }
}

describe('enemy missiles (05-enemies-and-ai.md 5.5)', () => {
  it('has a missile definition for every unit missile weapon', () => {
    for (const d of Object.values(UNIT_DEFS)) for (const w of d.weapons) {
      if (w.kind === 'missileIR' || w.kind === 'missileRadar') expect(WEAPONS[w.id], w.id).toBeDefined();
    }
  });

  for (const defId of ['manpads', 'sam_short']) {
    it(`${defId} hits a hovering helicopter and damages its systems`, () => {
      const { world, events } = makeWorld(7);
      world.clearCombat();
      const g = openPair(world, defId === 'manpads' ? 2500 : 2500, 80);
      const u = world.spawnUnit(defId, g.unit.x, g.unit.z, 0, { passive: true });
      airborneAt(world, g.player.x, g.player.z, world.terrain.surfaceAt(g.player.x, g.player.z) + 80);
      world.launchEnemyMissile(u, u.def.weapons.find(w => w.kind === 'missileIR' || w.kind === 'missileRadar')!.id);
      hold(world, 25);
      const ev = events as SimEvent[];
      expect(ev.some(e => e.t === 'missileWarning')).toBe(true);
      expect(ev.find(e => e.t === 'missileEnd')).toMatchObject({ hit: true });
      expect(SYSTEMS.some(s => world.player.damage[s] < 100)).toBe(true);
    });
  }

  it('an IR missile loses the helicopter that drops behind terrain', () => {
    const { world, events } = makeWorld(7);
    world.clearCombat();
    const g = popupPair(world, 2500, 15, 200, 0.6);
    const u = world.spawnUnit('manpads', g.unit.x, g.unit.z, 0, { passive: true });
    const high = g.high;
    airborneAt(world, high.x, high.z, high.y);
    world.launchEnemyMissile(u, 'sa_ir');
    for (let i = 0; i < 12; i++) { world.player.pos.copy(high); world.player.vel.set(0, 0, 0); world.step(STEP); }
    world.player.pos.copy(g.low);
    hold(world, 20);
    const end = (events as SimEvent[]).find(e => e.t === 'missileEnd');
    expect(end).toMatchObject({ hit: false });
    expect(SYSTEMS.every(s => world.player.damage[s] === 100)).toBe(true);
  });

  it('a radar missile loses guidance the moment its launcher loses sight', () => {
    const { world } = makeWorld(7);
    world.clearCombat();
    const g = popupPair(world);
    const u = world.spawnUnit('sam_short', g.unit.x, g.unit.z, 0, { passive: true });
    const high = g.high;
    airborneAt(world, high.x, high.z, high.y);
    const m = world.launchEnemyMissile(u, 'sam_radar');
    for (let i = 0; i < 30; i++) { world.player.pos.copy(high); world.player.vel.set(0, 0, 0); world.step(STEP); }
    expect(m.guiding).toBe(true);
    world.player.pos.copy(g.low);
    world.step(STEP);
    expect(m.guiding).toBe(false);
  });

  it('is launched by an engaged MANPADS team in range', () => {
    const { world, events } = makeWorld(7);
    world.clearCombat();
    const g = openPair(world, 2000, 80);
    const u = world.spawnUnit('manpads', g.unit.x, g.unit.z);
    airborneAt(world, g.player.x, g.player.z, world.terrain.surfaceAt(g.player.x, g.player.z) + 80);
    u.ai.awareness = 1; u.ai.detected = true; u.ai.state = 'engage'; u.ai.aimTimer = 0;
    const pos = world.player.pos.clone();
    for (let i = 0; i < 120 * 3 && !world.enemyMissiles.length; i++) { world.player.pos.copy(pos); world.player.vel.set(0, 0, 0); world.step(STEP); }
    expect(world.enemyMissiles.length).toBe(1);
    expect((events as SimEvent[]).some(e => e.t === 'missileWarning' && e.kind === 'ir')).toBe(true);
  });
});
