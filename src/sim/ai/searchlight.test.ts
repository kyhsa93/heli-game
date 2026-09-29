import { describe, expect, it } from 'vitest';
import { LosCache } from '../los';
import { makeWorld, openPair, putPlayer, runAi } from '../testing';
import type { World } from '../world';
import { eyeOf, visualRange, type Conditions } from './awareness';
import { lampPosition, litBy, stepSearchlights } from './searchlight';

const NIGHT: Conditions = { night: true, fog: false, playerRadar: false, time: 'night' };

function setup(dist = 2200) {
  const { world } = makeWorld();
  world.clearCombat();
  world.conditions = { ...NIGHT };
  const g = openPair(world, dist, 60);
  putPlayer(world, g.player.x, g.player.z, 60);
  world.player.landed = false; world.player.engineOn = true;
  const light = world.spawnUnit('searchlight', g.unit.x, g.unit.z);
  const gun = world.spawnUnit('aaa_light', g.unit.x + 20, g.unit.z + 10);
  return { world, light, gun };
}

function aimAt(world: World, light: ReturnType<typeof setup>['light']) {
  const to = world.player.pos.clone().sub(lampPosition(light)).normalize();
  light.beam = { yaw: Math.atan2(-to.x, -to.z), pitch: Math.asin(to.y), lost: 0, lit: false };
}

describe('searchlights (05 5.4)', () => {
  it('sweeps the sky at night while nobody is in the beam', () => {
    const { world, light } = setup();
    world.player.pos.y += 5000;
    stepSearchlights(world, 0.1);
    const yaw0 = light.beam!.yaw;
    world.time += 3;
    stepSearchlights(world, 0.1);
    expect(light.beam!.yaw).not.toBeCloseTo(yaw0, 3);
    expect(light.beam!.lit).toBe(false);
  });

  it('lets the guns next to it see a lit helicopter beyond the 1.5 km night limit', () => {
    for (const lit of [true, false]) {
      const { world, light, gun } = setup(1900);
      expect(visualRange(world.conditions)).toBe(1500);
      if (lit) aimAt(world, light); else world.damageUnit(light, 999, true);
      stepSearchlights(world, 0.1);
      expect(litBy(world, gun)).toBe(lit);
      const los = new LosCache(world.terrain);
      const t = runAi(world, los, 90, world.conditions, () => { stepSearchlights(world, 0.1); return gun.ai.detected; });
      expect(eyeOf(gun).distanceTo(world.player.pos)).toBeGreaterThan(1500);
      expect(t < 90, `lit ${lit}`).toBe(lit);
    }
  });

  it('follows a lit helicopter that keeps moving', () => {
    const { world, light } = setup();
    aimAt(world, light);
    for (let i = 0; i < 40; i++) { world.player.pos.x += 3; world.time += 0.05; stepSearchlights(world, 0.05); }
    expect(light.beam!.lit).toBe(true);
  });

  it('goes dark when shot out, and does nothing by day', () => {
    const { world, light, gun } = setup();
    aimAt(world, light);
    world.damageUnit(light, 999, true);
    stepSearchlights(world, 0.1);
    expect(litBy(world, gun)).toBe(false);
    const day = setup();
    day.world.conditions = { ...NIGHT, night: false, time: 'day' };
    aimAt(day.world, day.light);
    stepSearchlights(day.world, 0.1);
    expect(day.light.beam!.lit).toBe(false);
  });
});
