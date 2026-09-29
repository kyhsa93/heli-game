import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEG } from '../../core/math';
import type { SimEvent } from '../events';
import { G3 } from '../heli/airframe';
import { updateQ } from '../heli/state';
import { airborneAt } from '../testing';
import { STEP, World } from '../world';
import { aimDirection, aimToward, gunInLimits, muzzlePosition } from './arms';
import { WEAPONS } from './damage';
import { integrate, segmentHitsUnit, type Projectile } from './projectile';

function setup() {
  const w = new World({ seed: 7 });
  w.active = true;
  const events: SimEvent[] = [];
  w.events.onAny(e => events.push(e));
  const p = w.pads[0];
  airborneAt(w, p.x, p.z, p.y + 40);
  w.player.yaw = 0;
  updateQ(w.player);
  return { w, events };
}

function hover(w: World, seconds: number, each?: () => void) {
  for (let i = 0; i < seconds * 120; i++) {
    each?.();
    w.controls.collective = Math.min(1, Math.max(0, 1 / 1.7 - w.player.vel.y * 0.3));
    w.step(STEP);
  }
}

describe('30mm gun (04-weapons-and-sensors.md 4.2, 4.3)', () => {
  it('drops within 5% of the drag-corrected formula at 1 km', () => {
    const g = WEAPONS.gun30, k = g.drag!;
    const p: Projectile = { id: 1, weapon: 'gun30', pos: new Vector3(0, 3000, 0), vel: new Vector3(g.speed, 0, 0), owner: 0, life: 10, drag: k, tracer: false };
    let t = 0;
    while (p.pos.x < 1000) { integrate(p, STEP); t += STEP; }
    const tExpected = (Math.exp(k * 1000) - 1) / (k * g.speed);
    const a = k * g.speed;
    const dropExpected = G3 * (tExpected ** 2 / 4 + (a * tExpected - Math.log(1 + a * tExpected)) / (2 * a * a));
    expect(Math.abs(t - tExpected) / tExpected).toBeLessThan(0.05);
    expect(Math.abs((3000 - p.pos.y) - dropExpected) / dropExpected).toBeLessThan(0.05);
  });

  it('fires about ten rounds a second and spends ammunition', () => {
    const { w, events } = setup();
    w.commands.fire = true;
    hover(w, 1);
    const shots = events.filter(e => e.t === 'fire').length;
    expect(shots).toBeGreaterThanOrEqual(10);
    expect(shots).toBeLessThanOrEqual(11);
    expect(w.arms.gunAmmo).toBe(1200 - shots);
    expect(events.filter(e => e.t === 'fire' && (e as { tracer: boolean }).tracer).length).toBe(Math.ceil(shots / 5));
  });

  it('will not fire outside the gimbal limits', () => {
    expect(gunInLimits({ yaw: 80 * DEG, pitch: 0 })).toBe(true);
    expect(gunInLimits({ yaw: 90 * DEG, pitch: 0 })).toBe(false);
    expect(gunInLimits({ yaw: 0, pitch: 15 * DEG })).toBe(false);
    expect(gunInLimits({ yaw: 0, pitch: -65 * DEG })).toBe(false);
    const { w, events } = setup();
    w.commands.fire = true;
    w.commands.aim = { yaw: 100 * DEG, pitch: 0 };
    hover(w, 0.5);
    expect(events.some(e => e.t === 'fire')).toBe(false);
    expect(w.arms.gunAmmo).toBe(1200);
  });

  it('stops when the magazine is empty', () => {
    const { w, events } = setup();
    w.arms.gunAmmo = 3;
    w.commands.fire = true;
    hover(w, 1);
    expect(events.filter(e => e.t === 'fire')).toHaveLength(3);
    expect(w.arms.gunAmmo).toBe(0);
  });

  it('converts a world point into a body-relative aim and back', () => {
    const { w } = setup();
    w.player.yaw = 0.7; w.player.pitch = -0.1; updateQ(w.player);
    const target = muzzlePosition(w.player).add(new Vector3(120, -30, -300));
    const dir = aimDirection(w.player, aimToward(w.player, target));
    const want = target.clone().sub(muzzlePosition(w.player)).normalize();
    expect(dir.distanceTo(want)).toBeLessThan(1e-9);
  });

  it('aims along the head direction relative to the airframe', () => {
    const { w } = setup();
    expect(aimDirection(w.player, { yaw: 0, pitch: 0 }).z).toBeCloseTo(-1);
    const left = aimDirection(w.player, { yaw: 90 * DEG, pitch: 0 });
    expect(left.x).toBeCloseTo(-1);
  });

  it('destroys a truck it is aimed at', () => {
    const { w, events } = setup();
    const m = muzzlePosition(w.player);
    const truck = w.spawnUnit('truck', m.x, m.z - 200);
    const center = truck.pos.clone().setY(truck.pos.y + 1.5);
    w.commands.fire = true;
    hover(w, 1.5, () => { w.commands.aim = aimToward(w.player, center); w.commands.aim.pitch += 0.002; });
    expect(truck.alive).toBe(false);
    expect(events.some(e => e.t === 'impact' && (e as { unit?: number }).unit === truck.id)).toBe(true);
  });

  it('does not let a fast round tunnel through a thin target', () => {
    const w = new World({ seed: 1 });
    const inf = w.spawnUnit('inf', 0, 0);
    const a = new Vector3(-10, inf.pos.y + 1, 0), b = new Vector3(10, inf.pos.y + 1, 0);
    expect(segmentHitsUnit(a, b, inf)).not.toBeNull();
    expect(segmentHitsUnit(new Vector3(-10, inf.pos.y + 5, 0), new Vector3(10, inf.pos.y + 5, 0), inf)).toBeNull();
  });

  it('bursts on the ground when it misses', () => {
    const { w, events } = setup();
    w.commands.aim = { yaw: 0, pitch: -40 * DEG };
    w.commands.fire = true;
    hover(w, 0.3);
    w.commands.fire = false;
    hover(w, 2);
    expect(events.some(e => e.t === 'impact' && (e as { ground: boolean }).ground)).toBe(true);
    expect(w.projectiles).toHaveLength(0);
  });
});
