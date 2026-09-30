import { describe, expect, it } from 'vitest';
import harekRaw from '../../content/battle/maps/harek.json?raw';
import { FlightInput } from '../../input/input';
import { roleCommand, roleOf, wantsPointerLock } from '../../input/roles';
import { createBattleSession } from '../battle/runtime';
import type { BattleMapDef } from '../battle/schema';
import { STANDARD_LOADOUT } from '../heli/loadout';
import { STEP } from '../world';
import { SOLDIER_HP } from './soldier';

const harek = JSON.parse(harekRaw) as BattleMapDef;

function battle() {
  const { session, runtime } = createBattleSession(harek, 'quick', { side: 'coalition', seed: 5 });
  session.start();
  return { session, runtime, world: session.world };
}
const run = (s: { step(dt: number): void }, seconds: number) => { for (let i = 0; i < seconds * 120; i++) s.step(STEP); };
const base = harek.bases[0].position;
const soldierAt = { kind: 'soldier' as const, x: base[0] + 30, z: base[1] - 30, headingDeg: 0, cls: 'assault' as const };

describe('avatar v2: soldier (B2-1)', () => {
  it('spawns a soldier on the ground, as the player body the bots see', () => {
    const { session, world } = battle();
    expect(session.deploy(soldierAt)).toBe(true);
    expect(world.avatar.kind).toBe('soldier');
    const s = world.soldier!;
    expect(s.hp).toBe(SOLDIER_HP);
    expect(s.pos.y).toBeCloseTo(world.terrain.surfaceAt(s.pos.x, s.pos.z), 5);
    const b = world.playerBody();
    expect(b).toMatchObject({ kind: 'soldier', alive: true, agl: 0 });
    expect(b.pos).toBe(s.pos);
  });

  it('dies from bot fire scaled to player health, costs one ticket, and goes back to deploy', () => {
    const { session, runtime, world } = battle();
    session.deploy(soldierAt);
    const before = runtime.conquest.tickets.coalition;
    world.difficulty = { ...world.difficulty, damageTaken: 1 };
    world.hitPlayer(0, 1.5);
    expect(world.soldier!.hp).toBeCloseTo(SOLDIER_HP - 18.75);
    for (let i = 0; i < 10; i++) world.hitPlayer(0, 1.5);
    expect(world.soldier!.alive).toBe(false);
    run(session, 3);
    expect(session.mode).toBe('deploy');
    expect(runtime.conquest.tickets.coalition).toBeCloseTo(before - 1, 0);
  });

  it('switches helicopter to soldier and back across deaths', () => {
    const { session, runtime, world } = battle();
    session.deploy(runtime.spawnFor(runtime.spawnPoints(world)[1], STANDARD_LOADOUT));
    expect(world.playerBody().kind).toBe('heli');
    world.killPlayer('crewKilled');
    run(session, 3 + runtime.respawnDelay);
    expect(session.deploy(soldierAt)).toBe(true);
    expect(world.playerBody().kind).toBe('soldier');
    const heliPos = world.player.pos.clone();
    run(session, 1);
    expect(world.player.pos).toEqual(heliPos);
    world.killPlayer('killed');
    run(session, 3 + runtime.respawnDelay);
    session.deploy(runtime.spawnFor(runtime.spawnPoints(world)[1], STANDARD_LOADOUT));
    expect(world.playerBody()).toMatchObject({ kind: 'heli', alive: true });
  });
});

describe('role input sets (B2-1)', () => {
  it('maps keys per role', () => {
    expect(roleCommand('KeyC', 'heli')).toBe('centerView');
    expect(roleCommand('KeyC', 'soldier')).toBe('crouch');
    expect(roleCommand('KeyR', 'heli')).toBe('fcr');
    expect(roleCommand('KeyR', 'soldier')).toBe('reload');
    expect(roleCommand('KeyT', 'soldier')).toBeUndefined();
    expect(roleCommand('Escape', 'none')).toBe('pause');
    expect(wantsPointerLock('soldier', false)).toBe(true);
    expect(wantsPointerLock('soldier', true)).toBe(false);
    expect(wantsPointerLock('heli', false)).toBe(false);
  });

  it('drives soldier commands on foot and the helicopter controls in the air', () => {
    const { session, runtime, world } = battle();
    const input = new FlightInput();
    input.gamepads = () => [];
    session.deploy(soldierAt);
    expect(roleOf(world)).toBe('soldier');
    input.keys.add('KeyW'); input.keys.add('KeyD'); input.keys.add('ShiftLeft');
    const coll = world.controls.collective;
    input.update(world, 0.1);
    expect(world.soldierCommands).toMatchObject({ forward: 1, right: 1, sprint: true });
    expect(world.controls.collective).toBe(coll);
    input.look(100, 0);
    input.update(world, 0.1);
    expect(world.soldierCommands.yaw).toBeLessThan(world.soldier!.yaw);
    world.killPlayer('killed');
    run(session, 3 + runtime.respawnDelay);
    session.deploy(runtime.spawnFor(runtime.spawnPoints(world)[1], STANDARD_LOADOUT));
    expect(roleOf(world)).toBe('heli');
    input.keys.clear(); input.keys.add('KeyW');
    input.update(world, 0.5);
    expect(world.controls.collective).toBeGreaterThan(coll);
  });
});
