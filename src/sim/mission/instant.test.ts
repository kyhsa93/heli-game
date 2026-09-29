import { describe, expect, it } from 'vitest';
import { missionTerrain } from './runtime';
import { validateMission } from './schema';
import { generateInstant, START_DISTANCE, type ThreatLevel } from './instant';
import { Terrain } from '../terrain';
import { UNIT_DEFS } from '../units';

describe('instant action generator (02 2.2)', () => {
  it('produces valid missions for 100 seeds', () => {
    const levels: ThreatLevel[] = ['low', 'medium', 'high'];
    for (let seed = 1; seed <= 100; seed++) {
      const m = generateInstant({ seed: seed * 7919, threat: levels[seed % 3], time: 'day' });
      const v = validateMission(m, JSON.stringify(m).length);
      expect(v.errors, `seed ${seed}`).toEqual([]);
      expect(m.objectives.length).toBeGreaterThanOrEqual(1);
      expect(m.start.kind).toBe('air');
    }
  }, 120000);

  it('gives the same mission for the same seed and a different one otherwise', () => {
    const a = generateInstant({ seed: 42, threat: 'medium', time: 'day' });
    expect(JSON.stringify(generateInstant({ seed: 42, threat: 'medium', time: 'day' }))).toBe(JSON.stringify(a));
    expect(JSON.stringify(generateInstant({ seed: 43, threat: 'medium', time: 'day' }))).not.toBe(JSON.stringify(a));
  });

  it('starts about 3 km in front of the first target area, on land, with threats scaled by level', () => {
    for (const seed of [5, 11, 23]) {
      const m = generateInstant({ seed, threat: 'high', time: 'day' });
      const tgt = m.waypoints[0].position;
      const d = Math.hypot(m.start.position[0] - tgt[0], m.start.position[1] - tgt[1]);
      expect(d).toBeGreaterThan(START_DISTANCE * 0.6);
      expect(d).toBeLessThan(START_DISTANCE * 1.3);
      const t = new Terrain(m.environment.seed, missionTerrain(m));
      for (const u of m.units) expect(t.heightAt(u.position[0], u.position[1]), u.id).toBeGreaterThan(0.5);
      expect(m.units.some(u => u.type === 'sam_short')).toBe(true);
    }
    const low = generateInstant({ seed: 5, threat: 'low', time: 'day' });
    expect(low.units.some(u => UNIT_DEFS[u.type].category === 'airDefense')).toBe(false);
  });
});
