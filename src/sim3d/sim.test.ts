import { describe, expect, it } from 'vitest';
import { rng } from './math';
import { G3, GEAR_Y, MAX_THRUST, STEP, Sim } from './sim';

function setup(seed = 7) {
  const sim = new Sim({ seed, random: rng(seed) });
  sim.start();
  return sim;
}

function run(sim: Sim, seconds: number, each?: () => void) {
  for (let i = 0; i < seconds * 120; i++) { each?.(); sim.step(STEP); }
}

const hoverCollective = G3 / MAX_THRUST;

function holdClimb(sim: Sim, target: number) {
  return () => {
    const err = target - sim.heli.vel.y;
    sim.controls.collective = Math.min(1, Math.max(0, hoverCollective + err * 0.3));
  };
}

function descend(sim: Sim, hold?: { x: number; z: number }) {
  return () => {
    if (sim.heli.landed) { sim.controls.collective = 0.2; sim.controls.cyclicX = sim.controls.cyclicY = 0; return; }
    if (hold) {
      const h = sim.heli;
      const ax = (hold.x - h.pos.x) * 0.4 - h.vel.x * 1.2, az = (hold.z - h.pos.z) * 0.4 - h.vel.z * 1.2;
      const fx = -Math.sin(h.yaw), fz = -Math.cos(h.yaw), rx = Math.cos(h.yaw), rz = -Math.sin(h.yaw);
      sim.controls.cyclicY = Math.max(-1, Math.min(1, (ax * fx + az * fz) / 4));
      sim.controls.cyclicX = Math.max(-1, Math.min(1, (ax * rx + az * rz) / 4));
    }
    const target = -Math.min(4, Math.max(1, sim.agl() * 0.3));
    const err = target - sim.heli.vel.y;
    sim.controls.collective = Math.min(1, Math.max(0, hoverCollective + err * 0.3));
  };
}

function airborneAt(sim: Sim, x: number, z: number, y: number) {
  const h = sim.heli;
  h.engineOn = true; h.rpm = 1; h.landed = false;
  h.pos.set(x, y, z); h.vel.set(0, 0, 0);
  h.pitch = h.roll = 0; h.pRate = h.rRate = h.yRate = 0;
  sim.updateQ();
}

describe('terrain', () => {
  it('places flat pads above water', () => {
    const sim = setup();
    expect(sim.pads.length).toBeGreaterThanOrEqual(5);
    for (const p of sim.pads) {
      expect(p.y).toBeGreaterThanOrEqual(4);
      for (const [dx, dz] of [[0, 0], [8, 0], [0, -8], [-6, 6]]) {
        expect(Math.abs(sim.terrain.heightAt(p.x + dx, p.z + dz) - p.y)).toBeLessThan(0.05);
      }
    }
  });
});

describe('flight', () => {
  it('needs the engine and rotor rpm before it can lift off', () => {
    const sim = setup();
    sim.controls.collective = 1;
    run(sim, 3);
    expect(sim.heli.landed).toBe(true);
    sim.controls.collective = 0;
    sim.toggleEngine();
    run(sim, 3);
    expect(sim.heli.rpm).toBeGreaterThan(0.5);
    run(sim, 8);
    expect(sim.heli.rpm).toBeGreaterThan(0.97);
    sim.controls.collective = 0.8;
    run(sim, 2);
    expect(sim.heli.landed).toBe(false);
    expect(sim.heli.vel.y).toBeGreaterThan(1);
  });

  it('holds a hover near the hover collective', () => {
    const sim = setup();
    const b = sim.pads[0];
    airborneAt(sim, b.x, b.z, b.y + 60);
    sim.controls.collective = hoverCollective;
    run(sim, 4);
    expect(Math.abs(sim.heli.vel.y)).toBeLessThan(1);
    expect(sim.heli.alive).toBe(true);
  });

  it('pushing the cyclic forward pitches the nose down and accelerates forward', () => {
    const sim = setup();
    const b = sim.pads[0];
    airborneAt(sim, b.x, b.z, b.y + 150);
    sim.heli.yaw = 0; sim.updateQ();
    sim.controls.cyclicY = 1;
    run(sim, 4, holdClimb(sim, 0));
    expect(sim.heli.pitch).toBeLessThan(-0.3);
    expect(sim.heli.vel.z).toBeLessThan(-10);
  });

  it('lands softly on a pad', () => {
    const sim = setup();
    const b = sim.pads[0];
    airborneAt(sim, b.x, b.z, b.y - GEAR_Y + 30);
    run(sim, 30, descend(sim));
    expect(sim.heli.alive).toBe(true);
    expect(sim.heli.landed).toBe(true);
    expect(sim.touchdownDescent).toBeLessThan(2);
  });

  it('crashes on a hard touchdown', () => {
    const sim = setup();
    const b = sim.pads[0];
    airborneAt(sim, b.x, b.z, b.y - GEAR_Y + 20);
    sim.controls.collective = 0;
    run(sim, 5);
    expect(sim.heli.alive).toBe(false);
    expect(sim.crashReason).toMatch(/fpm/);
    run(sim, 3);
    expect(sim.mode).toBe('over');
  });

  it('keeps rotor rpm up in autorotation with the collective down', () => {
    const sim = setup();
    const b = sim.pads[0];
    airborneAt(sim, b.x, b.z, b.y + 600);
    sim.heli.engineOn = false;
    sim.controls.collective = 0.05;
    run(sim, 6);
    expect(sim.heli.rpm).toBeGreaterThan(0.9);
    sim.controls.collective = 0.9;
    run(sim, 6);
    expect(sim.heli.rpm).toBeLessThan(0.9);
  });

  it('crashes into trees', () => {
    const sim = setup();
    const t = sim.terrain.trees.find(tr => tr.h > 10)!;
    airborneAt(sim, t.x + 1, t.z, t.y + t.h - 3);
    run(sim, 0.1, holdClimb(sim, 0));
    expect(sim.heli.alive).toBe(false);
    expect(sim.crashReason).toContain('나무');
  });
});

describe('missions', () => {
  function landOn(sim: Sim, idx: number) {
    const p = sim.pads[idx];
    airborneAt(sim, p.x, p.z, p.y - GEAR_Y + 8);
    run(sim, 25, descend(sim, p));
    expect(sim.heli.landed).toBe(true);
  }

  it('loads cargo at the pickup pad and scores at the destination', () => {
    const sim = setup();
    const { from, to } = sim.mission;
    landOn(sim, from);
    expect(sim.mission.stage).toBe('deliver');
    landOn(sim, to);
    expect(sim.delivered).toBe(1);
    expect(sim.score).toBeGreaterThan(100);
    expect(sim.mission.stage).toBe('pickup');
  });

  it('refuels on the base pad', () => {
    const sim = setup();
    sim.heli.fuel = 20;
    landOn(sim, 0);
    expect(sim.heli.fuel).toBeGreaterThan(60);
  });
});
