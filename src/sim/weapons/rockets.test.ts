import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../events';
import { CLEAN_LOADOUT } from '../heli/loadout';
import { updateQ } from '../heli/state';
import { airborneAt, hoverCollective } from '../testing';
import { STEP, World } from '../world';
import { distanceToUnit } from './damage';
import { integrate, PLAYER_OWNER } from './projectile';
import { HYDRA, podMuzzle, rocketProjectile, rocketSolution } from './rockets';

function setup(y = 60) {
  const w = new World({ seed: 11 });
  w.active = true;
  const events: SimEvent[] = [];
  w.events.onAny(e => events.push(e));
  const p = w.pads[0];
  airborneAt(w, p.x, p.z, p.y + y);
  w.player.yaw = 0;
  updateQ(w.player);
  return { w, events };
}

function hover(w: World, seconds: number, each?: (i: number) => void) {
  for (let i = 0; i < seconds * 120; i++) {
    each?.(i);
    w.controls.collective = Math.min(1, Math.max(0, hoverCollective(w) - w.player.vel.y * 0.3));
    w.step(STEP);
  }
}

const rocketFires = (events: SimEvent[]) => events.filter((e): e is Extract<SimEvent, { t: 'fire' }> => e.t === 'fire' && e.weapon === 'hydra70');

describe('Hydra 70 rockets (04-weapons-and-sensors.md 4.2, 4.3)', () => {
  it('cycles the salvo 1 -> 2 -> 4 -> 1 with repeated presses of 2', () => {
    const { w } = setup();
    w.selectWeapon(2);
    expect(w.arms.selected).toBe('hydra70');
    const seen = [w.arms.salvo];
    for (let i = 0; i < 3; i++) { w.selectWeapon(2); seen.push(w.arms.salvo); }
    expect(seen).toEqual([1, 2, 4, 1]);
    w.selectWeapon(1);
    expect(w.arms.selected).toBe('gun30');
  });

  it('cannot select rockets without a pod', () => {
    const { w } = setup();
    w.applyLoadout(CLEAN_LOADOUT);
    w.selectWeapon(2);
    w.nextWeapon();
    expect(w.arms.selected).toBe('gun30');
  });

  for (const salvo of [1, 2, 4] as const) {
    it(`fires exactly ${salvo} rocket(s) per trigger press, 0.1 s apart`, () => {
      const { w, events } = setup();
      w.selectWeapon(2);
      while (w.arms.salvo !== salvo) w.selectWeapon(2);
      const times: number[] = [];
      w.events.on('fire', e => { if (e.weapon === 'hydra70') times.push(w.time); });
      hover(w, 1.5, () => { w.commands.fire = true; });
      expect(rocketFires(events)).toHaveLength(salvo);
      for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeCloseTo(HYDRA.salvoInterval!, 2);
      w.commands.fire = false;
      hover(w, 0.1);
      hover(w, 1, () => { w.commands.fire = true; });
      expect(rocketFires(events)).toHaveLength(salvo * 2);
    });
  }

  it('alternates pods, empties them, and gets lighter', () => {
    const { w, events } = setup();
    w.selectWeapon(2);
    const heavy = w.grossWeight;
    for (let n = 0; n < 45; n++) {
      hover(w, 0.05, () => { w.commands.fire = true; });
      hover(w, 0.05, () => { w.commands.fire = false; });
    }
    const fires = rocketFires(events);
    expect(fires).toHaveLength(38);
    expect(w.loadout.rounds.L2 + w.loadout.rounds.R2).toBe(0);
    expect(w.grossWeight).toBeLessThan(heavy - 38 * 10);
  });

  it('launches from the pod on the side that fired', () => {
    const { w, events } = setup();
    w.selectWeapon(2);
    while (w.arms.salvo !== 2) w.selectWeapon(2);
    hover(w, 0.5, () => { w.commands.fire = true; });
    const [a, b] = rocketFires(events);
    expect(a.pos.distanceTo(podMuzzle(w.player, 'L2'))).toBeLessThan(3);
    expect(b.pos.distanceTo(podMuzzle(w.player, 'R2'))).toBeLessThan(3);
    expect(w.loadout.rounds.L2).toBe(18);
    expect(w.loadout.rounds.R2).toBe(18);
  });

  it('accelerates to about 700 m/s and then slows ballistically', () => {
    const { w } = setup();
    const p = { id: 1, owner: PLAYER_OWNER, ...rocketProjectile(w.player, new Vector3(0, 3000, 0), new Vector3(1, 0, 0)) };
    let peak = 0;
    for (let t = 0; t < 3; t += STEP) { integrate(p, STEP); peak = Math.max(peak, p.vel.length()); }
    expect(peak).toBeGreaterThan(650);
    expect(peak).toBeLessThan(750);
    expect(p.vel.length()).toBeLessThan(peak * 0.6);
  });

  function blast(armed: boolean) {
    const { w } = setup();
    w.clearCombat();
    const ground = new Vector3(w.player.pos.x + 400, 0, w.player.pos.z + 400);
    ground.y = w.terrain.surfaceAt(ground.x, ground.z);
    const r = 3;
    const near = w.spawnUnit('inf', ground.x + 11 + r, ground.z);
    const far = w.spawnUnit('inf', ground.x - 13 - r, ground.z);
    const start = ground.clone().setY(ground.y + 20);
    const proj = rocketProjectile(w.player, start, new Vector3(0, -1, 0));
    w.projectiles.push({ id: 99, owner: PLAYER_OWNER, ...proj, origin: armed ? start.clone().setX(start.x - 1000) : start.clone(), vel: new Vector3(0, -300, 0), burn: 0 });
    for (let i = 0; i < 60 && w.projectiles.length; i++) w.step(STEP);
    return { w, near, far, ground };
  }

  it('splashes 12 m: fragments hit inside, nothing outside', () => {
    const { near, far, ground } = blast(true);
    expect(distanceToUnit(near, ground)).toBeCloseTo(11, 0);
    expect(distanceToUnit(far, ground)).toBeCloseTo(13, 0);
    expect(near.hp).toBeLessThan(near.def.hp);
    expect(far.hp).toBe(far.def.hp);
  });

  it('does not arm inside the 300 m minimum range', () => {
    const { near } = blast(false);
    expect(near.hp).toBe(near.def.hp);
  });

  it('steering solution puts a salvo on a target 2 km away', () => {
    const { w } = setup(120);
    const h = w.player;
    const target = new Vector3(h.pos.x, 0, h.pos.z - 2000);
    target.y = w.terrain.surfaceAt(target.x, target.z);
    const sol = rocketSolution(w, target)!;
    expect(sol).not.toBeNull();
    expect(Math.abs(sol.yaw)).toBeLessThan(0.01);
    h.pitch += sol.pitch;
    updateQ(h);
    const after = rocketSolution(w, target)!;
    expect(Math.abs(after.pitch)).toBeLessThan(0.002);
    w.selectWeapon(2);
    while (w.arms.salvo !== 4) w.selectWeapon(2);
    const pitch = h.pitch;
    const impacts: Vector3[] = [];
    w.events.on('impact', e => { if (e.weapon === 'hydra70') impacts.push(e.pos); });
    for (let i = 0; i < 20 * 120 && impacts.length < 4; i++) {
      w.commands.fire = i < 60;
      h.vel.set(0, 0, 0);
      h.pitch = pitch; h.roll = 0; h.yaw = 0; h.pRate = h.rRate = h.yRate = 0;
      updateQ(h);
      w.step(STEP);
    }
    expect(impacts).toHaveLength(4);
    const mean = impacts.reduce((m, p) => m.add(p), new Vector3()).multiplyScalar(1 / 4);
    expect(Math.hypot(mean.x - target.x, mean.z - target.z)).toBeLessThan(25);
  });
});
