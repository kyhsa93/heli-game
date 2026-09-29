import { describe, expect, it } from 'vitest';
import { MissionRuntime, missionTerrain } from '../mission/runtime';
import type { MissionDef } from '../mission/schema';
import { FlightSession } from '../session';
import { STEP } from '../world';
import { ARRIVE, CONVOY_SPACING, MAX_SLOPE_COS, RoadGraph } from './movement';

describe('road graph and A* (06 6.1)', () => {
  it('merges points within 2 m, including T-junctions', () => {
    const g = new RoadGraph([[[0, 0], [100, 0], [200, 0]], [[100.5, 1], [100, 150]]]);
    expect(g.nodes).toHaveLength(4);
    expect(g.nodes[1].edges.map(e => e.to).sort()).toEqual([0, 2, 3]);
  });

  it('finds the shortest path, not the first one', () => {
    const g = new RoadGraph([
      [[0, 0], [0, 1000], [1000, 1000]],
      [[0, 0], [700, 300], [1000, 1000]],
    ]);
    const p = g.path(g.nearest(0, 0), g.nearest(1000, 1000))!;
    expect(p.map(i => [g.nodes[i].x, g.nodes[i].z])).toEqual([[0, 0], [700, 300], [1000, 1000]]);
    expect(g.pathLength(p)).toBeCloseTo(Math.hypot(700, 300) + Math.hypot(300, 700), 5);
    expect(new RoadGraph([[[0, 0], [10, 0]], [[500, 500], [600, 500]]]).path(0, 2)).toBeNull();
  });

  it('turns route points into a road path', () => {
    const g = new RoadGraph([[[0, 0], [100, 0], [200, 50], [300, 50]]]);
    expect(g.route([[5, 3], [290, 55]])).toEqual([[0, 0], [100, 0], [200, 50], [300, 50]]);
  });
});

const ROAD: [number, number][] = [[-1500, -1400], [-800, -900], [-100, -300], [600, 200], [1300, 700]];

function mission(groups: MissionDef['groups'], units: MissionDef['units'], triggers: MissionDef['triggers'] = []): MissionDef {
  return {
    id: 'mv', title: '이동', act: 1, kind: 'escort',
    briefing: { summary: '-', situation: [], threats: [], recommendedLoadout: { pylons: { L2: 'empty', L1: 'empty', R1: 'empty', R2: 'empty' }, stingers: false, gunRounds: 0, fuel: 50 } },
    environment: { seed: 7, time: 'day', fog: false, wind: { dirDeg: 0, speed: 2, gust: 0 } },
    terrain: { size: 4000, features: [], roads: [ROAD] },
    start: { kind: 'farp_cold', position: [1500, -1500], headingDeg: 0 },
    farps: [{ id: 'farp_a', position: [1500, -1500], services: ['fuel'] }],
    waypoints: [], units, groups,
    objectives: [{ id: 'o', kind: 'survive', seconds: 9999, primary: true, label: '-' }],
    triggers, par: 1, parTimeSec: 1, wingman: false,
  };
}

function run(m: MissionDef) {
  const rt = new MissionRuntime(m);
  const s = new FlightSession(7, rt, missionTerrain(m));
  s.start();
  for (const u of s.world.units) u.passive = true;
  return { s, w: s.world, rt };
}

describe('group movement (05 5.5)', () => {
  it('a convoy drives the road to the end of its route and keeps its spacing', () => {
    const units = [0, 1, 2].map(i => ({ id: `c${i}`, type: 'c_truck', position: [ROAD[0][0] - i * 30, ROAD[0][1] - i * 20] as [number, number], group: 'convoy' }));
    const { s, w, rt } = run(mission([{ id: 'convoy', behavior: 'convoy', route: [ROAD[0], ROAD[4]] }], units));
    let minGap = Infinity;
    for (let i = 0; i < 120 * 260; i++) {
      s.step(STEP);
      if (i % 120 === 0 && i > 120 * 20) {
        const [a, b] = [rt.unit('c0')!, rt.unit('c1')!];
        minGap = Math.min(minGap, a.pos.distanceTo(b.pos));
      }
    }
    for (const id of ['c0', 'c1', 'c2']) {
      const u = rt.unit(id)!;
      expect(Math.hypot(u.pos.x - ROAD[4][0], u.pos.z - ROAD[4][1])).toBeLessThan(ARRIVE + CONVOY_SPACING * 3);
    }
    expect(w.groups.get('convoy')!.members[0].arrived).toBe(true);
    expect(minGap).toBeGreaterThan(CONVOY_SPACING * 0.5);
  });

  it('waits for its start trigger', () => {
    const { s, rt } = run(mission(
      [{ id: 'g', behavior: 'advance', route: [ROAD[0], ROAD[2]], startTrigger: 'go' }],
      [{ id: 'a', type: 'apc', position: ROAD[0], group: 'g' }],
      [{ id: 'go', once: true, when: { kind: 'time', afterSec: 10 }, then: [{ kind: 'radio', from: 'control', text: '출발' }] }],
    ));
    const start = rt.unit('a')!.pos.clone();
    for (let i = 0; i < 120 * 9; i++) s.step(STEP);
    expect(rt.unit('a')!.pos.distanceTo(start)).toBeLessThan(1);
    for (let i = 0; i < 120 * 10; i++) s.step(STEP);
    expect(rt.unit('a')!.pos.distanceTo(start)).toBeGreaterThan(50);
  });

  it('patrols back and forth', () => {
    const { s, rt, w } = run(mission(
      [{ id: 'p', behavior: 'patrol', route: [ROAD[1], ROAD[2]] }],
      [{ id: 't', type: 'technical', position: ROAD[1], group: 'p' }],
    ));
    let farthest = 0, back = false;
    for (let i = 0; i < 120 * 200; i++) {
      s.step(STEP);
      const u = rt.unit('t')!;
      const d = Math.hypot(u.pos.x - ROAD[1][0], u.pos.z - ROAD[1][1]);
      farthest = Math.max(farthest, d);
      if (farthest > 800 && d < 200) back = true;
    }
    expect(back).toBe(true);
    expect(w.groups.get('p')!.members[0].arrived).toBe(false);
  });

  it('keeps off-road units off slopes steeper than 20 degrees', () => {
    const { s, rt, w } = run(mission(
      [{ id: 'x', behavior: 'advance', route: [[-1200, 1200], [1200, 1200]] }],
      [{ id: 'i', type: 'inf', position: [-1200, 1200], group: 'x' }],
    ));
    w.terrain.roads.length = 0;
    let worst = 1;
    for (let i = 0; i < 120 * 120; i++) {
      s.step(STEP);
      const u = rt.unit('i')!;
      if (i % 30 === 0) worst = Math.min(worst, w.terrain.normalAt(u.pos.x, u.pos.z).y);
    }
    expect(worst).toBeGreaterThan(MAX_SLOPE_COS - 0.05);
  });

  it('an advancing unit halts while engaging', () => {
    const { s, rt } = run(mission(
      [{ id: 'g', behavior: 'advance', route: [ROAD[0], ROAD[3]] }],
      [{ id: 'a', type: 'apc', position: ROAD[0], group: 'g' }],
    ));
    for (let i = 0; i < 120 * 5; i++) s.step(STEP);
    const u = rt.unit('a')!;
    u.ai.state = 'engage';
    const p = u.pos.clone();
    for (let i = 0; i < 120 * 3; i++) { u.ai.state = 'engage'; s.step(STEP); }
    expect(u.pos.distanceTo(p)).toBeLessThan(0.5);
  });
});
