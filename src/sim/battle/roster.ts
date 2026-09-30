import rostersJson from '../../content/battle/rosters.json';
import type { DifficultyLevel } from '../difficulty';
import { UNIT_DEFS } from '../units';
import type { BattleSide } from './schema';

export type ForceClass = 'rifle' | 'at' | 'mg' | 'aa' | 'sniper' | 'tank' | 'apc' | 'light' | 'truck' | 'spaag' | 'attackHeli' | 'transportHeli' | 'jet';
export type ForceScale = 'large' | 'quick';

export interface RostersDef {
  units: Record<ForceClass, [string, string]>;
  respawnSec: Partial<Record<ForceClass, number>>;
  forces: Record<ForceScale, Partial<Record<ForceClass, number>>>;
  playerSide: Record<ForceScale, Partial<Record<ForceClass, number>>>;
  enemyScale: Record<DifficultyLevel, number>;
  available: ForceClass[];
}

export const ROSTERS = rostersJson as unknown as RostersDef;
export const FORCE_CLASSES: ForceClass[] = ['rifle', 'at', 'mg', 'aa', 'sniper', 'tank', 'apc', 'light', 'truck', 'spaag', 'attackHeli', 'transportHeli', 'jet'];

export interface Slot { key: string; cls: ForceClass; defId: string; unit: number | null; deadAt: number | null }

export interface RosterOptions { scale: ForceScale; side: BattleSide; playerSide: BattleSide; difficulty: DifficultyLevel }

export function rosterCounts(o: RosterOptions, def: RostersDef = ROSTERS) {
  const counts: Partial<Record<ForceClass, number>> = {};
  const enemy = o.side !== o.playerSide;
  for (const cls of FORCE_CLASSES) {
    if (!def.available.includes(cls)) continue;
    let n = def.forces[o.scale][cls] ?? 0;
    if (!enemy) n += def.playerSide[o.scale][cls] ?? 0;
    else n = Math.round(n * def.enemyScale[o.difficulty]);
    if (n > 0) counts[cls] = n;
  }
  return counts;
}

export function buildRoster(o: RosterOptions, def: RostersDef = ROSTERS): Slot[] {
  const idx = o.side === 'coalition' ? 0 : 1;
  const counts = rosterCounts(o, def);
  return FORCE_CLASSES.flatMap(cls => Array.from({ length: counts[cls] ?? 0 }, (_, i) => ({ key: `${cls}#${i}`, cls, defId: def.units[cls][idx], unit: null, deadAt: null })));
}

export function validateRosters(def: RostersDef): string[] {
  const errors: string[] = [];
  for (const cls of FORCE_CLASSES) {
    const pair = def.units[cls];
    if (!pair) { errors.push(`units.${cls}: missing`); continue; }
    pair.forEach((id, i) => {
      const side = i === 0 ? 'coalition' : 'veros';
      if (!UNIT_DEFS[id]) errors.push(`units.${cls}[${i}]: unknown unit ${id}`);
      else if (UNIT_DEFS[id].side !== side) errors.push(`units.${cls}[${i}]: ${id} is not ${side}`);
    });
  }
  for (const scale of ['large', 'quick'] as const) {
    for (const [cls, n] of Object.entries(def.forces[scale] ?? {})) {
      if (!FORCE_CLASSES.includes(cls as ForceClass)) errors.push(`forces.${scale}.${cls}: unknown class`);
      if (!Number.isInteger(n) || n < 0) errors.push(`forces.${scale}.${cls}: ${n} is not a count`);
    }
  }
  for (const cls of def.available) if (!FORCE_CLASSES.includes(cls)) errors.push(`available: unknown class ${cls}`);
  return errors;
}
