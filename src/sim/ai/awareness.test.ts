import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { LosCache } from '../los';
import { hiddenPair, makeWorld, openPair, putPlayer, runAi } from '../testing';
import type { Unit } from '../units';
import { AI_TICK, ALERT_LEVEL, eyeOf, SUSPECT, visualRange, visualRate, type Conditions } from './awareness';

const DAY: Conditions = { night: false, fog: false, playerRadar: false };

function setup(seed = 7) {
  const { world, events } = makeWorld(seed);
  world.clearCombat();
  world.player.engineOn = true; world.player.landed = false;
  return { world, events, los: new LosCache(world.terrain) };
}

describe('awareness (05-enemies-and-ai.md 5.4)', () => {
  it('never detects a player hidden behind a ridge', () => {
    const { world, los } = setup();
    const g = hiddenPair(world);
    const tank = world.spawnUnit('tank', g.unit.x, g.unit.z);
    putPlayer(world, g.player.x, g.player.z, 20);
    runAi(world, los, 60);
    expect(tank.ai.detected).toBe(false);
    expect(tank.ai.awareness).toBeLessThanOrEqual(SUSPECT);
  });

  it('spots a low, slow hover later than a high hover at the same distance', () => {
    const { world, los } = setup();
    const g = openPair(world, 1800);
    const tank = world.spawnUnit('tank', g.unit.x, g.unit.z);
    putPlayer(world, g.player.x, g.player.z, 9);
    const low = runAi(world, los, 120, DAY, () => tank.ai.detected);
    const w2 = setup().world, los2 = new LosCache(w2.terrain);
    const tank2 = w2.spawnUnit('tank', g.unit.x, g.unit.z);
    putPlayer(w2, g.player.x, g.player.z, 120);
    const high = runAi(w2, los2, 120, DAY, () => tank2.ai.detected);
    expect(high).toBeLessThan(low);
    expect(low / high).toBeGreaterThan(2);
  });

  it('decays without a sight line, and rotor noise only raises suspicion', () => {
    const { world, los } = setup();
    const g = hiddenPair(world);
    const tank = world.spawnUnit('tank', g.unit.x, g.unit.z);
    tank.ai.awareness = 0.9;
    putPlayer(world, g.player.x, g.player.z, 20);
    runAi(world, los, 2);
    expect(tank.ai.awareness).toBeCloseTo(0.6, 1);
    tank.ai.awareness = 0;
    runAi(world, los, 10);
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
    runAi(world, los, 60, DAY, () => spotter.ai.detected);
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
        times.push(runAi(world, los, 30, DAY, () => sam.ai.radar !== 'search'));
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
    const found = runAi(world, los, 10, DAY, () => sam.ai.radar === 'acquire');
    const tracked = runAi(world, los, 10, DAY, () => sam.ai.radar === 'track');
    expect(found).toBeLessThan(1);
    expect(tracked).toBeCloseTo(2, 0);
    expect(events.some(e => e.t === 'radarTrack' && e.on)).toBe(true);
  }, 20000);

  it('detects instantly by radar while the player radiates with the FCR', () => {
    const { world, los } = setup();
    const g = openPair(world, 2500, 12);
    const sam = world.spawnUnit('spaag', g.unit.x, g.unit.z);
    putPlayer(world, g.player.x, g.player.z, 12);
    runAi(world, los, AI_TICK, { ...DAY, playerRadar: true });
    expect(sam.ai.detected).toBe(true);
  });
});

describe('time of day (06 6.1)', () => {
  it('sets the visual detection range by the hour', () => {
    expect(visualRange({ ...DAY, time: 'day' })).toBe(4000);
    expect(visualRange({ ...DAY, time: 'dusk' })).toBe(3000);
    expect(visualRange({ ...DAY, time: 'dawn' })).toBe(3000);
    expect(visualRange({ ...DAY, time: 'night', night: true })).toBe(1500);
    expect(visualRange({ ...DAY, night: true })).toBe(1500);
  });

  it('lets a lookout see the player at 3.5 km by day but not at dusk, and at 2 km only before night', () => {
    const { world } = setup();
    for (const [dist, time, sees] of [[3500, 'day', true], [3500, 'dusk', false], [2000, 'dawn', true], [2000, 'night', false], [1200, 'night', true]] as const) {
      const g = openPair(world, dist, 30);
      putPlayer(world, g.player.x, g.player.z, 30);
      const u = world.spawnUnit('inf', g.unit.x, g.unit.z);
      expect(visualRate(world, eyeOf(u), 0, { ...DAY, time, night: time === 'night' }) > 0, `${dist} ${time}`).toBe(sees);
      world.clearCombat();
    }
  });
});

describe('fog (06 6.1)', () => {
  it('halves the visual detection range', () => {
    expect(visualRange({ ...DAY, fog: true, time: 'day' })).toBe(2000);
    expect(visualRange({ ...DAY, fog: true, time: 'dawn' })).toBe(1500);
    const { world } = setup();
    const g = openPair(world, 2500, 30);
    putPlayer(world, g.player.x, g.player.z, 30);
    const u = world.spawnUnit('inf', g.unit.x, g.unit.z);
    expect(visualRate(world, eyeOf(u), 0, DAY)).toBeGreaterThan(0);
    expect(visualRate(world, eyeOf(u), 0, { ...DAY, fog: true })).toBe(0);
  });
});
