import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { hoverCollective } from '../testing';
import { FlightSession } from '../session';
import { aimToward } from '../weapons/arms';
import { predictGunImpact } from '../weapons/ballistics';
import type { World } from '../world';
import { T3_NEED, T3_START_DISTANCE, T3_TARGETS, TrainingT3 } from './t3';

function autoGunner(w: World) {
  const h = w.player;
  const alive = w.units.filter(u => u.alive);
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
  it('starts airborne facing the range with ten soft targets', () => {
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
  });

  it('is completed by an automatic gunner and reports time, kills and accuracy', () => {
    const t3 = new TrainingT3();
    const s = new FlightSession(7, t3);
    s.start();
    for (let i = 0; i < 120 * 180 && s.getSnapshot().mode === 'play'; i++) { autoGunner(s.world); s.step(1 / 120); }
    expect(s.world.player.alive).toBe(true);
    expect(s.getSnapshot().mode).toBe('done');
    const r = s.getSnapshot().result!;
    expect(r.destroyed).toBe(T3_NEED);
    expect(r.targets).toBe(T3_TARGETS.length);
    expect(r.accuracy).toBeGreaterThan(5);
    expect(r.timeSec).toBeGreaterThan(0);
  });

  it('clears old targets when the range restarts', () => {
    const t3 = new TrainingT3();
    const s = new FlightSession(7, t3);
    s.start(); s.start();
    expect(s.world.units).toHaveLength(T3_TARGETS.length);
  });
});
