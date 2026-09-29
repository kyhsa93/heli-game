import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../events';
import { World } from '../world';
import { armorMultiplier, directDamage, explodeWeapon, hitUnit, splashDamage, WEAPONS } from './damage';

function world() {
  const w = new World({ seed: 7 });
  const events: SimEvent[] = [];
  w.events.onAny(e => events.push(e));
  return { w, events };
}

describe('damage (04-weapons-and-sensors.md 4.2)', () => {
  it('applies the penetration vs armour multipliers', () => {
    expect(armorMultiplier(2, 4)).toBe(0.1);
    expect(armorMultiplier(5, 5)).toBe(1);
    expect(armorMultiplier(5, 3)).toBe(1.2);
  });

  it('makes the 30mm gun nearly useless against a tank but effective against trucks', () => {
    expect(directDamage(WEAPONS.gun30, 4)).toBeCloseTo(1.2);
    expect(directDamage(WEAPONS.gun30, 1)).toBeCloseTo(14.4);
  });

  it('lets a Hellfire hit a bunker at full strength', () => {
    expect(directDamage(WEAPONS.agm114k, 5)).toBe(400);
  });

  it('fades splash linearly to zero at the radius', () => {
    expect(splashDamage(25, 12, 2, 0, 0)).toBeCloseTo(30);
    expect(splashDamage(25, 12, 2, 6, 0)).toBeCloseTo(15);
    expect(splashDamage(25, 12, 2, 12, 0)).toBe(0);
    expect(splashDamage(25, 12, 2, 20, 0)).toBe(0);
  });

  it('kills a tank with one Hellfire but not with a hundred gun hits', () => {
    const { w } = world();
    const a = w.spawnUnit('tank', 0, 0), b = w.spawnUnit('tank', 100, 0);
    hitUnit(w, a, WEAPONS.agm114k, true);
    expect(a.alive).toBe(false);
    for (let i = 0; i < 100; i++) hitUnit(w, b, WEAPONS.gun30, true);
    expect(b.alive).toBe(true);
  });

  it('damages units inside a rocket blast only', () => {
    const { w, events } = world();
    const near = w.spawnUnit('inf', 0, 0), far = w.spawnUnit('inf', 40, 0);
    explodeWeapon(w, new Vector3(0, near.pos.y + 1, 0), WEAPONS.hydra70, true);
    w.step(1 / 120);
    expect(near.hp).toBeLessThan(40);
    expect(far.hp).toBe(40);
    expect(events.some(e => e.t === 'explosion')).toBe(true);
  });

  it('sets off a fuel truck that damages what is next to it, credited to the player', () => {
    const { w, events } = world();
    const fuel = w.spawnUnit('fuel_truck', 0, 0), inf = w.spawnUnit('inf', 6, 0);
    w.damageUnit(fuel, 1000, true);
    w.step(1 / 120);
    expect(inf.alive).toBe(false);
    expect(events.filter(e => e.t === 'unitDestroyed').every(e => (e as { byPlayer: boolean }).byPlayer)).toBe(true);
  });

  it('chains ammo depot explosions within 40 m, depot to depot', () => {
    const { w } = world();
    const a = w.spawnUnit('ammo_depot', 0, 0), b = w.spawnUnit('ammo_depot', 30, 0), c = w.spawnUnit('ammo_depot', 60, 0), d = w.spawnUnit('ammo_depot', 150, 0);
    w.damageUnit(a, 1000, true);
    expect([a.alive, b.alive, c.alive, d.alive]).toEqual([false, false, false, true]);
  });
});
