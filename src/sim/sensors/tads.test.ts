import { describe, expect, it } from 'vitest';
import { DEG } from '../../core/math';
import { updateQ } from '../heli/state';
import { airborneAt, hoverCollective, makeWorld } from '../testing';
import { STEP } from '../world';
import { createTads, slewTads, TADS_FOVS, TADS_LIMITS, tadsDirection, zoomTads } from './tads';

describe('TADS (04-weapons-and-sensors.md 4.4)', () => {
  it('steps the field of view 30/10/3/1 and stops at the ends', () => {
    const t = createTads();
    const seen = [TADS_FOVS[t.fov]];
    for (let i = 0; i < 4; i++) { zoomTads(t, 1); seen.push(TADS_FOVS[t.fov]); }
    expect(seen).toEqual([30, 10, 3, 1, 1]);
    zoomTads(t, -1);
    expect(TADS_FOVS[t.fov]).toBe(3);
  });

  it('slews slower when zoomed in and respects the gimbal limits', () => {
    const wide = createTads(), narrow = createTads();
    narrow.fov = 3;
    slewTads(wide, 0.1, 0); slewTads(narrow, 0.1, 0);
    expect(narrow.az).toBeCloseTo(wide.az / 30, 6);
    slewTads(wide, 10, 10);
    expect(wide.az).toBeCloseTo(TADS_LIMITS.az);
    expect(wide.el).toBeCloseTo(30 * DEG);
    slewTads(wide, -20, -20);
    expect(wide.az).toBeCloseTo(-120 * DEG);
    expect(wide.el).toBeCloseTo(-60 * DEG);
  });

  it('looks along the nose at az 0, el 0', () => {
    const { world } = makeWorld();
    world.player.yaw = 0;
    updateQ(world.player);
    const t = createTads(); t.el = 0;
    const d = tadsDirection(world.player, t);
    expect(d.z).toBeCloseTo(-1, 3);
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
