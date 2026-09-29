import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { hoverCollective } from '../testing';
import { FlightSession } from '../session';
import { aimToward } from '../weapons/arms';
import { predictGunImpact } from '../weapons/ballistics';
import { rocketSolution } from '../weapons/rockets';
import { updateQ } from '../heli/state';
import { lineOfSight } from '../sensors/laser';
import type { World } from '../world';
import { T3_NEED, T3_START_DISTANCE, T3_TARGETS, TrainingT3 } from './t3';

function autoGunner(w: World, only?: Set<number>) {
  const h = w.player;
  const alive = w.units.filter(u => u.alive && (!only || only.has(u.id)));
  if (!alive.length) { w.commands.fire = false; return; }
  alive.sort((a, b) => a.pos.distanceToSquared(h.pos) - b.pos.distanceToSquared(h.pos));
  const target = alive[0].pos.clone().add(new Vector3(0, alive[0].def.size[1] * 0.5, 0));
  const aim = aimToward(h, target);
  w.commands.aim = { ...aim };
  for (let k = 0; k < 4; k++) {
    const p = predictGunImpact(w);
    if (!p) break;
    const want = aimToward(h, target), got = aimToward(h, p.point);
    w.commands.aim.pitch += want.pitch - got.pitch;
    w.commands.aim.yaw += want.yaw - got.yaw;
  }
  const dist = Math.hypot(alive[0].pos.x - h.pos.x, alive[0].pos.z - h.pos.z);
  const fwd = new Vector3(-Math.sin(h.yaw), 0, -Math.cos(h.yaw));
  const along = h.vel.x * fwd.x + h.vel.z * fwd.z;
  w.controls.cyclicY = Math.max(-0.4, Math.min(0.4, ((dist > 400 ? 15 : 0) - along) * 0.05));
  const bearing = aimToward(h, alive[0].pos).yaw;
  w.controls.pedal = Math.max(-1, Math.min(1, -bearing * 2));
  w.commands.fire = dist < 650;
  w.controls.collective = Math.min(1, Math.max(0, hoverCollective(w) - h.vel.y * 0.3));
}

describe('training T3 — gunnery range', () => {
  it('starts airborne facing the range with ten soft targets and rocket pods', () => {
    const t3 = new TrainingT3();
    const s = new FlightSession(7, t3);
    s.start();
    const w = s.world, pad = w.pads[t3.rangePad];
    expect(w.units).toHaveLength(T3_TARGETS.length);
    expect(w.player.landed).toBe(false);
    expect(w.player.engineOn).toBe(true);
    expect(Math.hypot(w.player.pos.x - pad.x, w.player.pos.z - pad.z)).toBeCloseTo(T3_START_DISTANCE, 0);
    const toPad = aimToward(w.player, new Vector3(pad.x, pad.y, pad.z));
    expect(Math.abs(toPad.yaw)).toBeLessThan(0.05);
    for (const u of w.units) expect(u.def.armor).toBeLessThanOrEqual(1);
    expect(w.availableWeapons()).toEqual(['gun30', 'hydra70']);
  });

  it('moves from the gun stage to the rocket stage after three gun kills', () => {
    const t3 = new TrainingT3();
    const s = new FlightSession(7, t3);
    s.start();
    expect(t3.step).toBe('gun');
    for (let i = 0; i < 120 * 180 && t3.step === 'gun'; i++) { autoGunner(s.world, t3.gunTargets); s.step(1 / 120); }
    expect(t3.step).toBe('rockets');
    expect(s.world.target).toMatchObject({ name: 'RKT', area: true });
  });

  it('is completed with the gun and then rockets, and reports time, kills and accuracy', () => {
    const t3 = new TrainingT3();
    const s = new FlightSession(7, t3);
    s.start();
    const w = s.world;
    for (let i = 0; i < 120 * 180 && t3.step === 'gun'; i++) { autoGunner(w, t3.gunTargets); s.step(1 / 120); }
    w.commands.fire = false;
    s.step(1 / 120);
    const h = w.player;
    const c = t3.rocketCenter;
    const seen = c.clone().setY(c.y + 1);
    let spot: Vector3 | null = null;
    for (let k = 0; k < 16 && !spot; k++) {
      const a = Math.atan2(h.pos.x - c.x, h.pos.z - c.z) + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.35;
      const p = new Vector3(c.x + Math.sin(a) * 900, 0, c.z + Math.cos(a) * 900);
      p.y = w.terrain.surfaceAt(p.x, p.z) + 80;
      if (Math.abs(p.x) < 1800 && Math.abs(p.z) < 1800 && lineOfSight(w.terrain, p, seen)) spot = p;
    }
    expect(spot).not.toBeNull();
    h.pos.copy(spot!);
    h.vel.set(0, 0, 0);
    w.selectWeapon(2);
    while (w.arms.salvo !== 4) w.selectWeapon(2);
    let yaw = Math.atan2(-(c.x - h.pos.x), -(c.z - h.pos.z)), pitch = 0;
    for (let i = 0; i < 120 * 90 && s.getSnapshot().mode === 'play'; i++) {
      const alive = w.units.filter(u => u.alive && t3.rocketTargets.has(u.id));
      const aimAt = alive.length ? alive[0].pos : c;
      h.yaw = yaw; h.pitch = pitch; h.roll = 0; h.pRate = h.rRate = h.yRate = 0; updateQ(h);
      if (i % 60 === 0) {
        const sol = rocketSolution(w, aimAt.clone());
        if (sol) { yaw += sol.yaw; pitch += sol.pitch; }
      }
      h.vel.set(0, 0, 0);
      w.commands.fire = i % 240 < 2;
      s.step(1 / 120);
    }
    expect(s.world.player.alive).toBe(true);
    expect(s.getSnapshot().mode).toBe('done');
    const r = s.getSnapshot().result!;
    expect(r.destroyed).toBe(T3_NEED);
    expect(r.targets).toBe(T3_TARGETS.length);
    expect(r.accuracy).toBeGreaterThan(1);
    expect(r.timeSec).toBeGreaterThan(0);
  });

  it('clears old targets when the range restarts', () => {
    const t3 = new TrainingT3();
    const s = new FlightSession(7, t3);
    s.start(); s.start();
    expect(s.world.units).toHaveLength(T3_TARGETS.length);
  });
});
