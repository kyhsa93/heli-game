import { describe, expect, it } from 'vitest';
import harekRaw from '../../content/battle/maps/harek.json?raw';
import type { BattleMapDef } from '../battle/schema';
import { battleTerrainOptions } from '../battle/terrain';
import type { SimEvent } from '../events';
import { STEP, World } from '../world';
import { FALL_SAFE, footStep, groundAt, MAX_SLOPE_DEG, PRONE_DOWN, SPEED, STAMINA, TRUNK_RADIUS, waterDepth } from './movement';
import type { Terrain } from '../terrain';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOLDIER_RADIUS } from './soldier';

const harek = JSON.parse(harekRaw) as BattleMapDef;
const harekWorld = () => new World({ seed: 3, terrain: battleTerrainOptions(harek), terrainSeed: harek.environment.seed });

function onFoot(world: World, x: number, z: number, headingDeg = 0) {
  world.active = true;
  world.clearCombat();
  world.spawnAvatar({ kind: 'soldier', x, z, headingDeg, cls: 'assault' });
  const events: SimEvent[] = [];
  world.events.onAny(e => events.push(e));
  return { s: world.soldier!, c: world.soldierCommands, events };
}

const run = (w: World, seconds: number) => { for (let i = 0; i < Math.round(seconds * 120); i++) w.step(STEP); };
const speed = (w: World) => Math.hypot(w.soldier!.vel.x, w.soldier!.vel.z);

function flatSpot(w: World, clear = 60) {
  const t = w.terrain;
  for (let i = 0; i < 5000; i++) {
    const x = ((i * 7919) % 997) / 997 * t.size * 0.6 - t.size * 0.3, z = ((i * 104729) % 991) / 991 * t.size * 0.6 - t.size * 0.3;
    let ok = t.heightAt(x, z) > 2;
    for (let d = -clear; ok && d <= clear; d += 10) for (const [px, pz] of [[x + d, z], [x, z + d]]) if (t.normalAt(px, pz).y < 0.97 || t.heightAt(px, pz) < 2) ok = false;
    if (ok && !t.treesNear(x, z).length && !t.buildings.some(b => Math.hypot(b.x - x, b.z - z) < clear + 20)) return { x, z };
  }
  throw new Error('no flat spot');
}

describe('soldier movement (wiki 12.3)', () => {
  it('runs 5, sprints 7, aims at 2.8, crouches at 2 and crawls at 0.8 m/s, reaching run speed in 0.25 s', () => {
    const w = new World({ seed: 11 });
    const p = flatSpot(w);
    const { c } = onFoot(w, p.x, p.z);
    c.forward = 1;
    run(w, 0.25);
    expect(speed(w)).toBeCloseTo(SPEED.run, 1);
    run(w, 1);
    expect(speed(w)).toBeCloseTo(5, 5);
    c.sprint = true; run(w, 0.5); expect(speed(w)).toBeCloseTo(7, 5);
    c.sprint = false; c.ads = true; run(w, 0.5); expect(speed(w)).toBeCloseTo(2.8, 5);
    c.ads = false; w.setStance('crouch'); run(w, 0.5); expect(speed(w)).toBeCloseTo(2, 5);
    w.setStance('prone'); run(w, PRONE_DOWN - 0.05); expect(speed(w)).toBeLessThan(0.5);
    run(w, 1); expect(speed(w)).toBeCloseTo(0.8, 5);
  });

  it('sprints for 8 s, then runs until stamina recovers at two thirds the rate', () => {
    const w = new World({ seed: 11 });
    const p = flatSpot(w, 30);
    const { c } = onFoot(w, p.x, p.z);
    c.forward = 1; c.sprint = true;
    run(w, STAMINA - 0.2);
    expect(speed(w)).toBeCloseTo(7, 3);
    run(w, 0.5);
    expect(speed(w)).toBeCloseTo(5, 1);
    c.sprint = false; c.forward = 0;
    run(w, STAMINA * 1.5 - 0.5);
    expect(w.soldierMotion.stamina).toBeLessThan(STAMINA);
    run(w, 1);
    expect(w.soldierMotion.stamina).toBeCloseTo(STAMINA, 5);
  });

  it(`cannot climb slopes steeper than ${MAX_SLOPE_DEG} degrees`, () => {
    const w = new World({ seed: 5 });
    const t = w.terrain;
    let spot: { x: number; z: number; yaw: number } | null = null;
    for (let i = 0; i < 200000 && !spot; i++) {
      const x = ((i * 7919) % 5999) - 3000, z = ((i * 104729) % 5987) - 3000;
      const n = t.normalAt(x, z);
      if (n.y > Math.cos(((MAX_SLOPE_DEG + 3) * Math.PI) / 180) || t.heightAt(x, z) < 5) continue;
      const yaw = Math.atan2(n.x, n.z);
      const bx = x + Math.sin(yaw) * 3, bz = z + Math.cos(yaw) * 3;
      if (t.normalAt(bx, bz).y < 0.83 || t.heightAt(bx, bz) > t.heightAt(x, z)) continue;
      spot = { x: bx, z: bz, yaw };
    }
    expect(spot).not.toBe(null);
    const { s, c } = onFoot(w, spot!.x, spot!.z, (-spot!.yaw * 180) / Math.PI);
    c.yaw = spot!.yaw; c.forward = 1;
    const x0 = s.pos.x, z0 = s.pos.z;
    run(w, 5);
    expect(Math.hypot(s.pos.x - x0, s.pos.z - z0)).toBeLessThan(6);
  });

  it('wades at half speed up to 1.2 m of water and stops at deeper water; walks the bridge deck', () => {
    const w = harekWorld();
    const t = w.terrain;
    let shallow: { x: number; z: number } | null = null, deep: { x: number; z: number } | null = null;
    for (let x = 1500; x < 3500 && (!shallow || !deep); x += 5) for (let z = 1100; z < 1300; z += 0.25) {
      const d = waterDepth(t, x, z);
      if (!shallow && d > 0.2 && d < 1) shallow = { x, z };
      if (!deep && d > 2) deep = { x, z };
    }
    expect(shallow && deep).toBeTruthy();
    const a = onFoot(w, shallow!.x, shallow!.z);
    a.c.forward = 1; a.c.yaw = Math.PI / 2;
    let wet = 0;
    for (let i = 0; i < 120; i++) { w.step(STEP); if (waterDepth(t, a.s.pos.x, a.s.pos.z) > 0) { wet++; expect(speed(w)).toBeLessThanOrEqual(SPEED.run * 0.5 + 1e-6); } }
    expect(wet).toBeGreaterThan(10);
    let edge = { x: deep!.x, z: deep!.z };
    for (let k = 0; k < 400 && waterDepth(t, edge.x, edge.z) > 1.2; k++) edge = { x: edge.x, z: edge.z + 1 };
    const b = onFoot(w, edge.x, edge.z + 0.5, 180);
    b.c.forward = 1; b.c.yaw = 0;
    run(w, 3);
    expect(waterDepth(t, b.s.pos.x, b.s.pos.z)).toBeLessThanOrEqual(1.2 + 0.2);
    const bridge = t.bridges.find(br => br.from[0] > 0)!;
    const d = onFoot(w, bridge.from[0], bridge.from[1] - 20, 180);
    d.c.forward = 1; d.c.yaw = Math.PI;
    let lowest = Infinity;
    for (let i = 0; i < 120 * 8; i++) { w.step(STEP); if (Math.abs(d.s.pos.z - (bridge.from[1] + bridge.to[1]) / 2) < 20) lowest = Math.min(lowest, d.s.pos.y); }
    expect(lowest).toBeGreaterThan(bridge.y);
    expect(d.s.alive).toBe(true);
  });

  it('takes fall damage only past 9 m/s', () => {
    const w = new World({ seed: 11 });
    const p = flatSpot(w, 20);
    const a = onFoot(w, p.x, p.z);
    a.s.pos.y += 3; a.s.onGround = false;
    run(w, 2);
    expect(a.s.hp).toBe(100);
    const b = onFoot(w, p.x, p.z);
    b.s.pos.y += 20; b.s.onGround = false;
    run(w, 3);
    expect(b.s.alive).toBe(false);
    expect(b.events.some(e => e.t === 'crash' && e.reason === 'fall')).toBe(true);
    expect(Math.sqrt(2 * 9.81 * 20)).toBeGreaterThan(FALL_SAFE);
  });

  it('is stopped by trees, houses and parked vehicles, and dies under a moving one', () => {
    const w = harekWorld();
    const t = w.terrain;
    const tree = t.trees.find(tr => t.normalAt(tr.x, tr.z).y > 0.95 && t.treesNear(tr.x, tr.z).filter(o => Math.hypot(o.x - tr.x, o.z - tr.z) < 6).length === 1)!;
    const a = onFoot(w, tree.x, tree.z + 4, 0);
    a.c.forward = 1; a.c.yaw = 0;
    let closest = Infinity;
    for (let i = 0; i < 360; i++) { w.step(STEP); closest = Math.min(closest, Math.hypot(a.s.pos.x - tree.x, a.s.pos.z - tree.z)); }
    expect(closest).toBeGreaterThanOrEqual(TRUNK_RADIUS + SOLDIER_RADIUS - 1e-6);
    const house = t.buildings.find(b => b.kind === 'house')!;
    const h = onFoot(w, house.x, house.z + house.d / 2 + 5, 0);
    h.c.forward = 1; h.c.yaw = 0;
    run(w, 4);
    expect(Math.abs(h.s.pos.z - house.z) >= house.d / 2 + SOLDIER_RADIUS - 1e-6 || Math.abs(h.s.pos.x - house.x) >= house.w / 2 + SOLDIER_RADIUS - 1e-6).toBe(true);
    const p = flatSpot(w, 40);
    const v = onFoot(w, p.x, p.z + 10, 0);
    const truck = w.spawnUnit('c_truck', p.x, p.z);
    v.c.forward = 1; v.c.yaw = 0;
    run(w, 4);
    expect(v.s.alive).toBe(true);
    expect(Math.abs(v.s.pos.z - p.z)).toBeGreaterThan(truck.def.size[2] / 2);
    truck.vel.set(0, 0, 10);
    v.s.pos.set(p.x, groundAt(t, p.x, p.z + 2), p.z + 2);
    run(w, 0.1);
    expect(v.s.alive).toBe(false);
  });

  it('has one rule for a step uphill, and the flow field and the proxy use it (#187)', () => {
    const plane = (deg: number) => ({
      onBridge: () => null,
      heightAt: (x: number) => 10 + x * Math.tan((deg * Math.PI) / 180),
      surfaceAt: (x: number) => 10 + x * Math.tan((deg * Math.PI) / 180),
      normalAt: () => ({ x: 0, y: Math.cos((deg * Math.PI) / 180), z: 0 }),
    }) as unknown as Terrain;
    expect(footStep(plane(MAX_SLOPE_DEG - 1), 0, 0, 1, 0)).toBe(true);
    expect(footStep(plane(MAX_SLOPE_DEG + 1), 0, 0, 1, 0)).toBe(false);
    expect(footStep(plane(MAX_SLOPE_DEG + 1), 1, 0, 0, 0)).toBe(true);
    for (const f of ['../battle/footpath.ts', '../battle/soldierProxy.ts']) {
      const src = readFileSync(join(__dirname, f), 'utf8');
      expect(src, f).toMatch(/climbable\(|footWalk\(|footStep\(/);
      expect(src, `${f} judges slope itself`).not.toMatch(/normalAt|SLOPE|STEEP|Math\.tan/);
    }
  });
});
