import { describe, expect, it } from 'vitest';
import { STANDARD_LOADOUT } from '../heli/loadout';
import { updateQ } from '../heli/state';
import { airborneAt, makeWorld, openPair, popupPair, putPlayer, run } from '../testing';
import type { World } from '../world';
import { FCR_MAX_TARGETS, FCR_RANGE, FCR_SCAN_SECONDS, FCR_STALE_SECONDS, isStale } from './fcr';

const LONGBOW = { ...STANDARD_LOADOUT, pylons: { L2: 'hydra70', L1: 'agm114l', R1: 'agm114l', R2: 'agm114k' } } as const;

function face(world: World, x: number, z: number) {
  const h = world.player;
  h.yaw = Math.atan2(-(x - h.pos.x), -(z - h.pos.z));
  updateQ(h);
}

function pin(world: World) {
  const at = world.player.pos.clone();
  return () => { world.player.pos.copy(at); world.player.vel.set(0, 0, 0); };
}

function scan(world: World) {
  expect(world.fcrScan()).toBe(true);
  run(world, FCR_SCAN_SECONDS + 0.05, pin(world));
  return world.fcr.targets;
}

describe('FCR (04 4.4)', () => {
  it('takes three seconds, radiates while it scans and lists what it sees', () => {
    const { world, events } = makeWorld();
    const p = popupPair(world, 3000);
    airborneAt(world, p.high.x, p.high.z, p.high.y);
    face(world, p.unit.x, p.unit.z);
    const tank = world.spawnUnit('tank', p.unit.x, p.unit.z);
    world.fcrScan();
    expect(world.fcrScan()).toBe(false);
    run(world, FCR_SCAN_SECONDS - 0.1);
    expect(world.fcr.scanning).toBe(true);
    expect(world.conditions.playerRadar).toBe(true);
    expect(world.fcr.targets).toEqual([]);
    run(world, 0.15);
    expect(world.fcr.scanning).toBe(false);
    expect(world.conditions.playerRadar).toBe(false);
    expect(world.fcr.targets.map(t => [t.unitId, t.cls])).toEqual([[tank.id, 'tracked']]);
    expect(events.some(e => e.t === 'fcr' && e.state === 'done' && e.count === 1)).toBe(true);
  });

  it('does not see a unit hidden by terrain', () => {
    const { world } = makeWorld();
    const p = popupPair(world, 3000);
    world.spawnUnit('tank', p.unit.x, p.unit.z);
    airborneAt(world, p.low.x, p.low.z, p.low.y - 10);
    face(world, p.unit.x, p.unit.z);
    expect(scan(world)).toEqual([]);
    airborneAt(world, p.high.x, p.high.z, p.high.y);
    face(world, p.unit.x, p.unit.z);
    expect(scan(world)).toHaveLength(1);
  });

  it('searches the ground sector ahead or the whole sky, and ignores infantry and buildings', () => {
    const { world } = makeWorld();
    airborneAt(world, 0, 0, world.terrain.surfaceAt(0, 0) + 1500);
    face(world, 0, -1000);
    const ahead = world.spawnUnit('truck', 0, -3000);
    world.spawnUnit('truck', 3000, 0);
    world.spawnUnit('truck', 0, -(FCR_RANGE + 800));
    world.spawnUnit('inf', 100, -3000);
    world.spawnUnit('bunker', -100, -3000);
    const heli = world.spawnUnit('heli_attack', 0, 3000);
    expect(scan(world).map(t => t.unitId)).toEqual([ahead.id]);
    world.setFcrMode('air');
    expect(scan(world).map(t => [t.unitId, t.cls])).toEqual([[heli.id, 'heli']]);
  });

  it('ranks air defence over armour over wheels, nearest first, sixteen at most', () => {
    const { world } = makeWorld();
    airborneAt(world, 0, 0, world.terrain.surfaceAt(0, 0) + 2000);
    face(world, 0, -1000);
    for (let i = 0; i < 20; i++) world.spawnUnit('truck', (i % 5) * 60 - 120, -1500 - i * 40);
    const tank = world.spawnUnit('tank', 0, -3500);
    const spaag = world.spawnUnit('spaag', 0, -4500);
    const civ = world.spawnUnit('civ_car', 300, -1200);
    const list = scan(world);
    expect(list).toHaveLength(FCR_MAX_TARGETS);
    expect(list[0].unitId).toBe(spaag.id);
    expect(list[1].unitId).toBe(tank.id);
    expect(list[2].unitId).toBe(civ.id);
    for (let i = 3; i < list.length; i++) expect(list[i].range).toBeGreaterThanOrEqual(list[i - 1].range);
  });

  it('keeps scan-time positions, fades them after thirty seconds and cycles with Tab', () => {
    const { world } = makeWorld();
    airborneAt(world, 0, 0, world.terrain.surfaceAt(0, 0) + 1500);
    face(world, 0, -1000);
    const a = world.spawnUnit('truck', 0, -2000), b = world.spawnUnit('truck', 200, -2500);
    const list = scan(world);
    const at = list[0].pos.clone();
    a.pos.x += 80;
    expect(world.fcr.targets[0].pos).toEqual(at);
    expect(world.fcr.targets.map(t => t.unitId)).toEqual([a.id, b.id]);
    world.nextFcrTarget();
    expect(world.fcr.selected).toBe(1);
    world.nextFcrTarget();
    expect(world.fcr.selected).toBe(0);
    expect(isStale(list[0], world.time + FCR_STALE_SECONDS - 1)).toBe(false);
    expect(isStale(list[0], world.time + FCR_STALE_SECONDS + 1)).toBe(true);
  });

  it('makes every enemy radar in view pick the helicopter up while it scans', () => {
    const { world } = makeWorld();
    const p = openPair(world, 3500, 30);
    const spaag = world.spawnUnit('spaag', p.unit.x, p.unit.z);
    putPlayer(world, p.player.x, p.player.z, 30);
    airborneAt(world, world.player.pos.x, world.player.pos.z, world.player.pos.y);
    face(world, p.unit.x, p.unit.z);
    world.fcrScan();
    run(world, 0.25, pin(world));
    expect(spaag.ai.radar).not.toBe('search');
  });

  it('stays silent when locked', () => {
    const { world } = makeWorld();
    world.fcr.unlocked = false;
    expect(world.fcrScan()).toBe(false);
  });
});

describe('AGM-114L (04 4.3)', () => {
  function armed() {
    const { world, events } = makeWorld();
    world.rearm(LONGBOW);
    world.selectWeapon(3);
    world.selectWeapon(3);
    return { world, events };
  }

  it('selects K and L in turn on key 3', () => {
    const { world } = armed();
    expect(world.arms.selected).toBe('agm114l');
    world.selectWeapon(3);
    expect(world.arms.selected).toBe('agm114k');
    world.selectWeapon(3);
    expect(world.arms.selected).toBe('agm114l');
    world.rearm({ ...STANDARD_LOADOUT, pylons: { L2: 'agm114l', L1: 'empty', R1: 'empty', R2: 'empty' } });
    world.selectWeapon(3);
    expect(world.arms.selected).toBe('agm114l');
  });

  it('needs an FCR target', () => {
    const { world } = armed();
    airborneAt(world, 0, 0, world.terrain.surfaceAt(0, 0) + 800);
    world.commands.fire = true;
    run(world, 0.1);
    expect(world.missiles).toHaveLength(0);
  });

  it('hits after the shooter drops behind the ridge, even if the target moved', () => {
    const { world, events } = armed();
    const p = popupPair(world, 3000);
    const tank = world.spawnUnit('tank', p.unit.x, p.unit.z);
    airborneAt(world, p.high.x, p.high.z, p.high.y);
    face(world, p.unit.x, p.unit.z);
    scan(world);
    world.commands.fire = true;
    run(world, 0.05);
    world.commands.fire = false;
    expect(world.missiles.map(m => [m.kind, m.mode])).toEqual([['agm114l', 'rf']]);
    airborneAt(world, p.low.x, p.low.z, p.low.y - 10);
    tank.pos.x += 40; tank.pos.z += 30; tank.pos.y = world.terrain.surfaceAt(tank.pos.x, tank.pos.z);
    run(world, 14, pin(world));
    expect(world.player.alive).toBe(true);
    expect(tank.alive).toBe(false);
    expect(events.some(e => e.t === 'impact' && e.weapon === 'agm114l' && e.unit === tank.id)).toBe(true);
  });

  it('cannot tell a civilian car from a truck', () => {
    const { world } = armed();
    airborneAt(world, 0, 0, world.terrain.surfaceAt(0, 0) + 1500);
    face(world, 0, -1000);
    const car = world.spawnUnit('civ_car', 0, -2500);
    scan(world);
    expect(world.fcr.targets[0]).toMatchObject({ unitId: car.id, cls: 'wheeled' });
    world.commands.fire = true;
    run(world, 0.05);
    world.commands.fire = false;
    run(world, 12, pin(world));
    expect(car.alive).toBe(false);
  });
});
