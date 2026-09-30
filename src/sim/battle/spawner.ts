import { UNIT_DEFS, type Unit } from '../units';
import type { World } from '../world';
import type { Conquest, ControlPoint } from './conquest';
import { ROSTERS, type RostersDef, type Slot } from './roster';
import { badGround, UNIT_BUDGET, type BattleMapDef, type BattleSide } from './schema';

export const BASE_SPREAD: [number, number] = [40, 160];
export const SPAWN_TRIES = 24;
export const FOOTING: [number, number][] = [[8, 0], [-8, 0], [0, 8], [0, -8]];

export function activeUnits(world: World) {
  let n = 0;
  for (const u of world.units) if (u.alive) n++;
  return n;
}

export class Spawner {
  elapsed = 0;
  nextWave: number;
  private lastPoint: Record<BattleSide, number> = { coalition: 0, veros: 0 };
  threatened: (side: BattleSide, p: ControlPoint) => boolean = () => false;

  constructor(
    readonly map: BattleMapDef,
    readonly slots: Record<BattleSide, Slot[]>,
    readonly conquest: Conquest,
    readonly waveSec: number,
    readonly def: RostersDef = ROSTERS,
  ) {
    this.nextWave = waveSec;
  }

  step = (world: World, dt: number) => {
    this.elapsed += dt;
    for (const side of ['coalition', 'veros'] as const) {
      for (const s of this.slots[side]) {
        if (s.unit === null || s.deadAt !== null) continue;
        const u = world.unit(s.unit);
        if (!u || !u.alive) s.deadAt = this.elapsed;
      }
    }
    if (this.elapsed + 1e-6 >= this.nextWave) {
      this.nextWave += this.waveSec;
      this.wave(world);
    }
  };

  wave(world: World) {
    for (const side of ['coalition', 'veros'] as const) {
      if (this.conquest.tickets[side] <= 0) continue;
      for (const s of this.slots[side]) {
        if (s.unit !== null && s.deadAt === null) continue;
        if (s.deadAt !== null && this.elapsed - s.deadAt < (this.def.respawnSec[s.cls] ?? 0)) continue;
        if (activeUnits(world) >= UNIT_BUDGET) return;
        const u = this.spawn(world, side, s);
        s.unit = u.id;
        s.deadAt = null;
      }
    }
  }

  private spawn(world: World, side: BattleSide, s: Slot): Unit {
    const squad = !!UNIT_DEFS[s.defId].squad;
    const [cx, cz, r0, r1] = squad ? this.squadSite(side) : this.baseSite(side);
    let x = cx, z = cz;
    for (let k = 0; k < SPAWN_TRIES; k++) {
      const a = world.rng() * Math.PI * 2, d = r0 + world.rng() * (r1 - r0);
      x = cx + Math.cos(a) * d; z = cz + Math.sin(a) * d;
      if (!badGround(world.terrain, [x, z]) && FOOTING.every(([ox, oz]) => !badGround(world.terrain, [x + ox, z + oz]))) break;
    }
    const enemy = this.map.bases.find(b => b.side !== side)!.position;
    return world.spawnUnit(s.defId, x, z, Math.atan2(-(enemy[0] - x), -(enemy[1] - z)));
  }

  private baseSite(side: BattleSide): [number, number, number, number] {
    const b = this.map.bases.find(x => x.side === side)!.position;
    return [b[0], b[1], BASE_SPREAD[0], BASE_SPREAD[1]];
  }

  private squadSite(side: BattleSide): [number, number, number, number] {
    const own = this.conquest.points.filter(p => p.owner === side && !p.contested && p.strength[side === 'coalition' ? 'veros' : 'coalition'] === 0 && !this.threatened(side, p));
    if (!own.length) return this.baseSite(side);
    const enemy = this.map.bases.find(b => b.side !== side)!.position;
    own.sort((a, b) => Math.hypot(a.x - enemy[0], a.z - enemy[1]) - Math.hypot(b.x - enemy[0], b.z - enemy[1]) || a.id.localeCompare(b.id));
    const front = own.slice(0, 2);
    const p = front[this.lastPoint[side]++ % front.length];
    return [p.x, p.z, 0, p.radius * 0.8];
  }
}
