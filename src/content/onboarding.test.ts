import { describe, expect, it } from 'vitest';
import { GEAR_Y } from '../sim/heli/airframe';
import { updateQ } from '../sim/heli/state';
import { missionSession, type MissionRuntime } from '../sim/mission/runtime';
import { STEP } from '../sim/world';
import { MISSIONS } from './missions';

function session(id: string) {
  const s = missionSession(MISSIONS[id]);
  s.start();
  const rt = s.objective as MissionRuntime, w = s.world, h = w.player;
  const events: string[] = [];
  w.events.onAny(e => { if (e.t === 'step' || e.t === 'ring' || e.t === 'advice') events.push(`${e.t}:${'index' in e ? e.index : e.code}`); });
  const run = (sec: number, each?: () => void) => { for (let i = 0; i < sec / STEP; i++) { each?.(); s.step(STEP); } };
  const hold = (x: number, z: number, agl: number) => () => {
    h.landed = false; h.engineOn = true; h.rpm = 1;
    h.pos.set(x, w.terrain.surfaceAt(x, z) - GEAR_Y + agl, z); h.vel.set(0, 0, 0);
    h.pitch = h.roll = h.pRate = h.rRate = h.yRate = 0; updateQ(h); w.controls.collective = 0.6;
  };
  return { s, rt, w, h, events, run, hold };
}

describe('step-by-step onboarding (07 7.9)', () => {
  it('walks T1 through engine, lift-off, hover, transit and landing one step at a time', () => {
    const { s, rt, w, h, events, run, hold } = session('t1');
    const steps = MISSIONS.t1.steps!;
    expect(steps).toHaveLength(5);
    expect(rt.stepIndex).toBe(0);
    run(5);
    expect(rt.stepIndex).toBe(0);
    w.toggleEngine();
    run(40);
    expect(rt.stepIndex).toBe(1);
    expect(rt.stepFlash).toBe(0);
    const [x, z] = [h.pos.x, h.pos.z];
    run(0.3, hold(x + 5, z, 12));
    expect(rt.stepIndex).toBe(2);
    expect(rt.stepFlash).toBeGreaterThan(0);
    run(2, hold(x + 5, z, 12));
    expect(rt.stepIndex).toBe(2);
    run(1.3, hold(x + 5, z, 12));
    expect(rt.stepIndex).toBe(3);
    run(0.5, hold(-297 + 80, 536, 40));
    expect(rt.stepIndex).toBe(4);
    const pad = w.pads.find(p => Math.hypot(p.x + 297, p.z - 536) < 1)!;
    w.controls.collective = 0; h.pos.set(pad.x, pad.y - GEAR_Y, pad.z); h.vel.set(0, 0, 0); h.landed = true; h.touchdownDescent = 0.4;
    w.emit({ t: 'landed', descent: 0.4 });
    run(1.5);
    expect(rt.stepIndex).toBe(5);
    expect(events.filter(e => e.startsWith('step:'))).toEqual(['step:1', 'step:2', 'step:3', 'step:4', 'step:5']);
    run(3);
    expect(s.getSnapshot().mode).toBe('done');
  });

  it('does not skip ahead: being over pad B early still waits on the hover step', () => {
    const { rt, run, hold } = session('t1');
    run(1, hold(-297, 536, 20));
    expect(rt.stepIndex).toBe(2);
  });

  it('counts T2 rings only in order and below 100 ft, and warns when high', () => {
    const { s, rt, events, run, hold } = session('t2');
    const rings = (MISSIONS.t2.objectives[0] as { rings: [number, number][] }).rings;
    expect(rings).toHaveLength(8);
    run(0.2, hold(rings[1][0], rings[1][1], 15));
    expect(rt.rings.filter(r => r.state === 'done')).toHaveLength(0);
    run(0.2, hold(rings[0][0], rings[0][1], 45));
    expect(rt.rings.filter(r => r.state === 'done')).toHaveLength(0);
    expect(events).toContain('advice:tooHigh');
    run(0.2, hold(rings[0][0], rings[0][1], 15));
    expect(rt.rings.filter(r => r.state === 'done')).toHaveLength(1);
    expect(rt.rings.find(r => r.state === 'next')).toMatchObject({ x: rings[1][0], z: rings[1][1] });
    for (let i = 1; i < 8; i++) run(0.2, hold(rings[i][0], rings[i][1], 15));
    expect(events.filter(e => e.startsWith('ring:'))).toHaveLength(8);
    run(2.5, hold(rings[7][0], rings[7][1], 15));
    expect(s.getSnapshot().mode).toBe('done');
  });
});

describe('first-time radio tips in the campaign (07 7.9)', () => {
  function tips(seen: ReadonlySet<string> | null, unlocked: string[] = []) {
    const s = missionSession(MISSIONS.m02, null, new Set(unlocked as never[]), seen);
    const got: string[] = [];
    s.world.events.onAny(e => { if (e.t === 'coach') got.push(e.tip); });
    s.start();
    s.step(STEP);
    return { s, got };
  }

  it('explains a mechanic the first time it shows up, once', () => {
    const { s, got } = tips(new Set(), ['fcr']);
    expect(got).toEqual(['fcr']);
    for (let i = 0; i < 3; i++) s.world.emit({ t: 'radarTrack', id: 1, on: true });
    s.world.emit({ t: 'missileWarning', id: 9, kind: 'ir', from: s.world.player.pos.clone(), owner: 1 });
    s.step(STEP); s.step(STEP);
    expect(got).toEqual(['fcr', 'rwr', 'missile']);
  });

  it('stays quiet for tips already seen and outside the campaign', () => {
    expect(tips(new Set(['fcr']), ['fcr']).got).toEqual([]);
    expect(tips(null, ['fcr']).got).toEqual([]);
  });

  it('points at the FARP when fuel runs low', () => {
    const { s, got } = tips(new Set());
    s.world.player.fuel = 30;
    s.world.emit({ t: 'refuel' });
    s.step(STEP); s.step(STEP);
    expect(got).toContain('farp');
  });
});
