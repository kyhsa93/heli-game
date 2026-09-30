import { describe, expect, it } from 'vitest';
import harekRaw from '../../content/battle/maps/harek.json?raw';
import { STEP } from '../world';
import { createBattleSession, SQUAD_QUIET } from './runtime';
import type { BattleMapDef } from './schema';

const harek = JSON.parse(harekRaw) as BattleMapDef;

function battle() {
  const { session, runtime } = createBattleSession(harek, 'quick', { side: 'coalition', seed: 8 });
  session.start();
  const w = session.world;
  for (const u of w.units) if (u.def.move) w.damageUnit(u, 1e5, false);
  w.units = w.units.filter(u => !u.def.move);
  runtime.spawner.nextWave = Infinity;
  return { session, runtime, world: w };
}

describe('infantry capture and spawning (wiki 3.3, B2-9)', () => {
  it('lets one soldier take a neutral point in 42 s', () => {
    const { session, runtime, world } = battle();
    const d = runtime.conquest.points.find(p => p.id === 'D')!;
    session.deploy({ kind: 'soldier', x: d.x + 5, z: d.z + 5, headingDeg: 0, cls: 'assault' });
    let at = -1;
    for (let s = 1; s <= 60 && at < 0; s++) { for (let i = 0; i < 120; i++) session.step(STEP); if (d.owner === 'coalition') at = s; }
    expect(at).toBeGreaterThanOrEqual(41);
    expect(at).toBeLessThanOrEqual(43);
    expect(world.soldier!.alive).toBe(true);
  });

  it('offers the base, quiet friendly points and quiet friendly squads', () => {
    const { runtime, world } = battle();
    const ids = () => runtime.spawnPoints(world).filter(p => p.role === 'soldier').map(p => p.id);
    expect(ids()).toEqual(['soldierBase', 'point:A']);
    const a = runtime.conquest.points.find(p => p.id === 'A')!;
    const enemy = world.spawnUnit('inf', a.x + 100, a.z);
    expect(ids()).not.toContain('point:A');
    world.damageUnit(enemy, 1e5, false);
    expect(ids()).toContain('point:A');
    const squad = world.spawnUnit('c_inf', 0, 3000);
    expect(ids()).toContain(`squad:${squad.id}`);
    squad.battle = { target: null, aim: 0, fire: {}, firedAt: world.time };
    expect(ids()).not.toContain(`squad:${squad.id}`);
    world.time += SQUAD_QUIET + 1;
    expect(ids()).toContain(`squad:${squad.id}`);
    world.spawnUnit('tank', 60, 3000);
    expect(ids()).not.toContain(`squad:${squad.id}`);
  });

  it('numbers squad spawns that share a nearest point so every label differs', () => {
    const { runtime, world } = battle();
    for (const dx of [0, 40, 80]) world.spawnUnit('c_inf', dx, 3000);
    world.spawnUnit('c_inf', 0, -900);
    const labels = runtime.spawnPoints(world).filter(p => p.id.startsWith('squad:')).map(p => p.label);
    expect(labels.sort()).toEqual(['squad:A:1', 'squad:A:2', 'squad:D']);
  });

  it('spawns the soldier beside the chosen squad and charges one ticket per death', () => {
    const { session, runtime, world } = battle();
    const squad = world.spawnUnit('c_inf', 0, 3000);
    const point = runtime.spawnPoints(world).find(p => p.id === `squad:${squad.id}`)!;
    session.deploy(runtime.spawnFor(point, runtime.map.bases[0] as never));
    expect(Math.hypot(world.soldier!.pos.x - squad.pos.x, world.soldier!.pos.z - squad.pos.z)).toBeCloseTo(5, 3);
    const before = runtime.conquest.tickets.coalition;
    world.killPlayer('killed');
    for (let i = 0; i < 12; i++) session.step(STEP);
    expect(runtime.conquest.tickets.coalition).toBeCloseTo(before - 1, 5);
    expect(runtime.respawnDelay).toBe(10);
  });
});
