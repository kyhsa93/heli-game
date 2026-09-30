import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { EYE } from '../heli/airframe';
import { toWorld } from '../heli/state';
import { airborneAt, hiddenPair, makeWorld, openPair } from '../testing';
import { STEP, type World } from '../world';
import { DWELL_HOLD, IDENTIFY_HOLD, PlayerSpotting } from './spotting';

function aimAt(world: World, target: Vector3) {
  const h = world.player;
  const eye = toWorld(h, EYE, new Vector3());
  const local = target.clone().sub(eye).applyQuaternion(h.q.clone().invert()).normalize();
  world.commands.aim.yaw = Math.atan2(-local.x, -local.z);
  world.commands.aim.pitch = Math.asin(local.y);
}

function scene(hidden = false) {
  const { world } = makeWorld(7);
  world.clearCombat();
  const g = hidden ? hiddenPair(world) : openPair(world, 1500, 30);
  const u = world.spawnUnit('tank', g.unit.x, g.unit.z);
  airborneAt(world, g.player.x, g.player.z, world.terrain.surfaceAt(g.player.x, g.player.z) + 30);
  const s = new PlayerSpotting();
  const tick = (seconds: number) => { for (let i = 0; i < seconds * 10; i++) { world.time += 0.1; s.step(world, 0.1); } };
  return { world, u, s, tick };
}

describe('player spotting (wiki 8.5)', () => {
  it('shows no enemy marker before the enemy is spotted', () => {
    const { world, u, s, tick } = scene();
    expect(s.markers(world)).toEqual([]);
    aimAt(world, u.pos.clone().setY(u.pos.y + 3));
    tick(0.3);
    expect(s.markers(world)).toEqual([]);
    tick(0.4);
    expect(s.markers(world)).toEqual([u]);
  });

  it('forgets a dwell spot after 8 s and an identification after 20 s', () => {
    const { world, u, s, tick } = scene();
    aimAt(world, u.pos.clone().setY(u.pos.y + 3));
    tick(1);
    world.commands.aim.yaw += Math.PI / 2;
    tick(DWELL_HOLD + 0.2);
    expect(s.markers(world)).toEqual([]);
    s.identified(u.id, world.time);
    tick(IDENTIFY_HOLD - 1);
    expect(s.markers(world)).toEqual([u]);
    tick(2);
    expect(s.markers(world)).toEqual([]);
  });

  it('hides a spotted enemy without line of sight and ignores friends', () => {
    const { world, u, s } = scene(true);
    s.identified(u.id, world.time);
    expect(s.spotted.has(u.id)).toBe(true);
    expect(s.markers(world)).toEqual([]);
    const friend = world.spawnUnit('c_tank', u.pos.x + 20, u.pos.z);
    s.identified(friend.id, world.time);
    const b = scene();
    b.s.identified(b.u.id, b.world.time);
    expect(b.s.markers(b.world)).toEqual([b.u]);
    b.world.killAvatar();
    expect(b.s.markers(b.world)).toEqual([]);
    void STEP;
  });
});
