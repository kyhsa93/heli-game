import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../../content/missions';
import { AIRCRAFT } from '../../sim/heli/airframe';
import { CLEAN_LOADOUT, hoverCollective, hoverMargin, loadoutStats, STANDARD_LOADOUT } from '../../sim/heli/loadout';
import { missionSession, type MissionRuntime } from '../../sim/mission/runtime';
import { reportFrom } from '../report';
import { FlightSession } from '../../sim/session';
import { parseHash, toHash } from '../state';
import { storeLocked } from './Loadout';

describe('loadout screen numbers (07-ui-ux.md 7.3)', () => {
  it('grades the hover margin from the hover collective', () => {
    expect(hoverMargin(0.6)).toBe('good');
    expect(hoverMargin(0.7)).toBe('fair');
    expect(hoverMargin(0.85)).toBe('poor');
  });

  it('computes weight, hover collective and endurance from the loadout', () => {
    const light = loadoutStats({ ...CLEAN_LOADOUT, fuel: 50 });
    const heavy = loadoutStats({ ...STANDARD_LOADOUT, stingers: true, fuel: 100 });
    expect(heavy.weight).toBeGreaterThan(light.weight);
    expect(heavy.collective).toBeCloseTo(hoverCollective(heavy.weight), 6);
    expect(['good', 'fair', 'poor']).toContain(heavy.margin);
    expect(light.margin).toBe('good');
    const f = AIRCRAFT.fuel;
    expect(light.enduranceMin).toBeCloseTo(50 / ((f.burnBase + f.burnPerCollective * light.collective) * f.burnScale * f.campaignBurnScale) / 60, 5);
    expect(loadoutStats({ ...STANDARD_LOADOUT, fuel: 100 }).enduranceMin).toBeGreaterThan(15);
    expect(loadoutStats({ ...STANDARD_LOADOUT, fuel: 100 }).enduranceMin).toBeGreaterThan(loadoutStats({ ...STANDARD_LOADOUT, fuel: 50 }).enduranceMin * 1.8);
  });

  it('locks radar Hellfires until unlocked', () => {
    expect(storeLocked('agm114l', new Set())).toBe(true);
    expect(storeLocked('agm114l', new Set(['agm114l']))).toBe(false);
    expect(storeLocked('hydra70', new Set())).toBe(false);
  });
});

describe('mission screen flow (07 7.2)', () => {
  it('routes briefing, loadout and falls back to briefing when refreshed in flight or debrief', () => {
    expect(parseHash('#/briefing/m01')).toEqual({ name: 'briefing', missionId: 'm01' });
    expect(parseHash('#/loadout/m01')).toEqual({ name: 'loadout', missionId: 'm01' });
    expect(parseHash('#/flight/m01')).toEqual({ name: 'briefing', missionId: 'm01' });
    expect(parseHash('#/debrief/m01')).toEqual({ name: 'briefing', missionId: 'm01' });
    expect(parseHash('#/flight/t3')).toEqual({ name: 'flight', missionId: 't3' });
    expect(toHash({ name: 'debrief', missionId: 'm01' })).toBe('#/debrief/m01');
  });

  it('flies the chosen loadout and reports an aborted mission', () => {
    const m = MISSIONS.m01;
    const s = missionSession(m, { ...CLEAN_LOADOUT, gunRounds: 300, fuel: 40 });
    s.start();
    expect(s.world.arms.gunAmmo).toBe(300);
    expect(s.world.player.fuel).toBe(40);
    const rt = s.objective as MissionRuntime;
    s.world.emit({ t: 'fire', weapon: 'gun30', pos: s.world.player.pos.clone(), dir: s.world.player.pos.clone(), owner: 0, tracer: false });
    s.step(1 / 120);
    rt.endNow();
    for (let i = 0; i < 360; i++) s.step(1 / 120);
    const r = reportFrom(rt);
    expect(r.success).toBe(false);
    expect(r.reason).toBe('aborted');
    expect(r.stats.shots.gun30).toBe(1);
    expect(r.objectives.length).toBeGreaterThan(0);
    expect(s.getSnapshot().mode).toBe('over');
  });

  it('burns fuel at the campaign rate in missions and the full rate in training (#75)', () => {
    const m = missionSession(MISSIONS.m01);
    m.start();
    expect(m.world.player.fuelBurnScale).toBeCloseTo(AIRCRAFT.fuel.campaignBurnScale);
    const t = new FlightSession(7);
    t.start();
    t.world.active = true;
    expect(t.world.player.fuelBurnScale).toBe(1);
    const burn = (w: typeof m.world) => { w.player.engineOn = true; w.player.rpm = 1; w.player.landed = false; w.controls.collective = 0.6; w.player.pos.y += 300; const f0 = w.player.fuel; for (let i = 0; i < 120 * 5; i++) w.step(1 / 120); return f0 - w.player.fuel; };
    expect(burn(m.world) / burn(t.world)).toBeLessThan(0.5);
  });
});
