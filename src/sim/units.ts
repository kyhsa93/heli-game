import { Vector3 } from 'three';
import unitsJson from '../content/units.json';

export type Side = 'coalition' | 'veros' | 'civilian';
export type Category = 'infantry' | 'vehicle' | 'tracked' | 'airDefense' | 'air' | 'structure';
export type WeaponKind = 'bullet' | 'rocket' | 'missileIR' | 'missileRadar';
export type Detect = 'visual' | 'visualIR' | 'radar' | 'none';

export interface UnitWeaponDef { id: string; kind: WeaponKind; range: number; minRange: number; damage: number; rate: number }

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
}

export function createAiState(): AiState {
  return { awareness: 0, state: 'idle', detected: false, lastSeen: null, lastSeenAt: -Infinity, radar: 'search', radarTimer: 0 };
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
}

export function squadMembers(u: Unit) {
  const n = u.def.squad ?? 1;
  return u.alive ? Math.max(1, Math.ceil((u.hp / u.def.hp) * n)) : 0;
}

const SIDES = new Set<Side>(['coalition', 'veros', 'civilian']);
const CATEGORIES = new Set<Category>(['infantry', 'vehicle', 'tracked', 'airDefense', 'air', 'structure']);
const KINDS = new Set<WeaponKind>(['bullet', 'rocket', 'missileIR', 'missileRadar']);
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
    for (const w of d.weapons) {
      if (!KINDS.has(w.kind)) e(`${w.id} kind ${w.kind}`);
      if (!(w.range > w.minRange && w.minRange >= 0)) e(`${w.id} range`);
      if (!(w.damage > 0 && w.rate > 0)) e(`${w.id} damage/rate`);
    }
  }
  return errors;
}
