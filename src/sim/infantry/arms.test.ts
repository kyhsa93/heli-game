import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { SimEvent } from '../events';
import { makeWorld } from '../testing';
import { falloffDamage, WEAPONS } from '../weapons/damage';
import { STEP, type World } from '../world';
import { aimDir, INFANTRY_WEAPONS } from './arms';

function flatSpot(w: World) {
  const t = w.terrain;
  for (let i = 0; i < 5000; i++) {
    const x = ((i * 7919) % 997) - 500, z = ((i * 104729) % 991) - 500;
    let ok = t.heightAt(x, z) > 2;
    for (let d = -40; ok && d <= 40; d += 10) for (const [px, pz] of [[x + d, z], [x, z + d]]) if (t.normalAt(px, pz).y < 0.95 || t.heightAt(px, pz) < 2) ok = false;
    if (ok && !t.treesNear(x, z).length) return { x, z };
  }
  throw new Error('no flat spot');
}

function soldier(seed = 7) {
  const { world, events } = makeWorld(seed);
  world.clearCombat();
  const p = flatSpot(world);
  world.spawnAvatar({ kind: 'soldier', x: p.x, z: p.z, headingDeg: 0, cls: 'assault' });
  return { world, events, p, a: world.soldierArms, c: world.soldierCommands };
}

const run = (w: World, seconds: number) => { for (let i = 0; i < Math.round(seconds * 120); i++) w.step(STEP); };
const shots = (events: SimEvent[]) => events.filter(e => e.t === 'fire' && e.owner === 0).length;

describe('soldier rifle and grenade launcher (wiki 12.4, 12.6)', () => {
  it('fires 10 rounds a second from a 30-round magazine and reloads in 2.2 s', () => {
    const { world, events, a, c } = soldier();
    c.fire = true;
    run(world, 1);
    expect(shots(events)).toBeGreaterThanOrEqual(10);
    expect(shots(events)).toBeLessThanOrEqual(11);
    run(world, 2.5);
    expect(shots(events)).toBe(30);
    expect(a.ammo.rifle!.mag).toBe(0);
    expect(a.reloading).toBeGreaterThan(0);
    c.fire = false;
    run(world, INFANTRY_WEAPONS.rifle.reload);
    expect(a.ammo.rifle).toEqual({ mag: 30, reserve: 120 });
    c.fire = true; run(world, 0.55); c.fire = false;
    const left = a.ammo.rifle!.mag;
    world.reloadSoldier();
    run(world, 2.3);
    expect(a.ammo.rifle).toEqual({ mag: 30, reserve: 120 - (30 - left) });
  });

  it('does not fire while sprinting', () => {
    const { world, events, c } = soldier();
    c.forward = 1; c.sprint = true;
    run(world, 0.5);
    c.fire = true;
    run(world, 1);
    expect(shots(events)).toBe(0);
  });

  it('spreads shots deterministically from the world RNG, tighter when aiming', () => {
    const dirs = (seed: number, ads: boolean) => {
      const { world, events, c } = soldier(seed);
      c.ads = ads; c.fire = true;
      run(world, 0.35);
      return events.flatMap(e => (e.t === 'fire' && e.owner === 0 ? [e.dir.clone()] : []));
    };
    const a = dirs(3, false), b = dirs(3, false), d = dirs(4, false);
    expect(a.length).toBeGreaterThan(2);
    expect(a.map(v => v.toArray())).toEqual(b.map(v => v.toArray()));
    expect(a.map(v => v.toArray())).not.toEqual(d.map(v => v.toArray()));
    const { world } = soldier(3);
    const aim = aimDir(world.soldier!.yaw, world.soldier!.pitch);
    const ads = dirs(3, true);
    const worst = Math.max(...ads.slice(0, 2).map(v => (v.angleTo(aim) * 180) / Math.PI));
    expect(worst).toBeLessThan(0.3 * 1.8 + 1);
  });

  it('kicks the aim up while firing and recovers 70% within 0.3 s of stopping', () => {
    const { world, a, c } = soldier();
    const p0 = world.soldier!.pitch;
    c.fire = true;
    run(world, 0.5);
    const kicked = world.soldier!.pitch - p0;
    expect(kicked).toBeGreaterThan((4 * 0.4 * Math.PI) / 180);
    c.fire = false;
    run(world, 0.3);
    expect(world.soldier!.pitch - p0).toBeLessThanOrEqual(kicked * 0.3 + 1e-6);
    expect(a.bloom).toBeLessThan(1.8);
  });

  it('hurts a squad by a member-scaled amount, weaker past 300 m, and the grenade bursts on impact', () => {
    expect(falloffDamage(WEAPONS.rifle, 10)).toBe(25);
    expect(falloffDamage(WEAPONS.rifle, 400)).toBe(18);
    const { world, p, c } = soldier();
    const squad = world.spawnUnit('inf', p.x, p.z - 30);
    const s = world.soldier!;
    const eye = new Vector3(s.pos.x, s.pos.y + 1.65, s.pos.z);
    const target = squad.pos.clone().setY(squad.pos.y + 1);
    const to = target.sub(eye);
    world.soldierCommands.yaw = Math.atan2(-to.x, -to.z);
    world.soldierCommands.pitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
    c.ads = true;
    run(world, 0.3);
    c.fire = true; run(world, 0.05); c.fire = false;
    run(world, 0.5);
    expect(squad.def.hp - squad.hp).toBeCloseTo(2, 5);
    world.selectSoldierWeapon('grenade');
    run(world, 0.4);
    world.soldierCommands.pitch += 0.05;
    c.fire = true; run(world, 0.1); c.fire = false;
    const hp = squad.hp;
    run(world, 2);
    const g = world.soldierArms.ammo.grenade!;
    expect(g.mag + g.reserve).toBe(5);
    expect(squad.hp).toBeLessThan(hp);
  });
});
