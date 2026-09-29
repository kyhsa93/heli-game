import { describe, expect, it } from 'vitest';
import { hitChance, reactionTime } from './ai/brain';
import { visualRate } from './ai/awareness';
import { DIFFICULTIES, type DifficultyLevel } from './difficulty';
import { airborneAt, makeWorld, openPair } from './testing';
import { STEP } from './world';

function scene(level: DifficultyLevel, defId = 'apc') {
  const { world, events } = makeWorld(7);
  world.clearCombat();
  world.difficulty = DIFFICULTIES[level];
  const g = openPair(world, 1500, 100);
  const u = world.spawnUnit(defId, g.unit.x, g.unit.z);
  airborneAt(world, g.player.x, g.player.z, world.terrain.surfaceAt(g.player.x, g.player.z) + 100);
  return { world, events, u };
}

describe('difficulty multipliers (05-enemies-and-ai.md 5.5)', () => {
  it('matches the table', () => {
    expect(DIFFICULTIES.easy).toMatchObject({ enemyAccuracy: 0.5, enemyReaction: 1.5, damageTaken: 0.5, detection: 0.7 });
    expect(DIFFICULTIES.normal).toMatchObject({ enemyAccuracy: 1, enemyReaction: 1, damageTaken: 1, detection: 1 });
    expect(DIFFICULTIES.hard).toMatchObject({ enemyAccuracy: 1.3, enemyReaction: 0.7, damageTaken: 1.3, detection: 1.3 });
  });

  it('scales enemy hit chance', () => {
    const w = scene('normal').u.def.weapons[0];
    const chance = (l: DifficultyLevel) => { const s = scene(l); return hitChance(s.world, w, 800); };
    expect(chance('easy') / chance('normal')).toBeCloseTo(0.5, 5);
    expect(chance('hard') / chance('normal')).toBeCloseTo(1.3, 5);
  });

  it('scales the reaction delay before the first shot', () => {
    const delay = (l: DifficultyLevel) => {
      const { world, u } = scene(l);
      u.ai.awareness = 1; u.ai.detected = true; u.ai.state = 'alert';
      const pos = world.player.pos.clone();
      for (let i = 0; i < 12; i++) { world.player.pos.copy(pos); world.step(STEP); }
      return u.ai.aimTimer + 0.1;
    };
    expect(delay('easy') / delay('normal')).toBeCloseTo(1.5, 1);
    expect(delay('hard') / delay('normal')).toBeCloseTo(0.7, 1);
    expect(reactionTime(scene('normal').u)).toBe(1.5);
  });

  it('scales damage taken', () => {
    const taken = (l: DifficultyLevel) => { const { world } = scene(l); world.damageSystem('hydraulics', 40); return 100 - world.player.damage.hydraulics; };
    expect(taken('easy')).toBeCloseTo(20);
    expect(taken('normal')).toBeCloseTo(40);
    expect(taken('hard')).toBeCloseTo(52);
  });

  it('scales detection speed', () => {
    const rate = (l: DifficultyLevel) => {
      const { world, u } = scene(l);
      const eye = u.pos.clone().setY(u.pos.y + u.def.size[1] + 2);
      return visualRate(world, eye, 0, { night: false, fog: false, playerRadar: false });
    };
    expect(rate('easy') / rate('normal')).toBeCloseTo(0.7, 5);
    expect(rate('hard') / rate('normal')).toBeCloseTo(1.3, 5);
  });

  it('defaults to normal', () => {
    expect(makeWorld().world.difficulty.level).toBe('normal');
  });
});
