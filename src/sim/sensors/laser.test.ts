import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../events';
import { updateQ } from '../heli/state';
import { airborneAt, makeWorld } from '../testing';
import { STEP, type World } from '../world';
import { predictGunImpact } from '../weapons/ballistics';
import { rocketTarget } from '../weapons/rockets';
import { segmentHitsTerrain } from '../weapons/projectile';
import { lineOfSight, unitCenter } from './laser';
import { lookAngles, tadsPosition } from './tads';

function setup(seed = 7) {
  const { world, events } = makeWorld(seed);
  const p = world.pads[0];
  airborneAt(world, p.x, p.z, p.y + 120);
  world.player.yaw = 0;
  updateQ(world.player);
  world.clearCombat();
  world.toggleTads();
  return { world, events: events as SimEvent[] };
}

function pointTads(world: World, target: Vector3) {
  lookAngles(target.clone().sub(tadsPosition(world.player)).normalize(), world.tads);
}

function hold(world: World, seconds: number, each?: () => void) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) { each?.(); world.step(STEP); }
}

function groundAhead(world: World, dist: number) {
  const h = world.player, o = tadsPosition(h);
  for (let k = 0; k < 40; k++) {
    const bearing = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.05;
    const x = h.pos.x - Math.sin(bearing) * dist, z = h.pos.z - Math.cos(bearing) * dist;
    const g = new Vector3(x, world.terrain.surfaceAt(x, z), z);
    if (world.terrain.heightAt(x, z) > 0.5 && lineOfSight(world.terrain, o, g.clone().setY(g.y + 1))) return g;
  }
  throw new Error(`no visible ground at ${dist} m`);
}

function referenceRange(world: World, origin: Vector3, dir: Vector3) {
  const a = new Vector3(), b = origin.clone();
  for (let d = 0.01; d < 10000; d += 0.01) {
    a.copy(b); b.copy(origin).addScaledVector(dir, d);
    if (b.y <= world.terrain.surfaceAt(b.x, b.z)) return d - 0.01 + (segmentHitsTerrain(a, b, world.terrain) ?? 1) * 0.01;
  }
  return null;
}

describe('laser range finder (04-weapons-and-sensors.md 4.4)', () => {
  it('ranges terrain to within 1 m', () => {
    const { world } = setup();
    for (const dist of [300, 900, 2000]) {
      pointTads(world, groundAhead(world, dist).setY(groundAhead(world, dist).y - 0.5));
      world.commands.laser = true;
      world.step(STEP);
      const origin = tadsPosition(world.player), dir = world.sensorDirection();
      const ref = referenceRange(world, origin, dir)!;
      expect(world.laser.range).not.toBeNull();
      expect(Math.abs(world.laser.range! - ref)).toBeLessThan(1);
    }
  });

  it('ranges the unit it hits, not the ground behind it', () => {
    const { world } = setup();
    const g = groundAhead(world, 800);
    const truck = world.spawnUnit('truck', g.x, g.z);
    pointTads(world, unitCenter(truck));
    world.commands.laser = true;
    world.step(STEP);
    expect(world.laser.unitId).toBe(truck.id);
    const origin = tadsPosition(world.player);
    const centre = origin.distanceTo(unitCenter(truck));
    expect(world.laser.range!).toBeLessThan(centre);
    expect(world.laser.range!).toBeGreaterThan(centre - 4);
  });

  it('shows no range when not lasing, but keeps the designation for rockets', () => {
    const { world } = setup();
    const g = groundAhead(world, 1500);
    pointTads(world, g);
    world.commands.laser = true;
    world.step(STEP);
    const lased = world.laser.point!.clone();
    world.commands.laser = false;
    world.tads.az += 0.3;
    world.step(STEP);
    expect(world.laser.range).toBeNull();
    expect(rocketTarget(world)!.laser).toBe(true);
    expect(rocketTarget(world)!.point.distanceTo(lased)).toBeLessThan(0.01);
    hold(world, 31);
    expect(rocketTarget(world)?.laser ?? false).toBe(false);
  });

  it('ends the gun impact prediction at the lased range', () => {
    const { world } = setup();
    world.toggleTads();
    world.commands.aim.pitch = -0.12;
    const plain = predictGunImpact(world)!;
    expect(plain.laser).toBe(false);
    world.laser.on = true;
    world.laser.range = plain.range * 0.6;
    const lased = predictGunImpact(world)!;
    expect(lased.laser).toBe(true);
    expect(lased.range).toBeCloseTo(plain.range * 0.6);
    expect(lased.point.distanceTo(plain.point)).toBeGreaterThan(plain.range * 0.3);
  });
});

describe('target identification', () => {
  function withTarget(defId = 'tank', dist = 1500) {
    const s = setup();
    const g = groundAhead(s.world, dist);
    const u = s.world.spawnUnit(defId, g.x, g.z);
    pointTads(s.world, unitCenter(u));
    return { ...s, u };
  }

  it('identifies after 1 s in the crosshair at 3 degrees or narrower', () => {
    const { world, events, u } = withTarget();
    world.tads.fov = 2;
    hold(world, 0.9);
    expect(u.identified).toBe(false);
    hold(world, 0.2);
    expect(u.identified).toBe(true);
    expect(events.filter(e => e.t === 'identified')).toEqual([{ t: 'identified', id: u.id, defId: 'tank', side: u.side }]);
  });

  it('does not identify through the wide fields of view', () => {
    const { world, u } = withTarget();
    for (const fov of [0, 1]) { world.tads.fov = fov; hold(world, 2); }
    expect(u.identified).toBe(false);
  });

  it('restarts the second when the crosshair leaves the target', () => {
    const { world, u } = withTarget();
    world.tads.fov = 2;
    const az = world.tads.az;
    hold(world, 0.7);
    world.tads.az = az + 0.05;
    hold(world, 0.1);
    world.tads.az = az;
    hold(world, 0.7);
    expect(u.identified).toBe(false);
    hold(world, 0.4);
    expect(u.identified).toBe(true);
  });

  it('needs line of sight', () => {
    const { world } = setup();
    const h = world.player;
    let hidden = null;
    for (let d = 800; d < 7000 && !hidden; d += 50) {
      for (const side of [-2000, -1000, 0, 1000, 2000]) {
        const x = h.pos.x + side, z = h.pos.z - d;
        const g = new Vector3(x, world.terrain.surfaceAt(x, z), z);
        const u = world.spawnUnit('tank', g.x, g.z);
        if (!world.terrain || segmentFree(world, u)) { world.units.pop(); continue; }
        hidden = u; break;
      }
    }
    expect(hidden).not.toBeNull();
    pointTads(world, unitCenter(hidden!));
    world.tads.fov = 2;
    hold(world, 2);
    expect(hidden!.identified).toBe(false);
    void h;
  });

  it('identifies at once in wide view with the auto-identify assist', () => {
    const { world, u } = withTarget('civ_car', 1200);
    world.assists.autoIdentify = true;
    world.tads.fov = 0;
    world.step(STEP);
    expect(u.identified).toBe(true);
  });

  it('never identifies outside TADS mode', () => {
    const { world, u } = withTarget();
    world.assists.autoIdentify = true;
    world.toggleTads();
    hold(world, 2);
    expect(u.identified).toBe(false);
  });
});

function segmentFree(world: World, u: { pos: Vector3; def: { size: number[] } }) {
  const a = tadsPosition(world.player), b = new Vector3(u.pos.x, u.pos.y + u.def.size[1] / 2, u.pos.z);
  const d = b.clone().sub(a), len = d.length();
  d.normalize();
  const p = new Vector3(), q = a.clone();
  for (let s = 20; s < len - 1; s += 20) {
    p.copy(q); q.copy(a).addScaledVector(d, Math.min(s, len - 1));
    if (segmentHitsTerrain(p, q, world.terrain) !== null) return false;
  }
  return true;
}
