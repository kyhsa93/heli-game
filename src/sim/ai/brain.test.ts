import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../events';
import { hiddenPair, makeWorld, openPair, putPlayer, runAi } from '../testing';
import type { Unit } from '../units';
import type { World } from '../world';
import { ALERT_FORGET, LOS_LOST_SECONDS, reactionTime, SEARCH_SECONDS } from './brain';

const DAY = { night: false, fog: false, playerRadar: false };

function scene(defId = 'apc', seed = 7, agl = 150) {
  const { world, events } = makeWorld(seed);
  world.clearCombat();
  world.player.engineOn = true; world.player.landed = false;
  const g = openPair(world, 1200);
  const u = world.spawnUnit(defId, g.unit.x, g.unit.z);
  putPlayer(world, g.player.x, g.player.z, agl);
  return { world, events: events as SimEvent[], u, g, los: world.los };
}

function hide(world: World) {
  const h = hiddenPair(world);
  return h;
}

const fires = (events: SimEvent[], u: Unit) => events.filter(e => e.t === 'fire' && e.owner === u.id);

describe('AI state machine (05-enemies-and-ai.md 5.5)', () => {
  it('goes idle -> alert at suspicion and alert -> engage once detected in range', () => {
    const { world, u, los } = scene();
    expect(u.ai.state).toBe('idle');
    runAi(world, los, 30, DAY, () => u.ai.state === 'alert', true);
    expect(u.ai.state).toBe('alert');
    expect(u.ai.awareness).toBeGreaterThanOrEqual(0.3);
    runAi(world, los, 30, DAY, () => u.ai.state === 'engage', true);
    expect(u.ai.detected).toBe(true);
    expect(u.ai.state).toBe('engage');
  });

  it('waits its reaction time before the first shot', () => {
    const { world, u, los, events } = scene();
    runAi(world, los, 30, DAY, () => u.ai.state === 'engage', true);
    const engagedAt = world.time;
    runAi(world, los, 10, DAY, () => fires(events, u).length > 0, true);
    expect(world.time - engagedAt).toBeGreaterThanOrEqual(reactionTime(u) - 0.11);
    expect(world.time - engagedAt).toBeLessThan(reactionTime(u) + 0.5);
  });

  it('drops to search 3 s after losing the sight line and stands down after 20 s', () => {
    const { world, u, los, events } = scene();
    runAi(world, los, 40, DAY, () => fires(events, u).length > 3, true);
    const hidden = hide(world);
    u.pos.set(hidden.unit.x, world.terrain.surfaceAt(hidden.unit.x, hidden.unit.z), hidden.unit.z);
    putPlayer(world, hidden.player.x, hidden.player.z, 20);
    runAi(world, los, LOS_LOST_SECONDS + 0.2, DAY, undefined, true);
    expect(u.ai.state).toBe('search');
    runAi(world, los, SEARCH_SECONDS, DAY, undefined, true);
    expect(['idle', 'alert']).toContain(u.ai.state);
  });

  it('fires nothing once the sight line is cut for 3 s', () => {
    const { world, u, los, events } = scene();
    runAi(world, los, 40, DAY, () => fires(events, u).length > 3, true);
    const hidden = hide(world);
    u.pos.set(hidden.unit.x, world.terrain.surfaceAt(hidden.unit.x, hidden.unit.z), hidden.unit.z);
    putPlayer(world, hidden.player.x, hidden.player.z, 20);
    runAi(world, los, LOS_LOST_SECONDS, DAY, undefined, true);
    const n = fires(events, u).length;
    runAi(world, los, 10, DAY, undefined, true);
    expect(fires(events, u).length).toBe(n);
  });

  it('forgets an alert after 20 s without contact', () => {
    const { world, u, los } = scene();
    const hidden = hide(world);
    u.pos.set(hidden.unit.x, world.terrain.surfaceAt(hidden.unit.x, hidden.unit.z), hidden.unit.z);
    putPlayer(world, hidden.player.x, hidden.player.z, 20);
    u.ai.awareness = 0.35; u.ai.state = 'alert'; u.ai.stateTimer = 0;
    world.player.pos.x += 3000;
    runAi(world, los, ALERT_FORGET + 1, DAY, undefined, true);
    expect(u.ai.state).toBe('idle');
  });

  it('retreats to cover below 30% HP when it can move; fixed emplacements stay', () => {
    const { world, u, los } = scene('apc');
    u.hp = u.def.hp * 0.2;
    const start = u.pos.clone();
    runAi(world, los, 20, DAY, undefined, true);
    expect(u.ai.state).toBe('retreat');
    if (u.ai.cover) expect(u.pos.distanceTo(start)).toBeGreaterThan(20);
    const b = scene('aaa_light');
    b.u.hp = b.u.def.hp * 0.2;
    runAi(b.world, b.los, 5, DAY, undefined, true);
    expect(b.u.ai.state).not.toBe('retreat');
  });

  it('hits less when the player flies fast', () => {
    const count = (speed: number) => {
      const { world, u, los, events } = scene('spaag', 7, 150);
      u.ai.awareness = 1; u.ai.detected = true; u.ai.radar = 'track';
      world.player.vel.set(speed, 0, 0);
      world.wind.set(0, 0, 0);
      runAi(world, los, 60, DAY, undefined, true);
      return events.filter(e => e.t === 'playerHit').length / Math.max(1, fires(events, u).length);
    };
    expect(count(40)).toBeLessThan(count(0));
  });

  it('replays identically with the same seed', () => {
    const trace = () => {
      const { world, u, los, events } = scene('technical', 11);
      runAi(world, los, 40, DAY, undefined, true);
      return events.filter(e => e.t === 'playerHit' || (e.t === 'fire' && e.owner === u.id)).map(e => e.t).join(',');
    };
    const a = trace();
    expect(a.length).toBeGreaterThan(10);
    expect(trace()).toBe(a);
  });
});
