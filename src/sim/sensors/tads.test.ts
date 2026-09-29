import { describe, expect, it } from 'vitest';
import { DEG } from '../../core/math';
import { updateQ } from '../heli/state';
import { airborneAt, hoverCollective, makeWorld } from '../testing';
import { STEP } from '../world';
import { constrainTads, createTads, pointTads, slewTads, TADS_FOVS, TADS_LIMITS, tadsDirection, tadsLocal, zoomTads } from './tads';

describe('TADS (04-weapons-and-sensors.md 4.4)', () => {
  it('steps the field of view 30/10/3/1 and stops at the ends', () => {
    const t = createTads();
    const seen = [TADS_FOVS[t.fov]];
    for (let i = 0; i < 4; i++) { zoomTads(t, 1); seen.push(TADS_FOVS[t.fov]); }
    expect(seen).toEqual([30, 10, 3, 1, 1]);
    zoomTads(t, -1);
    expect(TADS_FOVS[t.fov]).toBe(3);
  });

  it('slews slower when zoomed in', () => {
    const wide = createTads(), narrow = createTads();
    narrow.fov = 3;
    slewTads(wide, 0.1, 0); slewTads(narrow, 0.1, 0);
    expect(narrow.az).toBeCloseTo(wide.az / 30, 6);
  });

  it('stays on its line of sight while the airframe moves (#69)', () => {
    const { world } = makeWorld();
    const h = world.player;
    h.yaw = 0.3; h.pitch = 0; h.roll = 0; updateQ(h);
    const t = createTads();
    pointTads(h, t, { az: 0.2, el: -0.1 });
    const before = tadsDirection(t).clone();
    h.pitch = 0.08; h.roll = -0.1; h.yaw = 0.35; updateQ(h);
    constrainTads(h, t);
    expect(tadsDirection(t).angleTo(before)).toBeLessThan(1e-9);
    expect(tadsLocal(h, t).az).toBeCloseTo(0.2 - 0.05, 1);
  });

  it('holds the gimbal limits relative to the airframe', () => {
    const { world } = makeWorld();
    const h = world.player;
    h.yaw = 0; h.pitch = 0; h.roll = 0; updateQ(h);
    const t = createTads();
    pointTads(h, t, { az: 0, el: 0 });
    h.yaw = Math.PI; updateQ(h);
    expect(constrainTads(h, t)).toBe(true);
    expect(Math.abs(tadsLocal(h, t).az)).toBeCloseTo(TADS_LIMITS.az, 5);
    pointTads(h, t, { az: 0, el: -1.4 });
    constrainTads(h, t);
    expect(tadsLocal(h, t).el).toBeCloseTo(-60 * DEG, 5);
    pointTads(h, t, { az: 0, el: 0.9 });
    constrainTads(h, t);
    expect(tadsLocal(h, t).el).toBeCloseTo(30 * DEG, 5);
  });

  it('starts slaved to the helmet line of sight', () => {
    const { world } = makeWorld();
    const p = world.pads[0];
    airborneAt(world, p.x, p.z, p.y + 60);
    world.commands.aim.yaw = 0.4; world.commands.aim.pitch = -0.2;
    world.toggleTads();
    const l = tadsLocal(world.player, world.tads);
    expect(l.az).toBeCloseTo(0.4, 2);
    expect(l.el).toBeCloseTo(-0.2, 2);
  });

  for (const seed of [7, 21, 99]) {
    it(`holds position within 2 m for 10 s in TADS mode (seed ${seed})`, () => {
      const { world } = makeWorld(seed);
      const p = world.pads[0];
      airborneAt(world, p.x, p.z, p.y + 60);
      world.controls.collective = hoverCollective(world);
      world.time = seed * 13;
      world.toggleTads();
      expect(world.tads.active).toBe(true);
      const start = world.player.pos.clone(), yaw = world.player.yaw;
      let worst = 0;
      for (let i = 0; i < 10 * 120; i++) {
        world.controls.cyclicX = world.controls.cyclicY = world.controls.pedal = 0;
        world.step(STEP);
        worst = Math.max(worst, world.player.pos.distanceTo(start));
      }
      expect(world.player.alive).toBe(true);
      expect(worst).toBeLessThan(2);
      expect(Math.abs(world.player.yaw - yaw)).toBeLessThan(2 * DEG);
    });
  }

  it('brings a moving helicopter to a stop and then holds', () => {
    const { world } = makeWorld();
    const p = world.pads[0];
    airborneAt(world, p.x, p.z, p.y + 80);
    world.player.vel.set(15, 0, 0);
    world.toggleTads();
    for (let i = 0; i < 25 * 120; i++) world.step(STEP);
    expect(Math.hypot(world.player.vel.x, world.player.vel.z)).toBeLessThan(0.3);
    const here = world.player.pos.clone();
    for (let i = 0; i < 10 * 120; i++) world.step(STEP);
    expect(world.player.pos.distanceTo(here)).toBeLessThan(2);
  });

  it('hands the controls back when TADS mode ends', () => {
    const { world } = makeWorld();
    const p = world.pads[0];
    airborneAt(world, p.x, p.z, p.y + 60);
    world.toggleTads();
    world.toggleTads();
    expect(world.hold).toBeNull();
    world.controls.cyclicY = 1;
    world.step(STEP);
    expect(world.controls.cyclicY).toBe(1);
  });
});

describe('TADS at night (06 6.1)', () => {
  it('only offers FLIR once it is dark', () => {
    const { world } = makeWorld();
    airborneAt(world, 0, 0, world.terrain.surfaceAt(0, 0) + 200);
    world.tads.sensor = 'tv';
    world.step(1 / 120);
    expect(world.tads.sensor).toBe('tv');
    world.conditions.time = 'night';
    world.step(1 / 120);
    expect(world.tads.sensor).toBe('flir');
  });
});
