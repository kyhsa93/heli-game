import { RoadGraph } from '../ai/movement';
import { visualSight } from '../los';
import { Terrain, type TerrainFeature, type Vec2 } from '../terrain';
import { UNIT_DEFS } from '../units';
import { Vector3 } from 'three';

export type BattleSide = 'coalition' | 'veros';
export type PointOwner = BattleSide | 'neutral';
export type ModeId = 'conquest' | 'quick' | 'breakthrough';
export type PropKind = 'sandbags' | 'crates' | 'barracks' | 'wall';

export interface UnitSpawn { unit: string; side: BattleSide; position: Vec2; yawDeg: number; modes?: ModeId[] }

export interface BattleMapDef {
  id: string;
  title: string;
  environment: { seed: number; times: ('day' | 'dusk' | 'night')[]; fog: 'never' | 'optional' | 'always'; wind: { dirDeg: number; speed: number; gust: number } };
  terrain: { size: number; lift?: number; symmetry?: 'point'; features: TerrainFeature[]; roads: Vec2[][]; outer: { size: number; cell: number; seed: number } };
  combatZone: Vec2[];
  bases: { side: BattleSide; position: Vec2; farp: string; jetSpawn: { position: [number, number, number]; headingDeg: number }; rearmCorridor: { from: Vec2; to: Vec2; width: number } }[];
  farps: { id: string; position: Vec2; point?: string }[];
  points: { id: string; name: string; position: Vec2; radius: number; value: number; asset?: 'farp' | 'radar' | 'artillery'; lz?: Vec2; props: { kind: PropKind; position: Vec2; yawDeg: number }[] }[];
  waypoints: { id: string; name: string; position: Vec2 }[];
  fixed: UnitSpawn[];
  modes: {
    conquest?: { points: string[]; start: Record<string, PointOwner> };
    quick?: { points: string[]; start: Record<string, PointOwner>; combatZone: Vec2[] };
    breakthrough?: { sectors: { points: string[]; attackerBase: Vec2; defenderRoster: string }[] };
  };
}

export const MAP_BYTES = 40 * 1024;
export const BASE_SEPARATION = 9000;
export const BASE_TO_POINT: [number, number] = [3000, 3500];
export const POINT_SPACING: [number, number] = [1200, 1900];
export const BP_RANGE: [number, number] = [1500, 5000];
export const BP_PER_POINT = 2;
export const ROAD_SNAP = 150;
export const FAIRNESS = 0.1;
export const EYE = 2;
export const MAX_SLOPE_DEG = 35;
export const UNIT_BUDGET = 150;
export const ROSTER_UNITS: Record<ModeId, number> = { conquest: 88, quick: 45, breakthrough: 60 };
export const SPAWN_OVERLAP = 16;
export const WRECKS = 30;

const SIDES = new Set(['coalition', 'veros']);
const OWNERS = new Set(['coalition', 'veros', 'neutral']);
const PROPS = new Set(['sandbags', 'crates', 'barracks', 'wall']);
const ASSETS = new Set(['farp', 'radar', 'artillery']);
const TIMES = new Set(['day', 'dusk', 'night']);
const FOG = new Set(['never', 'optional', 'always']);

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const vec2 = (v: unknown): v is Vec2 => Array.isArray(v) && v.length === 2 && v.every(num);

export function validateBattleMap(def: BattleMapDef): string[] {
  const errors: string[] = [];
  const e = (path: string, msg: string) => errors.push(`${path}: ${msg}`);
  const half = def.terrain?.size / 2;
  const inside = (path: string, p: unknown) => {
    if (!vec2(p)) return e(path, 'must be [x, z]');
    if (Math.abs(p[0]) > half || Math.abs(p[1]) > half) e(path, `[${p[0]}, ${p[1]}] outside the map`);
  };
  const unique = (path: string, ids: string[]) => {
    const seen = new Set<string>();
    ids.forEach((id, i) => { if (seen.has(id)) e(`${path}[${i}].id`, `duplicate id ${id}`); seen.add(id); });
  };
  const polygon = (path: string, poly: unknown) => {
    if (!Array.isArray(poly) || poly.length < 3) return e(path, 'polygon needs at least 3 corners');
    poly.forEach((p, i) => inside(`${path}[${i}]`, p));
  };

  if (typeof def.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(def.id)) e('id', `invalid id ${def.id}`);
  if (typeof def.title !== 'string' || !def.title) e('title', 'missing');
  const env = def.environment;
  if (!env) e('environment', 'missing');
  else {
    if (!Number.isInteger(env.seed)) e('environment.seed', 'must be an integer');
    if (!Array.isArray(env.times) || !env.times.length) e('environment.times', 'needs at least one');
    else env.times.forEach((t, i) => { if (!TIMES.has(t)) e(`environment.times[${i}]`, `unknown time ${t}`); });
    if (!FOG.has(env.fog)) e('environment.fog', `unknown fog ${env.fog}`);
    if (!env.wind || !num(env.wind.speed) || env.wind.speed < 0) e('environment.wind', 'needs dirDeg, speed ≥ 0, gust');
  }
  if (!def.terrain || !num(def.terrain.size) || def.terrain.size <= 0) { e('terrain.size', 'must be > 0'); return errors; }
  (def.terrain.roads ?? []).forEach((road, r) => {
    if (!Array.isArray(road) || road.length < 2) e(`terrain.roads[${r}]`, 'needs at least 2 points');
    else road.forEach((p, i) => inside(`terrain.roads[${r}][${i}]`, p));
  });
  (def.terrain.features ?? []).forEach((f, i) => {
    const path = `terrain.features[${i}]`;
    if (f.kind === 'bridge') { inside(`${path}.from`, f.from); inside(`${path}.to`, f.to); }
    else if (f.kind === 'river') { f.path.forEach((p, k) => inside(`${path}.path[${k}]`, p)); if (!(f.width > 0)) e(`${path}.width`, 'must be > 0'); }
    else if (['village', 'base', 'flatten', 'forest'].includes(f.kind)) { inside(`${path}.center`, f.center); if (!(f.radius > 0)) e(`${path}.radius`, 'must be > 0'); }
    else e(`${path}.kind`, `unknown feature ${(f as { kind: string }).kind}`);
  });
  polygon('combatZone', def.combatZone);

  const farpIds = new Set((def.farps ?? []).map(f => f.id));
  const pointIds = new Set((def.points ?? []).map(p => p.id));
  unique('farps', (def.farps ?? []).map(f => f.id));
  unique('points', (def.points ?? []).map(p => p.id));
  unique('waypoints', (def.waypoints ?? []).map(p => p.id));

  const sides = (def.bases ?? []).map(b => b.side);
  if (sides.length !== 2 || !sides.includes('coalition') || !sides.includes('veros')) e('bases', 'needs exactly one coalition and one veros base');
  (def.bases ?? []).forEach((b, i) => {
    if (!SIDES.has(b.side)) e(`bases[${i}].side`, `unknown side ${b.side}`);
    inside(`bases[${i}].position`, b.position);
    if (!farpIds.has(b.farp)) e(`bases[${i}].farp`, `unknown farp ${b.farp}`);
  });
  (def.farps ?? []).forEach((f, i) => {
    inside(`farps[${i}].position`, f.position);
    if (f.point !== undefined && !pointIds.has(f.point)) e(`farps[${i}].point`, `unknown point ${f.point}`);
  });
  (def.points ?? []).forEach((p, i) => {
    const path = `points[${i}]`;
    if (typeof p.name !== 'string' || !p.name) e(`${path}.name`, 'missing');
    inside(`${path}.position`, p.position);
    if (!(p.radius > 0)) e(`${path}.radius`, 'must be > 0');
    if (!(p.value > 0)) e(`${path}.value`, 'must be > 0');
    if (p.asset !== undefined && !ASSETS.has(p.asset)) e(`${path}.asset`, `unknown asset ${p.asset}`);
    if (p.asset === 'farp' && !(def.farps ?? []).some(f => f.point === p.id)) e(`${path}.asset`, 'farp point without a farp');
    if (p.lz !== undefined) inside(`${path}.lz`, p.lz);
    (p.props ?? []).forEach((pr, k) => {
      if (!PROPS.has(pr.kind)) e(`${path}.props[${k}].kind`, `unknown prop ${pr.kind}`);
      inside(`${path}.props[${k}].position`, pr.position);
    });
  });
  (def.waypoints ?? []).forEach((w, i) => inside(`waypoints[${i}].position`, w.position));
  (def.fixed ?? []).forEach((f, i) => {
    if (!UNIT_DEFS[f.unit]) e(`fixed[${i}].unit`, `unknown unit ${f.unit}`);
    else if (UNIT_DEFS[f.unit].side !== f.side) e(`fixed[${i}].side`, `${f.unit} belongs to ${UNIT_DEFS[f.unit].side}`);
    inside(`fixed[${i}].position`, f.position);
  });

  const modes = def.modes ?? {};
  if (!modes.conquest && !modes.quick && !modes.breakthrough) e('modes', 'needs at least one mode');
  for (const id of ['conquest', 'quick'] as const) {
    const m = modes[id];
    if (!m) continue;
    const path = `modes.${id}`;
    if (!Array.isArray(m.points) || !m.points.length) e(`${path}.points`, 'needs at least one point');
    else m.points.forEach((p, i) => { if (!pointIds.has(p)) e(`${path}.points[${i}]`, `unknown point ${p}`); });
    for (const [p, owner] of Object.entries(m.start ?? {})) {
      if (!m.points?.includes(p)) e(`${path}.start.${p}`, 'not a point of this mode');
      if (!OWNERS.has(owner)) e(`${path}.start.${p}`, `unknown owner ${owner}`);
    }
    for (const p of m.points ?? []) if (!(p in (m.start ?? {}))) e(`${path}.start`, `missing owner for ${p}`);
  }
  if (modes.quick) polygon('modes.quick.combatZone', modes.quick.combatZone);
  return errors;
}

export function modePoints(def: BattleMapDef, mode: ModeId) {
  const m = mode === 'breakthrough' ? null : def.modes[mode];
  if (m) return m.points.map(id => def.points.find(p => p.id === id)!);
  return def.modes.breakthrough?.sectors.flatMap(s => s.points.map(id => def.points.find(p => p.id === id)!)) ?? [];
}

export function modeZone(def: BattleMapDef, mode: ModeId) {
  return mode === 'quick' && def.modes.quick ? def.modes.quick.combatZone : def.combatZone;
}

export function insidePolygon(poly: readonly Vec2[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function aaRange(unit: string) {
  return Math.max(0, ...UNIT_DEFS[unit].weapons.filter(w => w.vs !== 'ground').map(w => w.range));
}

export function roadDistance(graph: RoadGraph, a: Vec2, b: Vec2) {
  const na = graph.nearest(a[0], a[1]), nb = graph.nearest(b[0], b[1]);
  if (na < 0 || nb < 0) return Infinity;
  const ga = graph.nodes[na], gb = graph.nodes[nb];
  if (Math.hypot(ga.x - a[0], ga.z - a[1]) > ROAD_SNAP || Math.hypot(gb.x - b[0], gb.z - b[1]) > ROAD_SNAP) return Infinity;
  const path = graph.path(na, nb);
  return path ? graph.pathLength(path) + Math.hypot(ga.x - a[0], ga.z - a[1]) + Math.hypot(gb.x - b[0], gb.z - b[1]) : Infinity;
}

export function sightBlocked(t: Terrain, a: Vec2, b: Vec2) {
  const pa = new Vector3(a[0], t.surfaceAt(a[0], a[1]) + EYE, a[1]);
  const pb = new Vector3(b[0], t.surfaceAt(b[0], b[1]) + EYE, b[1]);
  return !visualSight(t, pa, pb).clear;
}

export function badGround(t: Terrain, p: Vec2) {
  if (t.onBridge(p[0], p[1])) return null;
  if (t.heightAt(p[0], p[1]) < 0.5) return 'water';
  if (t.normalAt(p[0], p[1]).y < Math.cos((MAX_SLOPE_DEG * Math.PI) / 180)) return 'steep';
  return null;
}

export const WADE_SIDE = 40;

export function wadingRoads(t: Terrain) {
  const out: { road: number; at: Vec2 }[] = [];
  t.roads.forEach((road, r) => {
    for (let k = 0; k + 1 < road.length; k++) {
      const [ax, az] = road[k], [bx, bz] = road[k + 1];
      const len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let d = 0; d <= len; d += 25) {
        const x = ax + (bx - ax) * d / len, z = az + (bz - az) * d / len;
        if (t.onBridge(x, z, WADE_SIDE)) continue;
        if (t.heightAt(x + nx * WADE_SIDE, z + nz * WADE_SIDE) < 0.5 && t.heightAt(x - nx * WADE_SIDE, z - nz * WADE_SIDE) < 0.5) { out.push({ road: r, at: [Math.round(x), Math.round(z)] }); return; }
      }
    }
  });
  return out;
}

export interface PrincipleCheck { principle: number; message: string }

export function checkPrinciples(def: BattleMapDef, terrain: Terrain, mode: ModeId, only?: readonly number[]): PrincipleCheck[] {
  const out: PrincipleCheck[] = [];
  const want = (n: number) => !only || only.includes(n);
  const fail = (principle: number, message: string) => out.push({ principle, message });
  const points = modePoints(def, mode);
  const bases = def.bases;
  const fixed = def.fixed.filter(f => !f.modes || f.modes.includes(mode));

  if (want(1) && bases.length === 2 && dist(bases[0].position, bases[1].position) < BASE_SEPARATION) fail(1, `bases ${dist(bases[0].position, bases[1].position).toFixed(0)} m apart`);
  if (want(2)) {
    for (const f of fixed) {
      const r = aaRange(f.unit);
      if (!r) continue;
      for (const p of points) if (dist(f.position, p.position) <= r) fail(2, `${p.id} inside the ${f.side} ${f.unit} at ${dist(f.position, p.position).toFixed(0)} m`);
      for (const b of bases) if (b.side !== f.side && dist(f.position, b.position) <= r) fail(2, `${f.side} ${f.unit} reaches the ${b.side} base`);
    }
  }
  if (want(3)) {
    for (const b of bases) {
      const d = Math.min(...points.map(p => dist(b.position, p.position)));
      if (d < BASE_TO_POINT[0] || d > BASE_TO_POINT[1]) fail(3, `${b.side} base to nearest point ${d.toFixed(0)} m`);
    }
  }
  if (want(4)) {
    for (const p of points) {
      const near = points.filter(q => q !== p && dist(p.position, q.position) <= POINT_SPACING[1]);
      if (!near.length) fail(4, `${p.id} has no neighbour within ${POINT_SPACING[1]} m`);
    }
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j], d = dist(a.position, b.position);
      if (d < POINT_SPACING[0]) fail(4, `${a.id}-${b.id} only ${d.toFixed(0)} m apart`);
      else if (d <= POINT_SPACING[1] && !sightBlocked(terrain, a.position, b.position)) fail(4, `${a.id}-${b.id} see each other`);
    }
  }
  if (want(6)) {
    for (const p of points) {
      const n = def.waypoints.filter(w => { const d = dist(w.position, p.position); return d >= BP_RANGE[0] && d <= BP_RANGE[1] && insidePolygon(modeZone(def, mode), w.position[0], w.position[1]); }).length;
      if (n < BP_PER_POINT) fail(6, `${p.id} has ${n} battle positions`);
    }
  }
  const graph = want(7) || want(9) ? new RoadGraph(terrain.roads) : null;
  if (want(7) && graph) {
    for (const b of bases) for (const p of points) if (!Number.isFinite(roadDistance(graph, b.position, p.position))) fail(7, `no road from the ${b.side} base to ${p.id}`);
  }
  if (want(7)) for (const w of wadingRoads(terrain)) fail(7, `road ${w.road} crosses water at [${w.at[0]}, ${w.at[1]}]`);
  if (want(9) && graph && bases.length === 2) {
    const sums = bases.map(b => points.reduce((s, p) => s + roadDistance(graph, b.position, p.position), 0));
    const gap = Math.abs(sums[0] - sums[1]) / Math.max(sums[0], sums[1]);
    if (!(gap <= FAIRNESS)) fail(9, `road distance sums differ by ${(gap * 100).toFixed(1)}%`);
  }
  if (want(11)) {
    const total = fixed.length + ROSTER_UNITS[mode] + SPAWN_OVERLAP + WRECKS;
    if (total > UNIT_BUDGET) fail(11, `${total} units over the budget of ${UNIT_BUDGET}`);
  }
  if (want(13)) {
    const spots: [string, Vec2][] = [
      ...points.map(p => [p.id, p.position] as [string, Vec2]),
      ...points.flatMap(p => p.props.map((pr, k) => [`${p.id}.props[${k}]`, pr.position] as [string, Vec2])),
      ...def.farps.map(f => [`farp ${f.id}`, f.position] as [string, Vec2]),
      ...def.waypoints.map(w => [`waypoint ${w.id}`, w.position] as [string, Vec2]),
      ...fixed.map(f => [`${f.side} ${f.unit}`, f.position] as [string, Vec2]),
      ...bases.map(b => [`${b.side} base`, b.position] as [string, Vec2]),
    ];
    for (const [name, p] of spots) { const bad = badGround(terrain, p); if (bad) fail(13, `${name} on ${bad} ground`); }
  }
  return out;
}
