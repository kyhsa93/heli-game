import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../events';
import { GEAR_Y } from '../heli/airframe';
import { FlightSession } from '../session';
import { STEP } from '../world';
import { FAIL_DELAY, MissionRuntime, RADIO_SECONDS } from './runtime';
import { validateMission, type MissionDef } from './schema';

function mission(over: Partial<MissionDef> = {}): MissionDef {
  return {
    id: 'mt', title: '시험', act: 1, kind: 'recon',
    briefing: { summary: '시험', situation: [], threats: [], recommendedLoadout: { pylons: { L2: 'hydra70', L1: 'agm114k', R1: 'agm114k', R2: 'hydra70' }, stingers: false, gunRounds: 600, fuel: 80 } },
    environment: { seed: 7, time: 'day', fog: false, wind: { dirDeg: 0, speed: 3, gust: 1 } },
    terrain: { size: 4000, features: [], roads: [] },
    start: { kind: 'air', position: [0, 0], headingDeg: 0, altitudeAgl: 200 },
    farps: [{ id: 'farp_a', position: [0, 0], services: ['fuel'] }],
    waypoints: [{ id: 'rp1', name: 'RP1', position: [600, 0] }],
    units: [
      { id: 't1', type: 'tank', position: [900, 900], group: 'armor' },
      { id: 't2', type: 'tank', position: [950, 900], group: 'armor' },
      { id: 'c1', type: 'c_truck', position: [-600, 400], group: 'convoy' },
      { id: 'c2', type: 'c_truck', position: [-650, 400], group: 'convoy' },
      { id: 'h1', type: 'inf', position: [300, -300], hidden: true },
    ],
    groups: [{ id: 'armor', behavior: 'hold' }, { id: 'convoy', behavior: 'convoy' }],
    objectives: [{ id: 'o1', kind: 'reach', waypoint: 'rp1', radius: 100, primary: true, label: '지점' }],
    triggers: [],
    par: 1000, parTimeSec: 600, wingman: false,
    ...over,
  };
}

function run(m: MissionDef, seed = 7) {
  expect(validateMission(m).errors).toEqual([]);
  const rt = new MissionRuntime(m);
  const s = new FlightSession(seed, rt);
  const events: SimEvent[] = [];
  s.world.events.onAny(e => events.push(e));
  s.start();
  for (const u of s.world.units) u.passive = true;
  return { rt, s, w: s.world, events };
}

function hold(s: FlightSession, seconds: number, each?: () => void) {
  const pos = s.world.player.pos.clone();
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    each?.();
    if (!s.world.player.landed) { s.world.player.pos.copy(pos); s.world.player.vel.set(0, 0, 0); }
    s.step(STEP);
  }
}

describe('mission runtime (06-missions-and-world.md 6.2)', () => {
  it('spawns visible units, keeps hidden ones back and places the player', () => {
    const { w, rt } = run(mission());
    expect(w.units.map(u => u.missionId).sort()).toEqual(['c1', 'c2', 't1', 't2']);
    expect(rt.unit('h1')).toBeUndefined();
    expect(w.player.landed).toBe(false);
    expect(w.player.pos.y + GEAR_Y - w.terrain.surfaceAt(0, 0)).toBeCloseTo(200, 0);
    expect(w.target?.name).toBe('RP1');
  });

  it('evaluates every condition kind', () => {
    const { rt, w, s } = run(mission());
    expect(rt.condition({ kind: 'time', afterSec: 2 })).toBe(false);
    hold(s, 2.1);
    expect(rt.condition({ kind: 'time', afterSec: 2 })).toBe(true);
    expect(rt.condition({ kind: 'playerInZone', center: [0, 0], radius: 50 })).toBe(true);
    expect(rt.condition({ kind: 'playerInZone', center: [600, 0], radius: 50 })).toBe(false);
    w.damageUnit(rt.unit('t1')!, 9999, true);
    expect(rt.condition({ kind: 'unitDestroyed', units: ['t1', 't2'] })).toBe(false);
    expect(rt.condition({ kind: 'unitDestroyed', units: ['t1', 't2'], count: 1 })).toBe(true);
    expect(rt.condition({ kind: 'objectiveDone', objective: 'o1' })).toBe(false);
    expect(rt.condition({ kind: 'playerDetected' })).toBe(false);
    rt.unit('t2')!.ai.detected = true;
    expect(rt.condition({ kind: 'playerDetected', byGroup: 'armor' })).toBe(true);
    expect(rt.condition({ kind: 'playerDetected', byGroup: 'convoy' })).toBe(false);
    expect(rt.condition({ kind: 'all', of: [{ kind: 'time', afterSec: 1 }, { kind: 'playerDetected', byGroup: 'convoy' }] })).toBe(false);
    expect(rt.condition({ kind: 'any', of: [{ kind: 'time', afterSec: 1 }, { kind: 'playerDetected', byGroup: 'convoy' }] })).toBe(true);
  });

  it('performs every action kind', () => {
    const { rt, w, s, events } = run(mission({
      objectives: [
        { id: 'o1', kind: 'reach', waypoint: 'rp1', radius: 100, primary: true, label: '지점' },
        { id: 'o2', kind: 'survive', seconds: 100, primary: false, label: '버티기' },
      ],
      initialObjectives: ['o1'],
    }));
    rt.act({ kind: 'radio', from: 'control', text: '하나' });
    rt.act({ kind: 'radio', from: 'steel6', text: '둘' });
    rt.act({ kind: 'spawn', units: ['h1'] });
    rt.act({ kind: 'startGroup', group: 'convoy' });
    rt.act({ kind: 'remoteLaser', unit: 't1', seconds: 20 });
    rt.act({ kind: 'smoke', position: [100, 100], color: 'red' });
    expect(rt.objectives[1].state).toBe('pending');
    rt.act({ kind: 'objectiveAdd', objective: 'o2' });
    expect(rt.objectives[1].state).toBe('active');
    const radioAt: number[] = [];
    w.events.on('radio', () => radioAt.push(rt.elapsed));
    hold(s, RADIO_SECONDS * 2 + 0.5);
    expect(events.filter(e => e.t === 'radio').map(e => e.t === 'radio' && e.text)).toEqual(['하나', '둘']);
    expect(radioAt[1] - radioAt[0]).toBeCloseTo(RADIO_SECONDS, 1);
    expect(rt.unit('h1')?.alive).toBe(true);
    expect(rt.startedGroups.has('convoy')).toBe(true);
    expect(w.remoteLasers.some(r => r.unitId === rt.unit('t1')!.id)).toBe(true);
    expect(events.some(e => e.t === 'smoke' && e.color === 'red')).toBe(true);
    rt.act({ kind: 'missionEnd', result: 'fail', reason: '호송대 전멸' });
    hold(s, 3);
    expect(s.getSnapshot().mode).toBe('over');
    expect(s.getSnapshot().failureText).toBe('호송대 전멸');
  });

  it('missionEnd success ends the mission as done', () => {
    const { rt, s } = run(mission());
    rt.act({ kind: 'missionEnd', result: 'success', reason: '완료' });
    hold(s, 2);
    expect(s.getSnapshot().mode).toBe('done');
  });

  it('fires triggers at 1 Hz and only once when once is set', () => {
    const { s, events } = run(mission({
      triggers: [
        { id: 'a', once: true, when: { kind: 'time', afterSec: 1 }, then: [{ kind: 'radio', from: 'control', text: '한 번' }] },
        { id: 'b', once: false, when: { kind: 'time', afterSec: 1 }, then: [{ kind: 'smoke', position: [0, 0], color: 'white' }] },
      ],
    }));
    hold(s, 4.05);
    expect(events.filter(e => e.t === 'radio')).toHaveLength(1);
    expect(events.filter(e => e.t === 'smoke')).toHaveLength(4);
  });

  it('completes objectives of each kind', () => {
    const { rt, w, s } = run(mission({
      objectives: [
        { id: 'r', kind: 'reach', waypoint: 'rp1', radius: 100, primary: false, label: '지점' },
        { id: 'd', kind: 'destroy', units: { group: 'armor' }, count: 2, primary: false, label: '파괴' },
        { id: 'p', kind: 'protect', units: { group: 'convoy' }, minSurvive: 1, untilTrigger: 'safe', primary: false, label: '보호' },
        { id: 's', kind: 'survive', seconds: 3, primary: false, label: '버티기' },
        { id: 'i', kind: 'identify', units: ['t1'], primary: false, label: '식별' },
      ],
      triggers: [{ id: 'safe', once: true, when: { kind: 'time', afterSec: 5 }, then: [{ kind: 'radio', from: 'control', text: '도착' }] }],
    }));
    const st = (id: string) => rt.objectives.find(o => o.def.id === id)!.state;
    hold(s, 3.5);
    expect(st('s')).toBe('done');
    rt.unit('t1')!.identified = true;
    w.damageUnit(rt.unit('t2')!, 9999, true);
    hold(s, 1.1);
    expect(st('i')).toBe('done');
    expect(st('d')).toBe('active');
    w.damageUnit(rt.unit('t1')!, 9999, true);
    hold(s, 1.1);
    expect(st('d')).toBe('done');
    hold(s, 1.5);
    expect(st('p')).toBe('done');
    w.player.pos.x = 600;
    hold(s, 1.1);
    expect(st('r')).toBe('done');
  });

  it('fails a protect objective when too few survive', () => {
    const { rt, w, s } = run(mission({
      objectives: [{ id: 'p', kind: 'protect', units: ['c1', 'c2'], minSurvive: 2, untilTrigger: 'never', primary: false, label: '보호' }],
      triggers: [{ id: 'never', once: true, when: { kind: 'time', afterSec: 9999 }, then: [{ kind: 'radio', from: 'control', text: '-' }] }],
    }));
    w.damageUnit(rt.unit('c1')!, 9999, true);
    hold(s, 1.1);
    expect(rt.objectives[0].state).toBe('failed');
  });

  it('succeeds only after the primaries are done and the player lands at a FARP', () => {
    const { rt, w, s } = run(mission({ start: { kind: 'farp_hot', position: [0, 0], headingDeg: 0 } }));
    w.player.pos.set(600, w.terrain.surfaceAt(600, 0) + 80, 0);
    w.player.landed = false;
    hold(s, 1.2);
    expect(rt.objectives[0].state).toBe('done');
    expect(s.getSnapshot().mode).toBe('play');
    w.player.pos.set(0, w.terrain.surfaceAt(0, 0) - GEAR_Y, 0);
    w.player.landed = true;
    hold(s, 3);
    expect(s.getSnapshot().mode).toBe('done');
  });

  it('fails 10 s after a primary objective fails', () => {
    const { rt, w, s } = run(mission({
      objectives: [{ id: 'p', kind: 'protect', units: ['c1'], minSurvive: 1, untilTrigger: 'never', primary: true, label: '보호' }],
      triggers: [{ id: 'never', once: true, when: { kind: 'time', afterSec: 9999 }, then: [{ kind: 'radio', from: 'control', text: '-' }] }],
    }));
    w.damageUnit(rt.unit('c1')!, 9999, true);
    hold(s, FAIL_DELAY - 1);
    expect(s.getSnapshot().mode).toBe('play');
    hold(s, 4);
    expect(s.getSnapshot().mode).toBe('over');
  });
});
