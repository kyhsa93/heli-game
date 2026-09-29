import { describe, expect, it } from 'vitest';
import { GEAR_Y } from '../sim/heli/airframe';
import { updateQ } from '../sim/heli/state';
import { missionSession, type MissionRuntime } from '../sim/mission/runtime';
import { STEP } from '../sim/world';
import { MISSIONS } from './missions';

function play(id: string, maxSec = 1500) {
  const m = MISSIONS[id];
  const s = missionSession(m);
  const rt = s.objective as MissionRuntime;
  s.start();
  const w = s.world, h = w.player;
  let hover: { x: number; z: number } | null = m.start.kind === 'air' ? { x: m.start.position[0], z: m.start.position[1] } : null;
  let airborneFor = 0;
  const fly = (x: number, z: number) => {
    h.landed = false; h.engineOn = true; h.rpm = 1;
    h.pos.set(x, w.terrain.surfaceAt(x, z) + 120, z);
    h.vel.set(0, 0, 0); h.pitch = h.roll = 0; updateQ(h);
    hover = { x, z };
  };
  for (let i = 0; i < Math.round(maxSec / STEP) && s.getSnapshot().mode === 'play'; i++) {
    for (const u of w.units) if (u.side === 'veros') u.passive = true;
    if (i % 60 === 0) {
      const active = rt.objectives.filter(o => o.state === 'active');
      const pending = active.filter(o => o.def.kind !== 'land');
      for (const o of active) {
        const d = o.def;
        if (d.kind === 'reach') { const wp = m.waypoints.find(p => p.id === d.waypoint)!; fly(wp.position[0], wp.position[1]); break; }
        if (d.kind === 'destroy') {
          const ids = Array.isArray(d.units) ? d.units : m.units.filter(u => u.group === (d.units as { group: string }).group).map(u => u.id);
          for (const id2 of ids) { const u = rt.unit(id2); if (u?.alive) w.damageUnit(u, 99999, true); }
        }
        if (d.kind === 'identify') for (const id2 of d.units) { const u = rt.unit(id2); if (u) u.identified = true; }
        if (d.kind === 'rings') {
          const next = rt.rings.find(r => r.state === 'next');
          if (next) { hover = null; h.landed = false; h.engineOn = true; h.rpm = 1; h.pos.set(next.x, w.terrain.surfaceAt(next.x, next.z) + 15, next.z); h.vel.set(0, 0, 0); h.pitch = h.roll = 0; updateQ(h); w.controls.collective = 0.6; }
        }
        if (d.kind === 'protect') for (const g of w.groups.values()) if (g.started && g.behavior === 'convoy' && g.path.length) {
          const end = g.path[g.path.length - 1];
          for (const mm of g.members) { const u = w.unit(mm.unit); if (u?.alive && u.side === 'coalition') { u.pos.set(end[0], w.terrain.surfaceAt(end[0], end[1]), end[1]); mm.leg = g.path.length - 1; } }
        }
      }
      const land = active.find(o => o.def.kind === 'land');
      if (land && !pending.length && land.def.kind === 'land') {
        const f = m.farps.find(x => x.id === (land.def as { farp: string }).farp)!;
        if (airborneFor < 3) { if (!hover) fly(f.position[0] + 50, f.position[1]); }
        else {
          const pad = w.pads.find(p => Math.hypot(p.x - f.position[0], p.z - f.position[1]) < 1)!;
          h.pos.set(pad.x, pad.y - GEAR_Y, pad.z); h.vel.set(0, 0, 0); h.pitch = h.roll = 0; updateQ(h);
          h.landed = true; h.touchdownDescent = 0.4; hover = null;
          w.emit({ t: 'landed', descent: 0.4 });
        }
      }
    }
    if (!h.landed) airborneFor += STEP;
    if (hover && !h.landed) { h.pos.x = hover.x; h.pos.z = hover.z; h.vel.set(0, 0, 0); h.pitch = h.roll = 0; h.pRate = h.rRate = h.yRate = 0; updateQ(h); w.controls.collective = 0.6; h.pos.y = w.terrain.surfaceAt(hover.x, hover.z) + 120; }
    s.step(STEP);
  }
  return { s, rt, m };
}

describe('mission playthroughs (scripted pilot)', () => {
  for (const id of ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10', 'm11', 'm12', 't1', 't2', 't3', 't4', 't5']) {
    it(`${id} can be completed`, () => {
      const { s, rt } = play(id);
      expect(s.getSnapshot().mode, rt.objectives.map(o => `${o.def.id}:${o.state}`).join(' ')).toBe('done');
      expect(rt.score?.grade).not.toBe('F');
    }, 60000);
  }

  it('t4 fails when a guided missile loses its laser', () => {
    const s = missionSession(MISSIONS.t4);
    const rt = s.objective as MissionRuntime;
    s.start();
    s.world.emit({ t: 'missileLost', id: 1, owner: 0, reason: 'spotLost' });
    for (let i = 0; i < 120 * 5; i++) s.step(STEP);
    expect(s.getSnapshot().mode).toBe('over');
    expect(rt.failureText).toContain('레이저');
  });

  it('t5 fails on the third hit', () => {
    const s = missionSession(MISSIONS.t5);
    s.start();
    for (let i = 0; i < 3; i++) s.world.emit({ t: 'playerHit', by: 1, weapon: 'hmg', damage: 0.1 });
    for (let i = 0; i < 120 * 5; i++) s.step(STEP);
    expect(s.getSnapshot().mode).toBe('over');
  });
});

describe('campaign unlocks reach the aircraft (#77)', () => {
  it('locks chaff and the FCR until the save unlocks them', () => {
    const locked = missionSession(MISSIONS.m01);
    locked.start();
    expect(locked.world.cm.chaffUnlocked).toBe(false);
    expect(locked.world.fcr.unlocked).toBe(false);
    expect(locked.world.dropChaff()).toBe(false);
    const open = missionSession(MISSIONS.m01, null, new Set(['chaff', 'fcr']));
    open.start();
    expect(open.world.cm.chaffUnlocked).toBe(true);
    expect(open.world.fcr.unlocked).toBe(true);
    open.world.resetPlayer();
    expect(open.world.fcr.unlocked).toBe(true);
    expect(open.world.cm.chaffUnlocked).toBe(true);
  });

  it('gives the survival training its chaff', () => {
    const s = missionSession(MISSIONS.t5);
    s.start();
    expect(s.world.cm.chaffUnlocked).toBe(true);
  });
});
