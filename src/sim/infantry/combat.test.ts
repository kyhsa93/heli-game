import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../events';
import { DIFFICULTIES } from '../difficulty';
import { visualSight } from '../los';
import { ofSide, otherSide, SIDES } from '../testing';
import { STEP, World } from '../world';
import { detectRange } from './awareness';
import { COVER_HIT, volleyAt } from './incoming';
import type { Stance } from './soldier';

const SEEDS = Array.from({ length: 20 }, (_, i) => 31 + i * 13);

function scene(seed: number, enemy: string, dist: number, stance: Stance = 'stand', side: 'coalition' | 'veros' = 'coalition') {
  const world = new World({ seed, terrain: { features: [{ kind: 'flatten', center: [0, 0], radius: 700 }], pads: [{ x: -1500, z: -1500, name: 'H' }] } });
  world.active = true;
  world.playerSide = side;
  world.difficulty = DIFFICULTIES.normal;
  const events: SimEvent[] = [];
  world.events.onAny(e => events.push(e));
  const u = world.spawnUnit(enemy, 0, 0);
  world.spawnAvatar({ kind: 'soldier', x: 0, z: dist, headingDeg: 180, cls: 'assault' });
  world.setStance(stance);
  return { world, events, u };
}

function timeToDie(seed: number, enemy: string, dist: number, stance: Stance = 'stand') {
  const { world, events, u } = scene(seed, enemy, dist, stance);
  let first = -1;
  for (let i = 0; i < 120 * 120; i++) {
    world.soldierLastShot = world.time;
    world.step(STEP);
    if (first < 0 && events.some(e => e.t === 'fire' && e.owner === u.id)) first = world.time;
    if (!world.soldier!.alive) return world.time - first;
  }
  return Infinity;
}

function clearLine(seed: number, dist: number) {
  const { world, u } = scene(seed, 'inf', dist);
  const eye = u.pos.clone().setY(u.pos.y + u.def.size[1] + 2);
  const s = world.soldier!;
  return visualSight(world.terrain, eye, s.pos.clone().setY(s.pos.y + 1.65)).occlusion === 0;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('bots against the player on foot (wiki 5.6, 5.9, 12.5)', () => {
  it.each(SIDES)('5.9-8, 5.9-12: misses a prone player at 200 m and spots one standing and running at 400 m (player %s)', side => {
    const enemy = ofSide('inf', otherSide(side));
    const a = scene(3, enemy, 200, 'prone', side);
    for (let i = 0; i < 120 * 10; i++) a.world.step(STEP);
    expect(a.u.ai.detected).toBe(false);
    let seed = 1;
    while (!clearLine(seed, 400)) seed++;
    const b = scene(seed, enemy, 399, 'stand', side);
    b.world.soldierCommands.right = 1;
    for (let i = 0; i < 120 * 3; i++) b.world.step(STEP);
    expect(b.u.ai.detected).toBe(true);
    const s = b.world.soldier!;
    expect(detectRange(s, false)).toBeGreaterThanOrEqual(400);
  });

  it('knows where a shooter is within 600 m within a second', () => {
    const { world, u } = scene(5, 'inf', 550, 'prone');
    for (let i = 0; i < 120; i++) world.step(STEP);
    expect(u.ai.detected).toBe(false);
    world.soldierCommands.fire = true;
    for (let i = 0; i < 30; i++) world.step(STEP);
    expect(u.ai.detected).toBe(true);
  });

  const table: [string, string, number, Stance, number][] = [
    ['rifle squad vs standing player, 100 m', 'inf', 100, 'stand', 4.3],
    ['rifle squad vs crouching player, 100 m', 'inf', 100, 'crouch', 6.1],
    ['sniper team vs standing player, 400 m', 'sniper', 400, 'stand', 15],
    ['tank machine gun vs standing player, 300 m', 'tank', 300, 'stand', 8],
  ];
  for (const [name, enemy, dist, stance, expected] of table) {
    it(`${name}: 20-seed mean within ±40% of ${expected} s`, () => {
      const times = SEEDS.map(s => timeToDie(s, enemy, dist, stance));
      expect(times.every(Number.isFinite), `${name} ${times}`).toBe(true);
      const m = mean(times);
      expect(m, `${name} mean ${m.toFixed(1)}`).toBeGreaterThan(expected * 0.6);
      expect(m, `${name} mean ${m.toFixed(1)}`).toBeLessThan(expected * 1.4);
    }, 120000);
  }

  it('halves the hit chance behind partial cover and scales with difficulty', () => {
    const { world, u } = scene(3, 'inf', 100);
    const s = world.soldier!;
    const open = volleyAt(u, null, s, 100, false, 1)!;
    const cover = volleyAt(u, null, s, 100, true, 1)!;
    expect(cover.p).toBeCloseTo(open.p * COVER_HIT, 6);
    expect(volleyAt(u, null, s, 100, false, DIFFICULTIES.hard.enemyAccuracy)!.p).toBeGreaterThan(open.p);
    expect(volleyAt(u, null, s, 450, false, 1)).toBe(null);
  });
});
