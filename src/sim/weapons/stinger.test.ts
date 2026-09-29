import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { STANDARD_LOADOUT } from '../heli/loadout';
import { airborneAt, makeWorld, run, skyPair } from '../testing';
import { unitCenter } from '../sensors/laser';
import { aimToward } from './arms';
import { STINGER_LOCK_SECONDS } from './stinger';
import type { World } from '../world';

function setup(dist = 2500) {
  const { world, events } = makeWorld();
  world.rearm({ ...STANDARD_LOADOUT, stingers: true });
  const p = skyPair(world, dist);
  airborneAt(world, p.player.x, p.player.z, p.player.y);
  const heli = world.spawnUnit('heli_attack', p.heli.x, p.heli.z, 0, { passive: true });
  world.selectWeapon(4);
  const hold = () => {
    world.player.pos.copy(p.player); world.player.vel.set(0, 0, 0);
    world.commands.aim = aimToward(world.player, unitCenter(heli));
  };
  return { world, events, heli, hold };
}

const look = (world: World, v: Vector3) => { world.commands.aim = aimToward(world.player, v); };

describe('Stinger (04 4.3)', () => {
  it('is weapon 4 only when carried', () => {
    const { world } = makeWorld();
    world.selectWeapon(4);
    expect(world.arms.selected).toBe('gun30');
    world.rearm({ ...STANDARD_LOADOUT, stingers: true });
    world.selectWeapon(4);
    expect(world.arms.selected).toBe('stinger');
    expect(world.loadout.stingerRounds).toBe(2);
  });

  it('locks after looking at a helicopter for 1.5 s and loses it when the head turns away', () => {
    const { world, heli, hold } = setup();
    run(world, STINGER_LOCK_SECONDS - 0.1, hold);
    expect(world.stinger.unitId).toBe(heli.id);
    expect(world.stinger.locked).toBe(false);
    run(world, 0.2, hold);
    expect(world.stinger.locked).toBe(true);
    look(world, world.player.pos.clone().add(new Vector3(500, 0, 0)));
    run(world, 0.05);
    expect(world.stinger.unitId).toBe(null);
    expect(world.stinger.locked).toBe(false);
  });

  it('does not fire without a lock and brings the helicopter down with one hit', () => {
    const { world, events, heli, hold } = setup();
    world.commands.fire = true;
    run(world, 0.3, hold);
    world.commands.fire = false;
    expect(world.aams).toHaveLength(0);
    run(world, STINGER_LOCK_SECONDS, hold);
    world.commands.fire = true;
    run(world, 0.05, hold);
    world.commands.fire = false;
    expect(world.aams).toHaveLength(1);
    expect(world.loadout.stingerRounds).toBe(1);
    run(world, 8, hold);
    expect(heli.alive).toBe(false);
    expect(events.some(e => e.t === 'impact' && e.weapon === 'stinger' && e.unit === heli.id)).toBe(true);
    expect(events.some(e => e.t === 'missileWarning' && e.owner === 0)).toBe(false);
  });

  it('ignores ground vehicles', () => {
    const { world } = makeWorld();
    world.rearm({ ...STANDARD_LOADOUT, stingers: true });
    airborneAt(world, 0, 0, world.terrain.surfaceAt(0, 0) + 600);
    const truck = world.spawnUnit('truck', 0, -1500, 0, { passive: true });
    world.selectWeapon(4);
    run(world, 2, () => look(world, unitCenter(truck)));
    expect(world.stinger.unitId).toBe(null);
  });
});
