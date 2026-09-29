import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../events';
import { airborneAt, hoverCollective, makeWorld } from '../testing';
import { STEP, type World } from '../world';
import { createDamage, damageWarnings, leakFactor, ROTOR_FAIL_SECONDS, systemAt, SYSTEMS } from './damage';
import { liftPerCollective } from './flight';
import { updateQ } from './state';

function flying(seed = 7) {
  const { world, events } = makeWorld(seed);
  const p = world.pads[0];
  airborneAt(world, p.x, p.z, p.y + 80);
  world.player.yaw = 0; updateQ(world.player);
  return { world, events: events as SimEvent[] };
}

function hover(w: World, seconds: number) {
  for (let i = 0; i < seconds * 120; i++) {
    w.controls.collective = Math.min(1, Math.max(0, hoverCollective(w) - w.player.vel.y * 0.3));
    w.step(STEP);
  }
}

describe('player damage systems (03-helicopter-and-flight.md 3.3)', () => {
  it('maps hit points on the airframe to systems', () => {
    expect(systemAt(new Vector3(-0.9, 0.3, 0))).toBe('engine1');
    expect(systemAt(new Vector3(0.9, 0.3, 0))).toBe('engine2');
    expect(systemAt(new Vector3(0, 1.8, 0))).toBe('rotor');
    expect(systemAt(new Vector3(0, 0.5, 8))).toBe('tail');
    expect(systemAt(new Vector3(0, -0.7, -6.5))).toBe('sensors');
    expect(systemAt(new Vector3(0, 0.2, -3.5))).toBe('cockpit');
    expect(systemAt(new Vector3(0, -0.9, 0))).toBe('fuel');
    expect(systemAt(new Vector3(0, -0.2, 0.5))).toBe('hydraulics');
  });

  it('engines: damaged -15% thrust each, dead -50%, both dead shuts down', () => {
    const { world, events } = flying();
    const full = liftPerCollective(world.player, world);
    world.damageSystem('engine1', 60);
    expect(liftPerCollective(world.player, world) / full).toBeCloseTo(0.85, 5);
    world.damageSystem('engine1', 60);
    expect(liftPerCollective(world.player, world) / full).toBeCloseTo(0.5, 5);
    expect(world.player.engineOn).toBe(true);
    world.damageSystem('engine2', 100);
    world.step(STEP);
    expect(world.player.engineOn).toBe(false);
    expect(events.some(e => e.t === 'engine' && !e.on && e.cause === 'damage')).toBe(true);
    world.toggleEngine();
    expect(world.player.engineOn).toBe(false);
  });

  it('transmission dead: rotor lost 60 s later in the air, not before', () => {
    const { world, events } = flying();
    world.damageSystem('rotor', 100);
    hover(world, ROTOR_FAIL_SECONDS - 1);
    expect(world.player.alive).toBe(true);
    hover(world, 2);
    expect(world.player.alive).toBe(false);
    expect(events.some(e => e.t === 'crash' && e.reason === 'rotorLoss')).toBe(true);
  });

  it('transmission dead on the ground only stops the rotor', () => {
    const { world } = makeWorld();
    world.player.engineOn = true; world.player.rpm = 1;
    world.damageSystem('rotor', 100);
    for (let i = 0; i < (ROTOR_FAIL_SECONDS + 1) * 120; i++) world.step(STEP);
    expect(world.player.alive).toBe(true);
    expect(world.player.engineOn).toBe(false);
    world.toggleEngine();
    expect(world.player.engineOn).toBe(false);
  });

  it('tail rotor dead spins the aircraft in a hover but not at 45 kt', () => {
    const a = flying();
    a.world.damageSystem('tail', 100);
    const yaw0 = a.world.player.yaw;
    hover(a.world, 3);
    expect(Math.abs(a.world.player.yaw - yaw0)).toBeGreaterThan(1);
    const b = flying();
    b.world.damageSystem('tail', 100);
    b.world.player.vel.set(0, 0, -45 * 0.514444);
    b.world.wind.set(0, 0, 0);
    const yb = b.world.player.yaw;
    for (let i = 0; i < 120; i++) { b.world.controls.collective = hoverCollective(b.world); b.world.step(STEP); b.world.player.vel.set(-Math.sin(b.world.player.yaw) * 23, b.world.player.vel.y, -Math.cos(b.world.player.yaw) * 23); }
    expect(Math.abs(b.world.player.yaw - yb)).toBeLessThan(0.3);
  });

  it('hydraulics damage slows the attitude response', () => {
    const settle = (dmg: number) => {
      const { world } = flying();
      world.damageSystem('hydraulics', dmg);
      let t = 0;
      while (world.player.pitch > -0.9 * 0.2 && t < 5) {
        world.controls.cyclicY = 0.2 / (20 * Math.PI / 180) > 1 ? 1 : 0.2 / (20 * Math.PI / 180);
        world.controls.collective = hoverCollective(world);
        world.step(STEP); t += STEP;
      }
      return t;
    };
    const ok = settle(0), weak = settle(60), dead = settle(100);
    expect(weak).toBeGreaterThan(ok);
    expect(dead).toBeGreaterThan(weak);
  });

  it('fuel leaks double and quadruple the burn', () => {
    const d = createDamage();
    expect(leakFactor(d)).toBe(1);
    d.fuel = 40; expect(leakFactor(d)).toBe(2);
    d.fuel = 0; expect(leakFactor(d)).toBe(4);
    const burn = (dmg: number) => {
      const { world } = flying();
      world.damageSystem('fuel', dmg);
      const f0 = world.player.fuel;
      hover(world, 10);
      return f0 - world.player.fuel;
    };
    expect(burn(60) / burn(0)).toBeCloseTo(2, 1);
    expect(burn(100) / burn(0)).toBeCloseTo(4, 1);
  });

  it('a destroyed cockpit kills the crew', () => {
    const { world, events } = flying();
    world.damageSystem('cockpit', 100);
    world.step(STEP);
    expect(world.player.alive).toBe(false);
    expect(events.some(e => e.t === 'crash' && e.reason === 'crewKilled')).toBe(true);
  });

  it('dead sensors drop TADS and the laser', () => {
    const { world } = flying();
    world.toggleTads();
    world.damageSystem('sensors', 100);
    expect(world.tads.active).toBe(false);
    world.toggleTads();
    expect(world.tads.active).toBe(false);
    world.commands.laser = true;
    world.step(STEP);
    expect(world.laser.on).toBe(false);
  });

  it('enemy hits land on one system; a blast spreads by distance', () => {
    const { world, events } = flying();
    const tank = world.spawnUnit('tank', world.player.pos.x + 300, world.player.pos.z);
    world.emit({ t: 'playerHit', by: tank.id, weapon: 'aa_mg', damage: 30 });
    world.step(STEP);
    const hurt = SYSTEMS.filter(s => world.player.damage[s] < 100);
    expect(hurt).toHaveLength(1);
    expect(world.player.damage[hurt[0]]).toBe(70);
    const b = flying();
    const tailWorld = new Vector3(0, 0.6, 9).applyQuaternion(b.world.player.q).add(b.world.player.pos);
    b.world.blastPlayer(tailWorld, 300);
    const d = b.world.player.damage;
    expect(d.tail).toBeLessThan(d.sensors);
    expect(d.tail).toBeLessThan(d.cockpit);
    expect(events.length).toBeGreaterThan(0);
  });

  it('lists EUFD warnings per the table', () => {
    const d = createDamage();
    d.engine1 = 40; d.engine2 = 0; d.rotor = 30; d.tail = 50; d.hydraulics = 0; d.sensors = 0; d.fuel = 10; d.cockpit = 20;
    expect(damageWarnings(d)).toEqual(['ENGINE 1 FIRE', 'ENGINE 2 OUT', 'XMSN CHIP', 'TAIL ROTOR', 'HYD UTIL', 'TADS FAIL', 'FUEL LEAK', 'CANOPY']);
  });
});
