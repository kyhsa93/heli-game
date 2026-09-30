import { Vector3 } from 'three';
import { Grid } from '../../core/grid';
import { eyeOf } from '../ai/awareness';
import { REACTION } from '../ai/brain';
import { LOS_PRUNE_EVERY, pairKey } from '../los';
import { hitsAir, hitsGround, hostile, type TargetRef, type Unit, type UnitDef, type UnitWeaponDef } from '../units';
import type { World } from '../world';
import type { Intel } from './intel';

export const MAX_CANDIDATES = 4;
export const TARGET_SLICES = 10;
export const GRID_CELL = 100;

export type TargetClass = 'air' | 'tank' | 'apc' | 'light' | 'inf' | 'atInf' | 'structure';
export type Role = 'inf' | 'at' | 'sniper' | 'aa' | 'aaVehicle' | 'tank' | 'apc' | 'light' | 'heli' | 'jet' | 'none';

const armed = (d: UnitDef, kinds: string[]) => d.weapons.some(w => kinds.includes(w.kind));

export function targetClass(d: UnitDef): TargetClass {
  if (d.category === 'air') return 'air';
  if (d.category === 'structure' || !d.move) return 'structure';
  if (d.category === 'infantry') return armed(d, ['shell', 'atgm']) ? 'atInf' : 'inf';
  if (d.category === 'tracked') return d.armor >= 4 ? 'tank' : 'apc';
  if (d.category === 'airDefense') return d.armor >= 2 ? 'apc' : 'light';
  return 'light';
}

export function roleOf(d: UnitDef): Role {
  if (!d.weapons.length) return 'none';
  if (d.category === 'air') return d.move && d.move.speed > 150 ? 'jet' : 'heli';
  if (d.category === 'infantry') {
    if (armed(d, ['shell', 'atgm'])) return 'at';
    if (armed(d, ['missileIR', 'missileRadar'])) return 'aa';
    if (d.weapons.some(w => w.id === 'g_sniper')) return 'sniper';
    return 'inf';
  }
  if (d.category === 'airDefense') return 'aaVehicle';
  if (d.category === 'tracked') return d.armor >= 4 ? 'tank' : 'apc';
  return 'light';
}

export const MATCHUP: Record<Role, Partial<Record<TargetClass, number>>> = {
  inf: { inf: 1, atInf: 1, light: 0.7 },
  at: { tank: 3, apc: 2, light: 1, inf: 0.5, atInf: 0.5, structure: 0.5 },
  sniper: { inf: 2, atInf: 2 },
  aa: { air: 3, inf: 0.2, atInf: 0.2 },
  aaVehicle: { air: 3, inf: 0.2, atInf: 0.2, light: 0.2 },
  tank: { tank: 2, apc: 2, atInf: 1.5, inf: 1, light: 1, structure: 0.5 },
  apc: { inf: 2, atInf: 2, light: 1.5, apc: 1.5, tank: 1, structure: 0.5 },
  light: { inf: 1.5, atInf: 1.5, light: 1, apc: 0.3 },
  heli: { tank: 2, apc: 2, light: 1.5, inf: 1, atInf: 1, air: 1 },
  jet: { air: 3, tank: 1, apc: 1, light: 1 },
  none: {},
};

export function canHit(w: UnitWeaponDef, cls: TargetClass) {
  return cls === 'air' ? hitsAir(w) : hitsGround(w);
}

const SOFT = new Set<TargetClass>(['inf', 'atInf', 'air']);

export function usableWeapons(u: Unit, cls: TargetClass, dist: number) {
  return u.def.weapons.filter(w => canHit(w, cls) && dist <= w.range && dist >= w.minRange && !(w.kind === 'atgm' && SOFT.has(cls)));
}

function reach(u: Unit) {
  let r = 0;
  for (const w of u.def.weapons) if (w.range > r) r = w.range;
  return r;
}

interface Cell { x: number; z: number; u: Unit }

export class Targeting {
  private grid = new Grid<Cell>(GRID_CELL);
  private tick = 0;
  private near: Cell[] = [];
  private eye = new Vector3();
  private at = new Vector3();

  constructor(readonly intel: Intel | null = null) {}

  step = (world: World) => {
    this.grid.rebuild(world.units.filter(u => u.alive && u.side !== 'civilian').map(u => ({ x: u.pos.x, z: u.pos.z, u })));
    const slice = this.tick++ % TARGET_SLICES;
    for (const u of world.units) {
      if (!u.alive || u.passive || !u.def.weapons.length || u.side === 'civilian') continue;
      const b = u.battle ??= { target: null, aim: 0, fire: {} };
      if (u.id % TARGET_SLICES === slice) this.choose(world, u);
      else if (b.target && !this.valid(world, u, b.target)) b.target = null;
    }
    if (this.tick % (LOS_PRUNE_EVERY * TARGET_SLICES) === 0) { world.los.prune(world.time); this.intel?.forget(world.time); }
  };

  private valid(world: World, u: Unit, t: TargetRef) {
    if (t.kind === 'player') return world.player.alive && world.huntsPlayer(u);
    const o = world.unit(t.id);
    return !!o && o.alive;
  }

  choose(world: World, u: Unit) {
    const b = u.battle!;
    const role = roleOf(u.def);
    const table = MATCHUP[role];
    eyeOf(u, this.eye);
    const range = reach(u);
    this.near.length = 0;
    this.grid.query(u.pos.x, u.pos.z, range, this.near);
    const cands = this.near
      .filter(c => c.u !== u && c.u.alive && hostile(u.side, c.u.side) && !c.u.def.indestructible)
      .map(c => ({ u: c.u, d: Math.hypot(c.x - u.pos.x, c.z - u.pos.z) }))
      .sort((a, b2) => a.d - b2.d || a.u.id - b2.u.id)
      .slice(0, MAX_CANDIDATES);
    let best: TargetRef | null = null, bestScore = 0;
    for (const c of cands) {
      const cls = targetClass(c.u.def);
      const m = table[cls] ?? 0;
      if (m <= 0 || !usableWeapons(u, cls, c.d).length) continue;
      const score = m / Math.max(c.d, 1);
      if (score <= bestScore) continue;
      eyeOf(c.u, this.at);
      if (!world.los.visual(pairKey(u.id, c.u.id), this.eye, this.at, world.time).clear) continue;
      if (this.intel && (u.side === 'coalition' || u.side === 'veros')) this.intel.spot(u.side, c.u.id, world.time);
      best = { kind: 'unit', id: c.u.id }; bestScore = score;
    }
    const body = world.playerBody();
    if (body.alive && world.huntsPlayer(u) && u.ai.detected) {
      const d = this.eye.distanceTo(body.pos);
      const foot = body.kind === 'soldier';
      const m = (foot ? table.inf : table.air) ?? 0;
      const can = (w: UnitWeaponDef) => (foot ? hitsGround(w) && w.kind === 'bullet' : hitsAir(w)) && d <= w.range && d >= w.minRange;
      if (m > 0 && u.def.weapons.some(can) && m / Math.max(d, 1) > bestScore) best = { kind: 'player' };
    }
    if (!same(best, b.target)) {
      b.target = best;
      b.aim = best?.kind === 'unit' ? REACTION[u.def.category] ?? 1.5 : 0;
      b.fire = {};
    }
  }
}

function same(a: TargetRef | null, b: TargetRef | null) {
  if (!a || !b) return a === b;
  return a.kind === b.kind && (a.kind === 'player' || a.id === (b as { id: number }).id);
}
