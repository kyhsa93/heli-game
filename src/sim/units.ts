import { Vector3 } from 'three';
import unitsJson from '../content/units.json';

export type Side = 'coalition' | 'veros' | 'civilian';
export type Category = 'infantry' | 'vehicle' | 'tracked' | 'airDefense' | 'air' | 'structure';
export type WeaponKind = 'bullet' | 'rocket' | 'shell' | 'atgm' | 'missileIR' | 'missileRadar';
export type Vs = 'air' | 'ground' | 'both';
export type Detect = 'visual' | 'visualIR' | 'radar' | 'none';

export interface BotFire { damage?: number; rate?: number; accuracy?: number; penetration?: number }

export interface UnitWeaponDef { id: string; kind: WeaponKind; vs: Vs; penetration: number; range: number; minRange: number; damage: number; rate: number; accuracy?: number; vsUnits?: BotFire }

export const hitsAir = (w: UnitWeaponDef) => w.vs !== 'ground';
export const hitsGround = (w: UnitWeaponDef) => w.vs !== 'air';

export interface UnitDef {
  side: Side;
  hp: number;
  armor: number;
  category: Category;
  move: { speed: number; offroad?: boolean; offroadSpeed?: number; air?: boolean; stationaryToFire?: boolean } | null;
  weapons: UnitWeaponDef[];
  detect: Detect;
  score: number;
  size: [number, number, number];
  heat: number;
  squad?: number;
  carry?: number;
  radar?: { search: number; track: number };
  secondaryExplosion?: { radius: number; damage: number; chain?: boolean };
  indestructible?: boolean;
  linkedRadar?: boolean;
  searchlightAtNight?: boolean;
}

export const UNIT_DEFS = unitsJson as unknown as Record<string, UnitDef>;

export type RadarMode = 'search' | 'acquire' | 'track';

export interface AiState {
  awareness: number;
  state: 'idle' | 'alert' | 'engage' | 'search' | 'retreat';
  detected: boolean;
  lastSeen: Vector3 | null;
  lastSeenAt: number;
  radar: RadarMode;
  radarTimer: number;
  aimTimer: number;
  blindTimer: number;
  stateTimer: number;
  fireAcc: number;
  cover: Vector3 | null;
  jammed: number;
}

export function createAiState(): AiState {
  return { awareness: 0, state: 'idle', detected: false, lastSeen: null, lastSeenAt: -Infinity, radar: 'search', radarTimer: 0, aimTimer: 0, blindTimer: 0, stateTimer: 0, fireAcc: 0, cover: null, jammed: 0 };
}

export interface Unit {
  id: number;
  defId: string;
  def: UnitDef;
  missionId?: string;
  side: Side;
  pos: Vector3;
  yaw: number;
  vel: Vector3;
  hp: number;
  alive: boolean;
  group?: string;
  ai: AiState;
  weaponCooldown: number;
  identified: boolean;
  passive?: boolean;
  skill?: number;
  aam?: boolean;
  beam?: { yaw: number; pitch: number; lost: number; lit: boolean };
  battle?: BattleUnit;
  members?: { ox: number; oz: number; hp: number; alive: boolean }[];
  diedAt?: number;
}

export type TargetRef = { kind: 'player' } | { kind: 'unit'; id: number };

export interface BattleUnit {
  target: TargetRef | null;
  aim: number;
  fire: Record<string, number>;
  advance?: boolean;
}

export function hostile(a: Side, b: Side) {
  return a !== b && a !== 'civilian' && b !== 'civilian';
}

export function squadMembers(u: Unit) {
  const n = u.def.squad ?? 1;
  return u.alive ? Math.max(1, Math.ceil((u.hp / u.def.hp) * n)) : 0;
}

const SIDES = new Set<Side>(['coalition', 'veros', 'civilian']);
const CATEGORIES = new Set<Category>(['infantry', 'vehicle', 'tracked', 'airDefense', 'air', 'structure']);
const KINDS = new Set<WeaponKind>(['bullet', 'rocket', 'shell', 'atgm', 'missileIR', 'missileRadar']);
const VS = new Set<Vs>(['air', 'ground', 'both']);
const AIMED = new Set<WeaponKind>(['bullet', 'rocket', 'shell', 'atgm']);
const DETECTS = new Set<Detect>(['visual', 'visualIR', 'radar', 'none']);

export function validateUnitDefs(defs: Record<string, UnitDef>): string[] {
  const errors: string[] = [];
  for (const [id, d] of Object.entries(defs)) {
    const e = (m: string) => errors.push(`${id}: ${m}`);
    if (!SIDES.has(d.side)) e(`side ${d.side}`);
    if (!CATEGORIES.has(d.category)) e(`category ${d.category}`);
    if (!(d.hp > 0)) e('hp must be > 0');
    if (!Number.isInteger(d.armor) || d.armor < 0 || d.armor > 5) e(`armor ${d.armor} not 0..5`);
    if (!DETECTS.has(d.detect)) e(`detect ${d.detect}`);
    if (d.detect === 'radar' && !d.radar) e('radar detection without radar ranges');
    if (d.size.length !== 3 || d.size.some(v => !(v > 0))) e('size');
    if (d.heat < 0 || d.heat > 1) e('heat not 0..1');
    if (d.move && !(d.move.speed > 0)) e('move speed');
    if (d.squad !== undefined && !(Number.isInteger(d.squad) && d.squad >= 1)) e(`squad ${d.squad}`);
    if (d.carry !== undefined && !(Number.isInteger(d.carry) && d.carry >= 1)) e(`carry ${d.carry}`);
    for (const w of d.weapons) {
      if (!KINDS.has(w.kind)) e(`${w.id} kind ${w.kind}`);
      if (!VS.has(w.vs)) e(`${w.id} vs ${w.vs}`);
      if (!Number.isInteger(w.penetration) || w.penetration < 0 || w.penetration > 5) e(`${w.id} penetration ${w.penetration} not 0..5`);
      if (!(w.range > w.minRange && w.minRange >= 0)) e(`${w.id} range`);
      if (!(w.damage > 0 && w.rate > 0)) e(`${w.id} damage/rate`);
      const v = w.vsUnits;
      if (v && ((v.damage !== undefined && !(v.damage > 0)) || (v.rate !== undefined && !(v.rate > 0)) || (v.accuracy !== undefined && !(v.accuracy > 0 && v.accuracy <= 1)) || (v.penetration !== undefined && !(Number.isInteger(v.penetration) && v.penetration >= 0 && v.penetration <= 5)))) e(`${w.id} vsUnits`);
      if (AIMED.has(w.kind) && !(w.accuracy !== undefined && w.accuracy > 0 && w.accuracy <= 1)) e(`${w.id} accuracy`);
    }
  }
  return errors;
}
