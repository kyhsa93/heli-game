import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { radarSight } from '../sim/los';
import { missionSession, missionTerrain } from '../sim/mission/runtime';
import { Terrain } from '../sim/terrain';
import { STEP } from '../sim/world';
import { MISSIONS } from './missions';

describe('campaign missions 4-12 (02 2.3)', () => {
  it('sets the hour and weather of the design table', () => {
    const env = (id: string) => [MISSIONS[id].environment.time, MISSIONS[id].environment.fog];
    expect(env('m04')).toEqual(['day', true]);
    expect(env('m07')).toEqual(['dusk', false]);
    expect(env('m08')).toEqual(['night', false]);
    expect(env('m09')).toEqual(['dawn', false]);
    expect(env('m12')).toEqual(['dusk', false]);
  });

  it('hands out the FCR in mission 6 and the Stinger in mission 9, and brings the wingman along from 7', () => {
    expect(MISSIONS.m06.unlocks).toEqual(expect.arrayContaining(['fcr', 'agm114l']));
    expect(MISSIONS.m09.unlocks).toContain('stinger');
    expect(MISSIONS.m09.briefing.recommendedLoadout.stingers).toBe(true);
    expect(['m07', 'm11', 'm12'].every(id => MISSIONS[id].wingman)).toBe(true);
    expect(MISSIONS.m06.briefing.recommendedLoadout.pylons.L1).toBe('agm114l');
  });

  it('keeps the canyon of mission 10 out of SAM sight while the high road is covered', () => {
    const m = MISSIONS.m10, t = new Terrain(m.environment.seed, missionTerrain(m));
    const sams = m.units.filter(u => u.type === 'sam_short').map(u => new Vector3(u.position[0], t.surfaceAt(u.position[0], u.position[1]) + 6, u.position[1]));
    expect(sams).toHaveLength(3);
    for (const id of ['c1', 'c2']) {
      const [x, z] = m.waypoints.find(w => w.id === id)!.position;
      for (const s of sams) expect(radarSight(t, s, new Vector3(x, t.surfaceAt(x, z) + 20, z)), id).toBe(false);
    }
    const [fx, fz] = m.farps[0].position, [hx, hz] = m.waypoints.find(w => w.id === 'hq')!.position;
    const seen = Array.from({ length: 20 }, (_, i) => { const k = (i + 1) / 21, x = fx + (hx - fx) * k, z = fz + (hz - fz) * k; return new Vector3(x, t.surfaceAt(x, z) + 120, z); })
      .filter(p => sams.some(s => s.distanceTo(p) < 10000 && radarSight(t, s, p))).length;
    expect(seen).toBeGreaterThan(8);
  });

  it('parks the mission 9 helicopters on the ground until they die', () => {
    const s = missionSession(MISSIONS.m09);
    s.start();
    for (let i = 0; i < 120; i++) s.step(STEP);
    const w = s.world;
    const parked = w.units.filter(u => u.missionId && /^p\d$/.test(u.missionId));
    expect(parked).toHaveLength(6);
    for (const u of parked) expect(u.pos.y).toBeCloseTo(w.terrain.surfaceAt(u.pos.x, u.pos.z), 3);
  });
});
