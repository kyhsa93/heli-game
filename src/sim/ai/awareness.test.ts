import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GEAR_Y } from '../heli/airframe';
import { LosCache, terrainClear } from '../los';
import { HALF } from '../terrain';
import { makeWorld } from '../testing';
import type { Unit } from '../units';
import type { World } from '../world';
import { AI_TICK, ALERT_LEVEL, eyeOf, stepAwareness, SUSPECT, type Conditions } from './awareness';

const DAY: Conditions = { night: false, fog: false, playerRadar: false };

function setup(seed = 7) {
  const { world, events } = makeWorld(seed);
  world.clearCombat();
  world.player.engineOn = true; world.player.landed = false;
  return { world, events, los: new LosCache(world.terrain) };
}

function putPlayer(world: World, x: number, z: number, aglM: number) {
  const h = world.player;
  h.pos.set(x, world.terrain.surfaceAt(x, z) - GEAR_Y + aglM, z);
  h.vel.set(0, 0, 0);
}

function run(world: World, los: LosCache, seconds: number, cond = DAY, until?: () => boolean) {
  const t0 = world.time;
  for (let t = 0; t < seconds; t += AI_TICK) {
    world.time += AI_TICK;
    stepAwareness(world, los, cond);
    world.events.flush();
    if (until?.()) return world.time - t0;
  }
  return Infinity;
}

function openPair(world: World, dist: number, lowAgl = 9) {
  for (let i = 0; i < 3000; i++) {
    const x = ((i * 7919) % 173) / 173 * HALF * 1.4 - HALF * 0.7, z = ((i * 104729) % 181) / 181 * HALF * 1.4 - HALF * 0.7;
    if (world.terrain.heightAt(x, z) < 1) continue;
    const ang = (i % 8) * Math.PI / 4;
    const px = x + Math.sin(ang) * dist, pz = z + Math.cos(ang) * dist;
    if (Math.abs(px) > HALF - 100 || Math.abs(pz) > HALF - 100 || world.terrain.heightAt(px, pz) < 1) continue;
    const eye = new Vector3(x, world.terrain.surfaceAt(x, z) + 4.4, z);
    const low = new Vector3(px, world.terrain.surfaceAt(px, pz) + lowAgl - GEAR_Y, pz);
    if (!terrainClear(world.terrain, eye, low)) continue;
    const trees = world.terrain.treesNear(px, pz).concat(world.terrain.treesNear(x, z));
    if (trees.length) continue;
    return { unit: new Vector3(x, 0, z), player: new Vector3(px, 0, pz) };
  }
  throw new Error('no open pair');
}

function hiddenPair(world: World) {
  for (let i = 0; i < 3000; i++) {
    const x = ((i * 7919) % 173) / 173 * HALF * 1.4 - HALF * 0.7, z = ((i * 104729) % 181) / 181 * HALF * 1.4 - HALF * 0.7;
    const ang = (i % 8) * Math.PI / 4;
    const px = x + Math.sin(ang) * 1200, pz = z + Math.cos(ang) * 1200;
    if (Math.abs(px) > HALF - 100 || Math.abs(pz) > HALF - 100) continue;
    const eye = new Vector3(x, world.terrain.surfaceAt(x, z) + 4.4, z);
    const p = new Vector3(px, world.terrain.surfaceAt(px, pz) + 20, pz);
    if (world.terrain.surfaceAt((x + px) / 2, (z + pz) / 2) > Math.max(eye.y, p.y) + 30) return { unit: new Vector3(x, 0, z), player: new Vector3(px, 0, pz) };
  }
  throw new Error('no hidden pair');
}

describe('awareness (05-enemies-and-ai.md 5.4)', () => {
  it('never detects a player hidden behind a ridge', () => {
    const { world, los } = setup();
    const g = hiddenPair(world);
    const tank = world.spawnUnit('tank', g.unit.x, g.unit.z);
    putPlayer(world, g.player.x, g.player.z, 20);
    run(world, los, 60);
    expect(tank.ai.detected).toBe(false);
    expect(tank.ai.awareness).toBeLessThanOrEqual(SUSPECT);
  });

  it('spots a low, slow hover later than a high hover at the same distance', () => {
    const { world, los } = setup();
    const g = openPair(world, 1800);
    const tank = world.spawnUnit('tank', g.unit.x, g.unit.z);
    putPlayer(world, g.player.x, g.player.z, 9);
    const low = run(world, los, 120, DAY, () => tank.ai.detected);
    const w2 = setup().world, los2 = new LosCache(w2.terrain);
    const tank2 = w2.spawnUnit('tank', g.unit.x, g.unit.z);
    putPlayer(w2, g.player.x, g.player.z, 120);
    const high = run(w2, los2, 120, DAY, () => tank2.ai.detected);
    expect(high).toBeLessThan(low);
    expect(low / high).toBeGreaterThan(2);
  });

  it('decays without a sight line, and rotor noise only raises suspicion', () => {
    const { world, los } = setup();
    const g = hiddenPair(world);
    const tank = world.spawnUnit('tank', g.unit.x, g.unit.z);
    tank.ai.awareness = 0.9;
    putPlayer(world, g.player.x, g.player.z, 20);
    run(world, los, 2);
    expect(tank.ai.awareness).toBeCloseTo(0.6, 1);
    tank.ai.awareness = 0;
    run(world, los, 10);
    expect(tank.ai.awareness).toBeCloseTo(SUSPECT, 5);
  });

  it('radios the alert to its side within 1 km', () => {
    const { world, los, events } = setup();
    const g = openPair(world, 1200);
    const spotter = world.spawnUnit('tank', g.unit.x, g.unit.z);
    const dir = new Vector3(g.unit.x - g.player.x, 0, g.unit.z - g.player.z).normalize();
    const near = world.spawnUnit('apc', g.unit.x + dir.x * 600, g.unit.z + dir.z * 600);
    const far = world.spawnUnit('apc', g.unit.x + dir.x * 1500, g.unit.z + dir.z * 1500);
    const friend = world.spawnUnit('c_tank', g.unit.x + 50, g.unit.z);
    for (const u of [near, far] as Unit[]) { u.pos.y = -500; }
    putPlayer(world, g.player.x, g.player.z, 150);
    run(world, los, 60, DAY, () => spotter.ai.detected);
    expect(spotter.ai.detected).toBe(true);
    expect(events.some(e => e.t === 'detected' && e.id === spotter.id)).toBe(true);
    expect(near.ai.awareness).toBeGreaterThan(ALERT_LEVEL - 0.02);
    expect(far.ai.awareness).toBeLessThan(ALERT_LEVEL);
    expect(friend.ai.awareness).toBe(0);
    void eyeOf;
  });

  it('radar sees through ground clutter far less often below 50 ft, then takes 2 s to track', () => {
    const worlds = Array.from({ length: 6 }, (_, k) => { const s = setup(100 + k); return { ...s, g: openPair(s.world, 2500, 12) }; });
    const trial = (aglM: number) => {
      const times: number[] = [];
      for (let rep = 0; rep < 3; rep++) for (const { world, g } of worlds) {
        world.clearCombat();
        const los = new LosCache(world.terrain);
        const sam = world.spawnUnit('spaag', g.unit.x, g.unit.z);
        putPlayer(world, g.player.x, g.player.z, aglM);
        times.push(run(world, los, 30, DAY, () => sam.ai.radar !== 'search'));
      }
      return times.reduce((a, b) => a + Math.min(b, 30), 0) / times.length;
    };
    const low = trial(12), high = trial(120);
    expect(low).toBeGreaterThan(1);
    expect(high).toBeLessThan(0.5);

    const { world, los, events } = setup();
    const g = openPair(world, 2500, 12);
    const sam = world.spawnUnit('spaag', g.unit.x, g.unit.z);
    putPlayer(world, g.player.x, g.player.z, 120);
    const found = run(world, los, 10, DAY, () => sam.ai.radar === 'acquire');
    const tracked = run(world, los, 10, DAY, () => sam.ai.radar === 'track');
    expect(found).toBeLessThan(1);
    expect(tracked).toBeCloseTo(2, 0);
    expect(events.some(e => e.t === 'radarTrack' && e.on)).toBe(true);
  }, 20000);

  it('detects instantly by radar while the player radiates with the FCR', () => {
    const { world, los } = setup();
    const g = openPair(world, 2500, 12);
    const sam = world.spawnUnit('spaag', g.unit.x, g.unit.z);
    putPlayer(world, g.player.x, g.player.z, 12);
    run(world, los, AI_TICK, { ...DAY, playerRadar: true });
    expect(sam.ai.detected).toBe(true);
  });
});
