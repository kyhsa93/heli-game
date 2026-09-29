import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { airborneAt, makeWorld, run, skyPair } from '../testing';
import type { World } from '../world';
import { ORBIT_RADIUS } from './air';

function pinned(world: World, at: Vector3) {
  airborneAt(world, at.x, at.z, at.y);
  return () => { world.player.pos.copy(at); world.player.vel.set(0, 0, 0); };
}

describe('enemy attack helicopter (05 5.2)', () => {
  it('spots the player, closes to a firing orbit and shoots gun and rockets', () => {
    const { world, events } = makeWorld();
    const p = skyPair(world, 2800);
    const hold = pinned(world, p.player);
    const heli = world.spawnUnit('heli_attack', p.heli.x, p.heli.z);
    const dists: number[] = [];
    run(world, 60, () => { hold(); dists.push(Math.hypot(heli.pos.x - p.player.x, heli.pos.z - p.player.z)); });
    expect(heli.ai.detected).toBe(true);
    const fired = new Set(events.filter(e => e.t === 'fire' && e.owner === heli.id).map(e => e.t === 'fire' && e.weapon));
    expect(fired.has('heli_gun')).toBe(true);
    expect(events.some(e => e.t === 'playerHit' && e.by === heli.id)).toBe(true);
    const late = dists.slice(-120 * 10);
    expect(Math.min(...late)).toBeGreaterThan(ORBIT_RADIUS * 0.6);
    expect(Math.max(...late)).toBeLessThan(ORBIT_RADIUS * 1.4);
    expect(heli.pos.y - world.terrain.surfaceAt(heli.pos.x, heli.pos.z)).toBeGreaterThan(10);
  });

  it('carries air-to-air missiles only when the mission arms it', () => {
    for (const aam of [false, true]) {
      const { world, events } = makeWorld();
      const p = skyPair(world, 2000);
      const hold = pinned(world, p.player);
      const heli = world.spawnUnit('heli_attack', p.heli.x, p.heli.z, 0, { aam });
      world.player.damage.cockpit = 1e9;
      run(world, 45, hold);
      expect(events.some(e => e.t === 'missileWarning' && e.owner === heli.id), `aam ${aam}`).toBe(aam);
    }
  });

  it('falls out of the sky when destroyed', () => {
    const { world, events } = makeWorld();
    const heli = world.spawnUnit('heli_attack', 500, 500, 0, { passive: true });
    heli.vel.set(30, 0, 0);
    const y0 = heli.pos.y;
    world.damageUnit(heli, 1e9, true);
    run(world, 0.5);
    expect(heli.pos.y).toBeLessThan(y0);
    run(world, 10);
    expect(heli.pos.y).toBeCloseTo(world.terrain.surfaceAt(heli.pos.x, heli.pos.z), 3);
    expect(events.some(e => e.t === 'explosion' && e.size === 8)).toBe(true);
  });
});
