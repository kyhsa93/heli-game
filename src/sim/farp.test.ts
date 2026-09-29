import { describe, expect, it } from 'vitest';
import type { SimEvent } from './events';
import { CLEAN_LOADOUT, STANDARD_LOADOUT } from './heli/loadout';
import { farpUnder, REARM_PER_PYLON, rearmSeconds, REPAIR_SECONDS, startService } from './farp';
import { makeWorld } from './testing';
import { STEP, type World } from './world';

function onPad() {
  const { world, events } = makeWorld(7);
  world.player.engineOn = true; world.player.rpm = 1;
  return { world, events: events as SimEvent[] };
}

const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s / STEP); i++) w.step(STEP); };

describe('FARP services (06-missions-and-world.md 6.5)', () => {
  it('starts only when landed on a FARP pad', () => {
    const { world } = onPad();
    expect(farpUnder(world)).toBe(0);
    world.damageSystem('hydraulics', 30);
    expect(startService(world, { repair: true })).not.toBeNull();
    const far = makeWorld(7).world;
    far.player.pos.x += 300;
    expect(startService(far, { repair: true })).toBeNull();
  });

  it('repairs every system in 60 s', () => {
    const { world, events } = onPad();
    world.damageSystem('engine1', 70); world.damageSystem('tail', 100);
    startService(world, { repair: true });
    run(world, REPAIR_SECONDS - 1);
    expect(world.player.damage.tail).toBe(0);
    run(world, 1.2);
    expect(world.player.damage.engine1).toBe(100);
    expect(world.player.damage.tail).toBe(100);
    expect(events.some(e => e.t === 'farp' && e.state === 'done')).toBe(true);
  });

  it('rearms at 15 s per changed pylon and keeps the fuel', () => {
    const { world } = onPad();
    world.applyLoadout({ ...CLEAN_LOADOUT, fuel: 40 });
    world.player.fuel = 40;
    const want = { ...STANDARD_LOADOUT, fuel: 10 };
    const secs = rearmSeconds(world, want);
    expect(secs).toBe(5 * REARM_PER_PYLON);
    startService(world, { rearm: want });
    run(world, secs - 1);
    expect(world.loadout.def.pylons.L1).toBe('empty');
    run(world, 1.2);
    expect(world.loadout.def.pylons.L1).toBe('agm114k');
    expect(world.loadout.rounds.L2).toBe(19);
    expect(world.arms.gunAmmo).toBe(1200);
    expect(world.player.fuel).toBe(100);
  });

  it('runs repair and rearm together and finishes with the longer one', () => {
    const { world } = onPad();
    world.damageSystem('fuel', 60);
    world.loadout.rounds.L1 = 1;
    startService(world, { repair: true, rearm: STANDARD_LOADOUT });
    expect(world.farpService!.rearmLeft).toBe(REARM_PER_PYLON);
    run(world, REARM_PER_PYLON + 0.2);
    expect(world.loadout.rounds.L1).toBe(4);
    expect(world.farpService).not.toBeNull();
    run(world, REPAIR_SECONDS - REARM_PER_PYLON);
    expect(world.farpService).toBeNull();
    expect(world.player.damage.fuel).toBe(100);
  });

  it('stops if the helicopter lifts off', () => {
    const { world, events } = onPad();
    world.damageSystem('rotor', 40);
    startService(world, { repair: true });
    run(world, 5);
    world.player.landed = false;
    world.player.pos.y += 5;
    world.step(STEP);
    expect(world.farpService).toBeNull();
    expect(events.some(e => e.t === 'farp' && e.state === 'cancelled')).toBe(true);
    expect(world.player.damage.rotor).toBe(60);
  });

  it('keeps refuelling at 8% a second while landed', () => {
    const { world } = onPad();
    world.player.fuel = 50;
    run(world, 5);
    expect(world.player.fuel).toBeCloseTo(90, 0);
  });
});
