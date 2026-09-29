import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMission, MISSION_MAX_BYTES, validateMission, type MissionDef } from './schema';

const DIR = join(__dirname, '../../content/missions');
const files = readdirSync(DIR).filter(f => f.endsWith('.json'));
const read = (f: string) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as MissionDef;
const m01 = () => structuredClone(read('m01.json'));

describe('mission schema (06-missions-and-world.md 6.2)', () => {
  it('has mission files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    it(`${f} loads and validates with no errors`, () => {
      const bytes = statSync(join(DIR, f)).size;
      expect(bytes).toBeLessThanOrEqual(MISSION_MAX_BYTES);
      const v = validateMission(read(f), bytes);
      expect(v.errors).toEqual([]);
      expect(read(f).id).toBe(f.replace('.json', ''));
      expect(() => loadMission(read(f), bytes)).not.toThrow();
    });
  }

  const broken: [string, (m: MissionDef) => void, string][] = [
    ['unknown unit type', m => { m.units[0].type = 'battleship'; }, 'units[0].type'],
    ['missing waypoint', m => { const o = m.objectives[0]; if (o.kind === 'reach') o.waypoint = 'rp9'; }, 'objectives[0].waypoint'],
    ['trigger to missing objective', m => { const c = m.triggers[2].when; if (c.kind === 'objectiveDone') c.objective = 'o99'; }, 'triggers[2].when.objective'],
    ['objectiveAdd missing', m => { const a = m.triggers[3].then[1]; if (a.kind === 'objectiveAdd') a.objective = 'o42'; }, 'triggers[3].then[1].objective'],
    ['unknown group', m => { m.units[0].group = 'ghosts'; }, 'units[0].group'],
    ['spawn outside map', m => { m.units[0].position = [9000, 0]; }, 'units[0].position'],
    ['duplicate id', m => { m.units[1].id = m.units[0].id; }, 'units[1].id'],
    ['unknown field', m => { (m as unknown as Record<string, unknown>).colour = 'red'; }, 'mission.colour'],
    ['bad enum', m => { (m.environment as { time: string }).time = 'noon'; }, 'mission.environment.time'],
    ['bad condition kind', m => { (m.triggers[0].when as { kind: string }).kind = 'whenever'; }, 'mission.triggers[0].when.kind'],
    ['missing farp', m => { const o = m.objectives[4]; if (o.kind === 'land') o.farp = 'farp_z'; }, 'objectives[4].farp'],
    ['detected by missing group', m => { const c = m.triggers[4].when; if (c.kind === 'playerDetected') c.byGroup = 'nobody'; }, 'triggers[4].when.byGroup'],
  ];
  for (const [name, mutate, path] of broken) {
    it(`fails on ${name} and names ${path}`, () => {
      const m = m01();
      mutate(m);
      const v = validateMission(m);
      expect(v.errors.map(e => e.path)).toContain(path);
      expect(() => loadMission(m)).toThrow(path);
    });
  }

  it('rejects files over 40 KB and warns past 150 active units', () => {
    expect(validateMission(m01(), MISSION_MAX_BYTES + 1).errors.some(e => e.message.includes('bytes'))).toBe(true);
    const m = m01();
    for (let i = 0; i < 151; i++) m.units.push({ id: `x${i}`, type: 'inf', position: [0, i] });
    const v = validateMission(m);
    expect(v.errors).toEqual([]);
    expect(v.warnings.some(w => w.path === 'units')).toBe(true);
  });
});
