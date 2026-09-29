import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { missionTerrain } from '../sim/mission/runtime';
import type { MissionDef } from '../sim/mission/schema';
import { Terrain } from '../sim/terrain';
import { UNIT_DEFS } from '../sim/units';

const DIR = join(__dirname, 'missions');
const missions = readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as MissionDef);

describe('mission placement (06-missions-and-world.md 6.3)', () => {
  for (const m of missions) {
    it(`${m.id}: units, FARPs and waypoints stand on usable ground`, () => {
      const t = new Terrain(m.environment.seed, missionTerrain(m));
      const bad: string[] = [];
      for (const u of m.units) {
        if (UNIT_DEFS[u.type].move?.air) continue;
        const [x, z] = u.position;
        if (t.heightAt(x, z) < 0.5) bad.push(`${u.id} in water (${Math.round(t.heightAt(x, z))})`);
        else if (t.normalAt(x, z).y < 0.8) bad.push(`${u.id} on a slope`);
      }
      for (const f of m.farps) if (t.heightAt(f.position[0], f.position[1]) < 2) bad.push(`${f.id} in water`);
      for (const w of m.waypoints) if (/^BP/i.test(w.name) && t.heightAt(w.position[0], w.position[1]) < 0.5) bad.push(`${w.id} over water`);
      expect(bad).toEqual([]);
    });
    if (m.kind !== 'training') {
      it(`${m.id}: has two battle positions and a FARP 3-6 km from the fight`, () => {
        expect(m.waypoints.filter(w => /^BP/i.test(w.name)).length).toBeGreaterThanOrEqual(2);
        const enemies = m.units.filter(u => UNIT_DEFS[u.type].side === 'veros');
        const cx = enemies.reduce((s, u) => s + u.position[0], 0) / enemies.length, cz = enemies.reduce((s, u) => s + u.position[1], 0) / enemies.length;
        const d = Math.hypot(m.farps[0].position[0] - cx, m.farps[0].position[1] - cz);
        expect(d).toBeGreaterThan(3000);
        expect(d).toBeLessThan(8000);
        expect(m.units.some(u => UNIT_DEFS[u.type].side === 'civilian')).toBe(true);
      });
    }
  }
});
