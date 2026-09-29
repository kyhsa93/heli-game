import { describe, expect, it } from 'vitest';
import { updateQ } from '../heli/state';
import { lineOfSight, unitCenter } from '../sensors/laser';
import { lookAngles, tadsPosition } from '../sensors/tads';
import { FlightSession } from '../session';
import { hellfireSolution } from '../weapons/hellfire';
import type { World } from '../world';
import { T4_NEED, TrainingT4 } from './t4';

const STEP = 1 / 120;
const SEEDS = [7, 42, 3, 11];

function begin(seed = 7) {
  const t4 = new TrainingT4();
  const s = new FlightSession(seed, t4);
  s.start();
  return { t4, s, w: s.world };
}

function faceAndPoint(w: World, id: number) {
  const h = w.player, u = w.unit(id)!;
  const c = unitCenter(u);
  const yaw = Math.atan2(-(c.x - h.pos.x), -(c.z - h.pos.z));
  h.yaw = yaw; h.yRate = 0; updateQ(h);
  if (w.hold) w.hold.yaw = yaw;
  lookAngles(c.sub(tadsPosition(h)).normalize(), w.tads);
}

describe('training T4 — Hellfire and TADS', () => {
  it('starts airborne with four tanks in sight and eight Hellfires', () => {
    const { w, t4 } = begin();
    expect(t4.tanks.size).toBe(4);
    expect(w.player.landed).toBe(false);
    expect(w.availableWeapons()).toContain('agm114k');
    for (const id of t4.tanks) expect(lineOfSight(w.terrain, tadsPosition(w.player), unitCenter(w.unit(id)!))).toBe(true);
    expect(t4.step).toBe('tads');
  });

  for (const seed of SEEDS) {
    it(`is completed by TADS search, identification and LOBL shots (seed ${seed})`, () => {
      const { w, s, t4 } = begin(seed);
      const steps = new Set<string>([t4.step]);
      w.toggleTads();
      steps.add(t4.step);
      w.selectWeapon(3);
      for (const id of [...t4.tanks]) {
        w.tads.fov = 2;
        for (let i = 0; i < 150; i++) { faceAndPoint(w, id); s.step(STEP); }
        steps.add(t4.step);
        w.commands.laser = true;
        for (let i = 0; i < 5; i++) { faceAndPoint(w, id); s.step(STEP); }
        expect(hellfireSolution(w).status).toBe('lobl');
        w.commands.fire = true; s.step(STEP); w.commands.fire = false;
        for (let i = 0; i < 120 * 20 && w.missiles.length; i++) { faceAndPoint(w, id); s.step(STEP); }
        w.commands.laser = false;
        s.step(STEP);
        expect(w.unit(id)!.alive).toBe(false);
        steps.add(t4.step);
      }
      for (let i = 0; i < 240; i++) s.step(STEP);
      expect(s.getSnapshot().mode).toBe('done');
      expect(s.getSnapshot().result!.destroyed).toBe(T4_NEED);
      expect([...steps]).toEqual(['tads', 'identify', 'lobl', 'loal']);
    });
  }

  it('fails when the laser is released while a missile is guiding', () => {
    const { w, s, t4 } = begin();
    w.toggleTads();
    w.selectWeapon(3);
    const id = [...t4.tanks][0];
    w.commands.laser = true;
    for (let i = 0; i < 10; i++) { faceAndPoint(w, id); s.step(STEP); }
    w.commands.fire = true; s.step(STEP); w.commands.fire = false;
    for (let i = 0; i < 120; i++) { faceAndPoint(w, id); s.step(STEP); }
    w.commands.laser = false;
    for (let i = 0; i < 120 * 4; i++) s.step(STEP);
    expect(s.getSnapshot().mode).toBe('over');
    expect(s.getSnapshot().failure).toBe('laserBreak');
    expect(t4.state).toBe('failed');
  });
});
