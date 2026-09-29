import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../../content/missions';
import { terrainClear } from '../los';
import { loadMission } from '../mission/schema';
import { missionSession } from '../mission/runtime';
import { createFcr, type FcrTarget } from '../sensors/fcr';
import { unitCenter } from '../sensors/laser';
import { airborneAt, makeWorld, run } from '../testing';
import type { World } from '../world';
import { wingmanTarget } from './brain';
import { createWingman, formationPoint, FORMATION, WINGMAN_ID, WINGMAN_TYPE } from './wingman';

function withWingman(world: World, home: Vector3 | null = null) {
  const at = formationPoint(world);
  const u = world.spawnUnit(WINGMAN_TYPE, at.x, at.z, world.player.yaw);
  u.pos.y = at.y;
  world.wingman = createWingman(u.id, home);
  return u;
}

function cruise(world: World, speed: number) {
  const h = world.player, track = h.pos.clone();
  return () => {
    h.vel.set(-Math.sin(h.yaw) * speed, 0, -Math.cos(h.yaw) * speed);
    h.pos.copy(track);
    track.addScaledVector(h.vel, 1 / 120);
  };
}

function arena(world: World) {
  const t = world.terrain;
  for (let i = 0; i < 2000; i++) {
    const x = ((i * 7919) % 173) / 173 * t.half - t.half / 2, z = ((i * 104729) % 181) / 181 * t.half - t.half / 2;
    const eye = new Vector3(x, t.surfaceAt(x, z) + 500, z);
    const spots = [0, 1, 2].map(k => new Vector3(x + 1800 + k * 250, 0, z - 900 + k * 300)).map(p => p.setY(t.surfaceAt(p.x, p.z) + 1.5));
    if (spots.every(p => t.heightAt(p.x, p.z) > 1 && terrainClear(t, eye, p) && terrainClear(t, eye.clone().add(new Vector3(150, 0, 150)), p))) return { eye, spots };
  }
  throw new Error('no arena');
}

function fcrPick(world: World, unitId: number) {
  const u = world.unit(unitId)!;
  const t: FcrTarget = { unitId, pos: unitCenter(u), cls: 'wheeled', range: 1, bearing: 0, time: world.time, moving: false };
  world.fcr = { ...createFcr(), targets: [t], selected: 0 };
}

describe('wingman Hound 2 (03 3.4)', () => {
  it('holds formation 150 m right and behind while the lead cruises and turns', () => {
    const { world } = makeWorld();
    const h = world.player;
    airborneAt(world, 0, 0, world.terrain.surfaceAt(0, 0) + 600);
    const me = withWingman(world);
    const move = cruise(world, 40);
    let worst = 0;
    run(world, 40, () => { move(); if (world.time > 20) worst = Math.max(worst, me.pos.distanceTo(formationPoint(world))); });
    expect(worst).toBeLessThan(40);
    const dx = me.pos.x - h.pos.x, dz = me.pos.z - h.pos.z;
    const right = dx * Math.cos(h.yaw) - dz * Math.sin(h.yaw), back = dx * Math.sin(h.yaw) + dz * Math.cos(h.yaw);
    expect(right).toBeCloseTo(FORMATION.right, -1.5);
    expect(back).toBeCloseTo(FORMATION.back, -1.5);
    h.yaw += Math.PI / 2;
    run(world, 30, move);
    expect(me.pos.distanceTo(formationPoint(world))).toBeLessThan(40);
  });

  it('attacks a different target from the lead by default, and the lead\'s on order', () => {
    for (const order of ['formation', 'attackMine'] as const) {
      const { world } = makeWorld();
      const a = arena(world);
      airborneAt(world, a.eye.x, a.eye.z, a.eye.y);
      const me = withWingman(world);
      const [mine, other] = a.spots.slice(0, 2).map(p => world.spawnUnit('truck', p.x, p.z, 0, { passive: true }));
      fcrPick(world, mine.id);
      world.orderWingman(order);
      const hold = world.player.pos.clone();
      run(world, 25, () => { world.player.pos.copy(hold); world.player.vel.set(0, 0, 0); });
      expect(me.alive).toBe(true);
      if (order === 'formation') { expect(other.alive).toBe(false); expect(mine.alive).toBe(true); }
      else { expect(mine.alive).toBe(false); expect(other.alive).toBe(true); }
    }
  });

  it('goes after air defence on SEAD and ignores trucks', () => {
    const { world } = makeWorld();
    const a = arena(world);
    airborneAt(world, a.eye.x, a.eye.z, a.eye.y);
    withWingman(world);
    const truck = world.spawnUnit('truck', a.spots[0].x, a.spots[0].z, 0, { passive: true });
    world.orderWingman('sead');
    const hold = world.player.pos.clone();
    run(world, 5, () => { world.player.pos.copy(hold); world.player.vel.set(0, 0, 0); });
    expect(world.wingman!.targetId).toBe(null);
    const zsu = world.spawnUnit('spaag', a.spots[2].x, a.spots[2].z, 0, { passive: true });
    run(world, 30, () => { world.player.pos.copy(hold); world.player.vel.set(0, 0, 0); });
    expect(zsu.alive).toBe(false);
    expect(truck.alive).toBe(true);
  });

  it('flies home on RTB and stops fighting', () => {
    const { world } = makeWorld();
    airborneAt(world, 0, 0, world.terrain.surfaceAt(0, 0) + 600);
    const home = new Vector3(2500, 0, 1500);
    const me = withWingman(world, home);
    world.orderWingman('rtb');
    run(world, 120, () => { world.player.vel.set(0, 0, 0); });
    expect(Math.hypot(me.pos.x - home.x, me.pos.z - home.z)).toBeLessThan(60);
  });

  it('draws enemy fire when it is the nearer target', () => {
    const { world } = makeWorld();
    airborneAt(world, 0, 0, world.terrain.surfaceAt(0, 0) + 600);
    const me = withWingman(world);
    const away = me.pos.clone().sub(world.player.pos).setY(0).normalize();
    const eye = me.pos.clone().addScaledVector(away, 600);
    expect(wingmanTarget(world, eye, eye.distanceTo(world.player.pos))?.id).toBe(me.id);
    const far = world.player.pos.clone().addScaledVector(away, -600);
    expect(wingmanTarget(world, far, far.distanceTo(world.player.pos))).toBe(null);
  });

  it('obeys orders only once the menu is unlocked', () => {
    const { world } = makeWorld();
    withWingman(world);
    world.wingmanMenu = false;
    expect(world.orderWingman('free')).toBe(false);
    world.wingmanMenu = true;
    expect(world.orderWingman('free')).toBe(true);
    expect(world.wingman!.order).toBe('free');
  });

  it('is spawned by missions that ask for it and fails a protect objective when shot down', () => {
    const src = structuredClone(MISSIONS.m02) as unknown as Record<string, unknown> & { objectives: unknown[]; triggers: { id: string }[] };
    src.wingman = true;
    src.objectives = [...src.objectives, { id: 'keep_hound', kind: 'protect', units: [WINGMAN_ID], minSurvive: 1, untilTrigger: src.triggers[0].id, primary: false, label: 'x' }];
    const m = loadMission(src);
    const s = missionSession(m, null, new Set(['wingmanMenu']));
    s.start();
    const w = s.world;
    const me = w.unit(w.wingman!.unitId)!;
    expect(me.defId).toBe(WINGMAN_TYPE);
    expect(w.wingmanMenu).toBe(true);
    const events: string[] = [];
    w.events.onAny(e => { if (e.t === 'wingman' || e.t === 'missionObjective') events.push(`${e.t}:${'state' in e ? e.state : ''}:${'id' in e ? e.id : ''}`); });
    w.damageUnit(me, 1e9, false);
    for (let i = 0; i < 240; i++) s.step(1 / 120);
    expect(events).toContain('wingman:down:');
    expect(events).toContain('missionObjective:failed:keep_hound');
    expect(missionSession(MISSIONS.m02).world.wingman).toBe(null);
  });
});
