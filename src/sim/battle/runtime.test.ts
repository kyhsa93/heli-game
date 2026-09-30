import { describe, expect, it } from 'vitest';
import harekRaw from '../../content/battle/maps/harek.json?raw';
import type { SimEvent } from '../events';
import { STANDARD_LOADOUT } from '../heli/loadout';
import { STEP } from '../world';
import { conquestRules } from './modes';
import { createBattleSession } from './runtime';
import type { BattleMapDef } from './schema';

const harek = JSON.parse(harekRaw) as BattleMapDef;
const { boundaryGraceSec: BOUNDARY_GRACE, playerRespawnSec: PLAYER_RESPAWN } = conquestRules('quick');

function battle(side: 'coalition' | 'veros' = 'coalition') {
  const { session, runtime } = createBattleSession(harek, 'quick', { side, seed: 42 });
  const events: SimEvent[] = [];
  session.world.events.onAny(e => events.push(e));
  session.start();
  return { session, runtime, world: session.world, events };
}

const run = (s: { step(dt: number): void }, seconds: number) => { for (let i = 0; i < Math.round(seconds * 120); i++) s.step(STEP); };

describe('battle runtime (B1-7)', () => {
  it('builds the map terrain and places the base air defences of the mode', () => {
    const { world } = battle();
    expect(world.terrain.size).toBe(harek.terrain.size);
    expect(world.terrain.bridges.length).toBe(2);
    expect(world.units.filter(u => !u.def.move).map(u => u.defId).sort()).toEqual(['aaa_light', 'aaa_light', 'c_aaa', 'c_aaa']);
    expect(world.battleHooks).not.toBe(null);
  });

  it('opens on the deploy screen with the battle clock stopped', () => {
    const { session, world } = battle();
    expect(session.mode).toBe('deploy');
    expect(world.avatar.kind).toBe('dead');
    expect(world.playerBody().alive).toBe(false);
    run(session, 3);
    expect(world.time).toBe(0);
    expect(session.deployIn()).toBe(0);
  });

  it('deploys, dies, keeps the battle running on the deploy screen and deploys again after the wait', () => {
    const { session, runtime, world } = battle();
    const [pad] = runtime.spawnPoints(world);
    expect(session.deploy(runtime.spawnFor(pad, STANDARD_LOADOUT))).toBe(true);
    expect(session.mode).toBe('play');
    expect(world.avatar.kind).toBe('heli');
    const h = world.player;
    expect(Math.hypot(h.pos.x - harek.bases[0].position[0], h.pos.z - harek.bases[0].position[1])).toBeLessThan(15);
    expect(h.engineOn).toBe(true);
    run(session, 1);
    world.killPlayer('crewKilled');
    run(session, 0.1);
    expect(session.mode).toBe('crashed');
    run(session, 2.5);
    expect(session.mode).toBe('deploy');
    expect(world.avatar.kind).toBe('dead');
    const t0 = world.time;
    run(session, 2);
    expect(world.time).toBeCloseTo(t0 + 2, 5);
    expect(session.deployIn()).toBeGreaterThan(0);
    expect(session.deploy(runtime.spawnFor(pad, STANDARD_LOADOUT))).toBe(false);
    run(session, PLAYER_RESPAWN);
    expect(session.deployIn()).toBe(0);
    const air = runtime.spawnPoints(world).find(p => p.kind === 'air')!;
    expect(session.deploy(runtime.spawnFor(air, STANDARD_LOADOUT))).toBe(true);
    expect(world.player.alive).toBe(true);
    expect(world.player.landed).toBe(false);
    expect(world.playerBody().agl).toBeCloseTo(60, 0);
    expect(Math.hypot(world.player.vel.x, world.player.vel.z)).toBeCloseTo(31, 0);
  });

  it('warns outside the combat zone and destroys the helicopter after 10 s', () => {
    const { session, runtime, world, events } = battle();
    session.deploy(runtime.spawnFor(runtime.spawnPoints(world)[1], STANDARD_LOADOUT));
    const h = world.player;
    const hold = () => { h.pos.set(3000, world.terrain.surfaceAt(3000, 0) + 150, 0); h.vel.set(0, 0, 0); };
    for (let i = 0; i < (BOUNDARY_GRACE - 1) * 120; i++) { hold(); session.step(STEP); }
    expect(h.alive).toBe(true);
    const warnings = events.filter(e => e.t === 'zone' && !e.inside);
    expect(warnings.length).toBeGreaterThanOrEqual(BOUNDARY_GRACE - 1);
    h.pos.set(0, world.terrain.surfaceAt(0, 0) + 150, 0);
    session.step(STEP);
    session.step(STEP);
    expect(events.some(e => e.t === 'zone' && e.inside)).toBe(true);
    for (let i = 0; i < (BOUNDARY_GRACE - 1) * 120; i++) { hold(); session.step(STEP); }
    expect(h.alive).toBe(true);
    for (let i = 0; i < 2 * 120; i++) { hold(); session.step(STEP); }
    expect(h.alive).toBe(false);
    expect(events.some(e => e.t === 'crash' && e.reason === 'outOfBounds')).toBe(true);
  });

  it('stops enemy bots from seeing a player who is not deployed', () => {
    const { session, world } = battle('veros');
    expect(world.playerSide).toBe('veros');
    const aaa = world.units.find(u => u.defId === 'c_aaa')!;
    world.player.pos.set(aaa.pos.x + 300, aaa.pos.y + 50, aaa.pos.z);
    session.frozen = false;
    run(session, 5);
    expect(aaa.ai.detected).toBe(false);
  });
});
