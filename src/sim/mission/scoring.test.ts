import { describe, expect, it } from 'vitest';
import { STEP } from '../world';
import { FlightSession } from '../session';
import { MissionRuntime, missionTerrain } from './runtime';
import type { MissionDef } from './schema';
import { gradeFor, scoreMission, type ScoreInput } from './scoring';
import { UNIT_DEFS } from '../units';

const base: ScoreInput = {
  success: true, primaryDone: 2, primaryTotal: 4, secondaryDone: 0, kills: {}, shots: {}, hits: {},
  hitsTaken: 1, damagedSystems: 1, landed: false, timeSec: 1000, parTimeSec: 900, friendly: 0, civilian: 0,
};
const pts = (s: ScoreInput, key: string) => scoreMission(s, 1000).lines.find(l => l.key === key)?.points ?? 0;

describe('scoring (02-core-loop-and-campaign.md 2.4)', () => {
  it('splits 1000 over the primary objectives', () => expect(pts(base, 'primary')).toBe(500));
  it('gives 300 per secondary objective', () => expect(pts({ ...base, secondaryDone: 2 }, 'secondary')).toBe(600));
  it('adds each unit score', () => expect(pts({ ...base, kills: { tank: 2, truck: 1 } }, 'kills')).toBe(UNIT_DEFS.tank.score * 2 + UNIT_DEFS.truck.score));
  it('rates Hellfire and rocket efficiency only', () => {
    expect(pts({ ...base, shots: { agm114k: 4, hydra70: 16, gun30: 500 }, hits: { agm114k: 3, hydra70: 7, gun30: 100 } }, 'efficiency')).toBe(150);
    expect(pts({ ...base, shots: { gun30: 100 }, hits: { gun30: 100 } }, 'efficiency')).toBe(0);
  });
  it('rewards a clean return and a landing', () => {
    expect(pts({ ...base, hitsTaken: 0, damagedSystems: 0 }, 'noDamage')).toBe(200);
    expect(pts(base, 'noDamage')).toBe(0);
    expect(pts({ ...base, landed: true }, 'landed')).toBe(200);
    expect(pts(base, 'landed')).toBe(0);
  });
  it('gives 2 per second under par, at most 300', () => {
    expect(pts({ ...base, timeSec: 800 }, 'time')).toBe(200);
    expect(pts({ ...base, timeSec: 100 }, 'time')).toBe(300);
    expect(pts(base, 'time')).toBe(0);
  });
  it('charges fratricide and civilian damage', () => {
    expect(pts({ ...base, friendly: 2 }, 'friendly')).toBe(-2000);
    expect(pts({ ...base, civilian: 3 }, 'civilian')).toBe(-1500);
  });
  it('grades against par and fails with F', () => {
    expect(gradeFor(true, 1000, 1000)).toBe('S');
    expect(gradeFor(true, 800, 1000)).toBe('A');
    expect(gradeFor(true, 600, 1000)).toBe('B');
    expect(gradeFor(true, 100, 1000)).toBe('C');
    expect(gradeFor(false, 5000, 1000)).toBe('F');
    expect(scoreMission({ ...base, success: false }, 1000).grade).toBe('F');
  });
});

describe('fratricide', () => {
  it('fails the mission at the third friendly kill', () => {
    const m: MissionDef = {
      id: 'ff', title: '-', act: 1, kind: 'cas',
      briefing: { summary: '-', situation: [], threats: [], recommendedLoadout: { pylons: { L2: 'empty', L1: 'empty', R1: 'empty', R2: 'empty' }, stingers: false, gunRounds: 300, fuel: 50 } },
      environment: { seed: 7, time: 'day', fog: false, wind: { dirDeg: 0, speed: 2, gust: 0 } },
      terrain: { size: 4000, features: [], roads: [] },
      start: { kind: 'farp_hot', position: [0, 0], headingDeg: 0 },
      farps: [{ id: 'farp_a', position: [0, 0], services: ['fuel'] }],
      waypoints: [],
      units: [0, 1, 2, 3].map(i => ({ id: `c${i}`, type: 'c_truck', position: [300 + i * 20, 300] as [number, number] })),
      groups: [], objectives: [{ id: 'o', kind: 'survive', seconds: 999, primary: true, label: '-' }],
      triggers: [], par: 1000, parTimeSec: 600, wingman: false,
    };
    const rt = new MissionRuntime(m);
    const s = new FlightSession(7, rt, missionTerrain(m));
    s.start();
    for (const u of s.world.units) u.passive = true;
    for (let i = 0; i < 2; i++) s.world.damageUnit(rt.unit(`c${i}`)!, 999, true);
    for (let i = 0; i < 12; i++) s.step(STEP);
    expect(rt.state).toBe('active');
    s.world.damageUnit(rt.unit('c2')!, 999, true);
    for (let i = 0; i < 12; i++) s.step(STEP);
    expect(rt.state).toBe('failed');
    expect(rt.failure).toBe('friendlyFire');
    expect(rt.score?.lines.find(l => l.key === 'friendly')?.points).toBe(-3000);
    for (let i = 0; i < 120 * 3; i++) s.step(STEP);
    expect(s.getSnapshot().mode).toBe('over');
  });
});
