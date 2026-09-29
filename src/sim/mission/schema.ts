import { PYLONS, type LoadoutDef, type Store } from '../heli/loadout';
import { WINGMAN_ID } from '../ai/wingman';
import { UNIT_DEFS } from '../units';

export type Vec2 = [number, number];
export type MissionKind = 'recon' | 'escort' | 'cas' | 'sead' | 'interdiction' | 'csar' | 'strike' | 'defense' | 'training' | 'instant';
export type RadioFrom = 'control' | 'steel6' | 'hound2' | 'rescue';
export type UnlockId = 'chaff' | 'fcr' | 'agm114l' | 'night' | 'stinger' | 'wingmanMenu' | 'liveries';

export type TerrainFeature =
  | { kind: 'village'; center: Vec2; radius: number; houses?: number }
  | { kind: 'base'; center: Vec2; radius: number }
  | { kind: 'flatten'; center: Vec2; radius: number }
  | { kind: 'forest'; center: Vec2; radius: number; density?: number }
  | { kind: 'bridge'; from: Vec2; to: Vec2 };

export interface UnitSpawn { id: string; type: string; position: Vec2; headingDeg?: number; group?: string; hidden?: boolean; skill?: number; passive?: boolean; aam?: boolean }
export interface GroupDef { id: string; route?: Vec2[]; loop?: boolean; speedScale?: number; behavior: 'hold' | 'patrol' | 'advance' | 'convoy' | 'defend'; startTrigger?: string }
export type UnitRef = string[] | { group: string };

export type ObjectiveDef =
  | { id: string; kind: 'destroy'; units: UnitRef; count?: number; primary: boolean; label: string }
  | { id: string; kind: 'protect'; units: UnitRef; minSurvive: number; untilTrigger: string; primary: boolean; label: string }
  | { id: string; kind: 'reach'; waypoint: string; radius: number; primary: boolean; label: string }
  | { id: string; kind: 'survive'; seconds: number; primary: boolean; label: string }
  | { id: string; kind: 'land'; farp: string; maxFpm?: number; primary: boolean; label: string }
  | { id: string; kind: 'identify'; units: string[]; primary: boolean; label: string };

export type Condition =
  | { kind: 'time'; afterSec: number }
  | { kind: 'playerInZone'; center: Vec2; radius: number }
  | { kind: 'unitDestroyed'; units: string[]; count?: number }
  | { kind: 'objectiveDone'; objective: string }
  | { kind: 'playerDetected'; byGroup?: string }
  | { kind: 'playerHits'; count: number }
  | { kind: 'laserBroken' }
  | { kind: 'tadsActive' }
  | { kind: 'unitsIdentified'; units: string[]; count?: number }
  | { kind: 'groupArrived'; group: string; count?: number }
  | { kind: 'all'; of: Condition[] }
  | { kind: 'any'; of: Condition[] };

export type Action =
  | { kind: 'radio'; from: RadioFrom; text: string }
  | { kind: 'spawn'; units: string[] }
  | { kind: 'startGroup'; group: string }
  | { kind: 'remoteLaser'; unit: string; seconds: number }
  | { kind: 'smoke'; position: Vec2; color: 'red' | 'green' | 'white' }
  | { kind: 'objectiveAdd'; objective: string }
  | { kind: 'missionEnd'; result: 'success' | 'fail'; reason: string }
  | { kind: 'hint'; text: string };

export interface TriggerDef { id: string; once: boolean; when: Condition; then: Action[] }

export interface MissionDef {
  id: string;
  title: string;
  act: 1 | 2 | 3;
  kind: MissionKind;
  briefing: { summary: string; situation: string[]; threats: string[]; recommendedLoadout: LoadoutDef };
  environment: { seed: number; time: 'day' | 'dusk' | 'night' | 'dawn'; fog: boolean; wind: { dirDeg: number; speed: number; gust: number } };
  terrain: { size: number; features: TerrainFeature[]; roads: Vec2[][] };
  start: { kind: 'farp_cold' | 'farp_hot' | 'air'; position: Vec2; headingDeg: number; altitudeAgl?: number; speedKt?: number };
  farps: { id: string; position: Vec2; services: ('fuel' | 'ammo' | 'repair')[] }[];
  waypoints: { id: string; name: string; position: Vec2 }[];
  units: UnitSpawn[];
  groups: GroupDef[];
  objectives: ObjectiveDef[];
  initialObjectives?: string[];
  triggers: TriggerDef[];
  par: number;
  parTimeSec: number;
  wingman: boolean;
  unlocks?: UnlockId[];
}

export const MISSION_MAX_BYTES = 40 * 1024;
export const MISSION_MAX_UNITS = 150;

export interface Issue { path: string; message: string }
export interface Validation { errors: Issue[]; warnings: Issue[] }

type Check = (v: unknown, path: string, out: Issue[]) => void;

const type = (v: unknown) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
const fail = (out: Issue[], path: string, message: string) => { out.push({ path, message }); };

const str: Check = (v, p, o) => { if (typeof v !== 'string' || !v.length) fail(o, p, `expected non-empty string, got ${type(v)}`); };
const bool: Check = (v, p, o) => { if (typeof v !== 'boolean') fail(o, p, `expected boolean, got ${type(v)}`); };
const num = (min = -Infinity, max = Infinity): Check => (v, p, o) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(o, p, `expected number, got ${type(v)}`);
  else if (v < min || v > max) fail(o, p, `${v} outside ${min}..${max}`);
};
const oneOf = (...vals: readonly unknown[]): Check => (v, p, o) => { if (!vals.includes(v)) fail(o, p, `expected one of ${vals.join('|')}, got ${JSON.stringify(v)}`); };
const vec2: Check = (v, p, o) => {
  if (!Array.isArray(v) || v.length !== 2 || v.some(n => typeof n !== 'number' || !Number.isFinite(n))) fail(o, p, 'expected [x, z]');
};
const arr = (item: Check, min = 0): Check => (v, p, o) => {
  if (!Array.isArray(v)) { fail(o, p, `expected array, got ${type(v)}`); return; }
  if (v.length < min) fail(o, p, `expected at least ${min} item(s)`);
  v.forEach((x, i) => item(x, `${p}[${i}]`, o));
};
const opt = (c: Check): Check & { optional: true } => Object.assign(((v: unknown, p: string, o: Issue[]) => { if (v !== undefined) c(v, p, o); }) as Check, { optional: true as const });
const obj = (shape: Record<string, Check>): Check => (v, p, o) => {
  if (type(v) !== 'object') { fail(o, p, `expected object, got ${type(v)}`); return; }
  const rec = v as Record<string, unknown>;
  for (const [k, c] of Object.entries(shape)) {
    if (rec[k] === undefined && !(c as { optional?: boolean }).optional) fail(o, `${p}.${k}`, 'missing');
    else c(rec[k], `${p}.${k}`, o);
  }
  for (const k of Object.keys(rec)) if (!(k in shape)) fail(o, `${p}.${k}`, 'unknown field');
};
const tagged = (variants: Record<string, Record<string, Check>>): Check => (v, p, o) => {
  if (type(v) !== 'object') { fail(o, p, `expected object, got ${type(v)}`); return; }
  const kind = (v as { kind?: unknown }).kind;
  const shape = typeof kind === 'string' ? variants[kind] : undefined;
  if (!shape) { fail(o, `${p}.kind`, `expected one of ${Object.keys(variants).join('|')}, got ${JSON.stringify(kind)}`); return; }
  obj({ kind: str, ...shape })(v, p, o);
};

const STORES: Store[] = ['empty', 'agm114k', 'agm114l', 'hydra70'];
const loadout = obj({
  pylons: obj(Object.fromEntries(PYLONS.map(id => [id, oneOf(...STORES)]))),
  stingers: bool, gunRounds: num(0, 1200), fuel: num(0, 100),
});
const unitRef: Check = (v, p, o) => {
  if (Array.isArray(v)) arr(str, 1)(v, p, o);
  else obj({ group: str })(v, p, o);
};
const condition: Check = (v, p, o) => tagged({
  time: { afterSec: num(0) },
  playerInZone: { center: vec2, radius: num(1) },
  unitDestroyed: { units: arr(str, 1), count: opt(num(1)) },
  objectiveDone: { objective: str },
  playerDetected: { byGroup: opt(str) },
  playerHits: { count: num(1) },
  laserBroken: {},
  tadsActive: {},
  unitsIdentified: { units: arr(str, 1), count: opt(num(1)) },
  groupArrived: { group: str, count: opt(num(1)) },
  all: { of: arr(condition, 1) },
  any: { of: arr(condition, 1) },
})(v, p, o);
const action = tagged({
  radio: { from: oneOf('control', 'steel6', 'hound2', 'rescue'), text: str },
  spawn: { units: arr(str, 1) },
  startGroup: { group: str },
  remoteLaser: { unit: str, seconds: num(1, 120) },
  smoke: { position: vec2, color: oneOf('red', 'green', 'white') },
  objectiveAdd: { objective: str },
  missionEnd: { result: oneOf('success', 'fail'), reason: str },
  hint: { text: str },
});
const common = { id: str, primary: bool, label: str };

const mission = obj({
  id: str, title: str, act: oneOf(1, 2, 3),
  kind: oneOf('recon', 'escort', 'cas', 'sead', 'interdiction', 'csar', 'strike', 'defense', 'training', 'instant'),
  briefing: obj({ summary: str, situation: arr(str), threats: arr(str), recommendedLoadout: loadout }),
  environment: obj({ seed: num(0), time: oneOf('day', 'dusk', 'night', 'dawn'), fog: bool, wind: obj({ dirDeg: num(0, 360), speed: num(0, 30), gust: num(0, 20) }) }),
  terrain: obj({
    size: num(2000, 20000),
    features: arr(tagged({
      village: { center: vec2, radius: num(10), houses: opt(num(0, 60)) },
      base: { center: vec2, radius: num(10) },
      flatten: { center: vec2, radius: num(5) },
      forest: { center: vec2, radius: num(10), density: opt(num(0, 1)) },
      bridge: { from: vec2, to: vec2 },
    })),
    roads: arr(arr(vec2, 2)),
  }),
  start: obj({ kind: oneOf('farp_cold', 'farp_hot', 'air'), position: vec2, headingDeg: num(0, 360), altitudeAgl: opt(num(0, 3000)), speedKt: opt(num(0, 200)) }),
  farps: arr(obj({ id: str, position: vec2, services: arr(oneOf('fuel', 'ammo', 'repair')) })),
  waypoints: arr(obj({ id: str, name: str, position: vec2 })),
  units: arr(obj({ id: str, type: str, position: vec2, headingDeg: opt(num(0, 360)), group: opt(str), hidden: opt(bool), skill: opt(num(0.5, 1.5)), passive: opt(bool), aam: opt(bool) })),
  groups: arr(obj({ id: str, route: opt(arr(vec2, 2)), loop: opt(bool), speedScale: opt(num(0.1, 3)), behavior: oneOf('hold', 'patrol', 'advance', 'convoy', 'defend'), startTrigger: opt(str) })),
  objectives: arr(tagged({
    destroy: { ...common, units: unitRef, count: opt(num(1)) },
    protect: { ...common, units: unitRef, minSurvive: num(1), untilTrigger: str },
    reach: { ...common, waypoint: str, radius: num(10) },
    survive: { ...common, seconds: num(1) },
    land: { ...common, farp: str, maxFpm: opt(num(50, 3000)) },
    identify: { ...common, units: arr(str, 1) },
  }), 1),
  initialObjectives: opt(arr(str)),
  triggers: arr(obj({ id: str, once: bool, when: condition, then: arr(action, 1) })),
  par: num(0), parTimeSec: num(1), wingman: bool,
  unlocks: opt(arr(oneOf('chaff', 'fcr', 'agm114l', 'night', 'stinger', 'wingmanMenu', 'liveries'))),
});

function references(m: MissionDef, out: Issue[], warn: Issue[]) {
  const dup = (list: { id: string }[], path: string) => {
    const seen = new Set<string>();
    list.forEach((x, i) => { if (seen.has(x.id)) fail(out, `${path}[${i}].id`, `duplicate id ${x.id}`); seen.add(x.id); });
    return seen;
  };
  const units = dup(m.units, 'units'), groups = dup(m.groups, 'groups'), objectives = dup(m.objectives, 'objectives');
  const triggers = dup(m.triggers, 'triggers'), waypoints = dup(m.waypoints, 'waypoints'), farps = dup(m.farps, 'farps');
  if (m.wingman) units.add(WINGMAN_ID);
  const half = m.terrain.size / 2;
  const inMap = (v: Vec2, path: string) => { if (Math.abs(v[0]) > half || Math.abs(v[1]) > half) fail(out, path, `position ${v.join(',')} outside the ${m.terrain.size} m map`); };
  const need = (set: Set<string>, id: string, path: string, what: string) => { if (!set.has(id)) fail(out, path, `unknown ${what} ${id}`); };
  const refUnits = (r: UnitRef, path: string) => { if (Array.isArray(r)) r.forEach((id, i) => need(units, id, `${path}[${i}]`, 'unit')); else need(groups, r.group, `${path}.group`, 'group'); };

  inMap(m.start.position, 'start.position');
  m.farps.forEach((f, i) => inMap(f.position, `farps[${i}].position`));
  m.waypoints.forEach((w, i) => inMap(w.position, `waypoints[${i}].position`));
  m.units.forEach((u, i) => {
    if (!UNIT_DEFS[u.type]) fail(out, `units[${i}].type`, `unknown unit type ${u.type}`);
    inMap(u.position, `units[${i}].position`);
    if (u.group) need(groups, u.group, `units[${i}].group`, 'group');
  });
  m.groups.forEach((g, i) => { if (g.startTrigger) need(triggers, g.startTrigger, `groups[${i}].startTrigger`, 'trigger'); g.route?.forEach((p, k) => inMap(p, `groups[${i}].route[${k}]`)); });
  m.objectives.forEach((o, i) => {
    const p = `objectives[${i}]`;
    if (o.kind === 'destroy' || o.kind === 'protect') refUnits(o.units, `${p}.units`);
    if (o.kind === 'protect') need(triggers, o.untilTrigger, `${p}.untilTrigger`, 'trigger');
    if (o.kind === 'reach') need(waypoints, o.waypoint, `${p}.waypoint`, 'waypoint');
    if (o.kind === 'land') need(farps, o.farp, `${p}.farp`, 'farp');
    if (o.kind === 'identify') o.units.forEach((id, k) => need(units, id, `${p}.units[${k}]`, 'unit'));
  });
  m.initialObjectives?.forEach((id, i) => need(objectives, id, `initialObjectives[${i}]`, 'objective'));
  const cond = (c: Condition, p: string) => {
    if (c.kind === 'unitDestroyed') c.units.forEach((id, k) => need(units, id, `${p}.units[${k}]`, 'unit'));
    else if (c.kind === 'objectiveDone') need(objectives, c.objective, `${p}.objective`, 'objective');
    else if (c.kind === 'playerDetected' && c.byGroup) need(groups, c.byGroup, `${p}.byGroup`, 'group');
    else if (c.kind === 'playerInZone') inMap(c.center, `${p}.center`);
    else if (c.kind === 'unitsIdentified') c.units.forEach((id, k) => need(units, id, `${p}.units[${k}]`, 'unit'));
    else if (c.kind === 'groupArrived') need(groups, c.group, `${p}.group`, 'group');
    else if (c.kind === 'all' || c.kind === 'any') c.of.forEach((x, k) => cond(x, `${p}.of[${k}]`));
  };
  m.triggers.forEach((t, i) => {
    cond(t.when, `triggers[${i}].when`);
    t.then.forEach((a, k) => {
      const p = `triggers[${i}].then[${k}]`;
      if (a.kind === 'spawn') a.units.forEach((id, j) => need(units, id, `${p}.units[${j}]`, 'unit'));
      else if (a.kind === 'startGroup') need(groups, a.group, `${p}.group`, 'group');
      else if (a.kind === 'remoteLaser') need(units, a.unit, `${p}.unit`, 'unit');
      else if (a.kind === 'objectiveAdd') need(objectives, a.objective, `${p}.objective`, 'objective');
      else if (a.kind === 'smoke') inMap(a.position, `${p}.position`);
    });
  });
  const active = m.units.filter(u => !u.hidden).length;
  if (active > MISSION_MAX_UNITS) warn.push({ path: 'units', message: `${active} active units exceed the ${MISSION_MAX_UNITS} budget` });
  if (m.units.length > MISSION_MAX_UNITS * 1.5) warn.push({ path: 'units', message: `${m.units.length} units in total` });
}

export function validateMission(data: unknown, bytes?: number): Validation {
  const errors: Issue[] = [], warnings: Issue[] = [];
  mission(data, 'mission', errors);
  if (bytes !== undefined && bytes > MISSION_MAX_BYTES) errors.push({ path: 'mission', message: `${bytes} bytes exceed ${MISSION_MAX_BYTES}` });
  if (!errors.length) references(data as MissionDef, errors, warnings);
  return { errors, warnings };
}

export function loadMission(data: unknown, bytes?: number): MissionDef {
  const v = validateMission(data, bytes);
  if (v.errors.length) {
    if (import.meta.env?.DEV) for (const e of v.errors) console.error(`[mission] ${e.path}: ${e.message}`);
    throw new Error(`invalid mission: ${v.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`);
  }
  if (import.meta.env?.DEV) for (const w of v.warnings) console.warn(`[mission] ${w.path}: ${w.message}`);
  return data as MissionDef;
}
