import { describe, expect, it } from 'vitest';
import { GEAR_Y } from './heli/airframe';
import { updateQ } from './heli/state';
import { FlightSession } from './session';
import { airborneAt, descend, holdClimb, hoverCollective, makeWorld, run } from './testing';
import type { World } from './world';

describe('terrain', () => {
  it('places flat pads above water', () => {
    const { world: sim } = makeWorld();
    expect(sim.pads.length).toBeGreaterThanOrEqual(5);
    for (const p of sim.pads) {
      expect(p.y).toBeGreaterThanOrEqual(4);
      for (const [dx, dz] of [[0, 0], [8, 0], [0, -8], [-6, 6]]) {
        expect(Math.abs(sim.terrain.heightAt(p.x + dx, p.z + dz) - p.y)).toBeLessThan(0.05);
      }
    }
  });
});

describe('flight', () => {
  it('needs the engine and rotor rpm before it can lift off', () => {
    const { world: sim } = makeWorld();
    sim.controls.collective = 1;
    run(sim, 3);
    expect(sim.player.landed).toBe(true);
    sim.controls.collective = 0;
    sim.toggleEngine();
    run(sim, 3);
    expect(sim.player.rpm).toBeGreaterThan(0.5);
    run(sim, 8);
    expect(sim.player.rpm).toBeGreaterThan(0.97);
    sim.controls.collective = 0.8;
    run(sim, 2);
    expect(sim.player.landed).toBe(false);
    expect(sim.player.vel.y).toBeGreaterThan(1);
  });

  it('holds a hover near the hover collective', () => {
    const { world: sim } = makeWorld();
    const b = sim.pads[0];
    airborneAt(sim, b.x, b.z, b.y + 60);
    sim.controls.collective = hoverCollective;
    run(sim, 4);
    expect(Math.abs(sim.player.vel.y)).toBeLessThan(1);
    expect(sim.player.alive).toBe(true);
  });

  it('pushing the cyclic forward pitches the nose down and accelerates forward', () => {
    const { world: sim } = makeWorld();
    const b = sim.pads[0];
    airborneAt(sim, b.x, b.z, b.y + 150);
    sim.player.yaw = 0; updateQ(sim.player);
    sim.controls.cyclicY = 1;
    run(sim, 4, holdClimb(sim, 0));
    expect(sim.player.pitch).toBeLessThan(-0.3);
    expect(sim.player.vel.z).toBeLessThan(-10);
  });

  it('lands softly on a pad', () => {
    const { world: sim } = makeWorld();
    const b = sim.pads[0];
    airborneAt(sim, b.x, b.z, b.y - GEAR_Y + 30);
    run(sim, 30, descend(sim));
    expect(sim.player.alive).toBe(true);
    expect(sim.player.landed).toBe(true);
    expect(sim.player.touchdownDescent).toBeLessThan(2);
  });

  it('crashes on a hard touchdown', () => {
    const { world: sim, events } = makeWorld();
    const b = sim.pads[0];
    airborneAt(sim, b.x, b.z, b.y - GEAR_Y + 20);
    sim.controls.collective = 0;
    run(sim, 5);
    expect(sim.player.alive).toBe(false);
    expect(events.find(e => e.t === 'crash')).toMatchObject({ reason: 'hardLanding' });
  });

  it('keeps rotor rpm up in autorotation with the collective down', () => {
    const { world: sim } = makeWorld();
    const b = sim.pads[0];
    airborneAt(sim, b.x, b.z, b.y + 600);
    sim.player.engineOn = false;
    sim.controls.collective = 0.05;
    run(sim, 6);
    expect(sim.player.rpm).toBeGreaterThan(0.9);
    sim.controls.collective = 0.9;
    run(sim, 6);
    expect(sim.player.rpm).toBeLessThan(0.9);
  });

  it('crashes into trees', () => {
    const { world: sim, events } = makeWorld();
    const t = sim.terrain.trees.find(tr => tr.h > 10)!;
    airborneAt(sim, t.x + 1, t.z, t.y + t.h - 3);
    run(sim, 0.1, holdClimb(sim, 0));
    expect(sim.player.alive).toBe(false);
    expect(events.find(e => e.t === 'crash')).toMatchObject({ reason: 'tree' });
  });
});

describe('session', () => {
  it('moves from play to crashed to over after a crash', () => {
    const session = new FlightSession(7);
    const modes: string[] = [];
    session.subscribe(() => modes.push(session.getSnapshot().mode));
    session.start();
    const w = session.world, b = w.pads[0];
    airborneAt(w, b.x, b.z, b.y - GEAR_Y + 20);
    w.controls.collective = 0;
    for (let i = 0; i < 120 * 8; i++) session.step(1 / 120);
    expect(modes).toEqual(['play', 'crashed', 'over']);
    expect(session.getSnapshot().crash?.reason).toBe('hardLanding');
  });

  it('does not fly before the session starts', () => {
    const session = new FlightSession(7);
    const y = session.world.player.pos.y;
    session.world.controls.collective = 1;
    session.world.player.engineOn = true; session.world.player.rpm = 1;
    for (let i = 0; i < 240; i++) session.step(1 / 120);
    expect(session.world.player.pos.y).toBe(y);
  });
});

describe('base pad', () => {
  function landOn(world: World, idx: number) {
    const p = world.pads[idx];
    airborneAt(world, p.x, p.z, p.y - GEAR_Y + 8);
    run(world, 25, descend(world, p));
    expect(world.player.landed).toBe(true);
  }

  it('refuels on the base pad', () => {
    const { world, events } = makeWorld();
    world.player.fuel = 20;
    landOn(world, 0);
    expect(world.player.fuel).toBeGreaterThan(60);
    expect(events.filter(e => e.t === 'refuel')).toHaveLength(1);
  });

  it('does not refuel on other pads', () => {
    const { world } = makeWorld();
    world.player.fuel = 20;
    landOn(world, 1);
    expect(world.player.fuel).toBeLessThan(21);
  });
});
