import type { AvatarSpawn } from '../avatar';
import type { SimEvent } from '../events';
import type { LoadoutDef } from '../heli/loadout';
import type { Objective, ObjectiveState } from '../objective';
import { FlightSession } from '../session';
import type { World } from '../world';
import { brainSystems, composeHooks } from './index';
import { insidePolygon, modeZone, type BattleMapDef, type BattleSide, type ModeId } from './schema';
import { battleTerrainOptions } from './terrain';

export const PLAYER_RESPAWN = 10;
export const BOUNDARY_GRACE = 10;
export const AIR_SPAWN_AGL = 150;

export interface BattleOptions { side: BattleSide; seed: number }

export interface SpawnPoint { id: string; kind: 'pad' | 'air'; pad: number; x: number; z: number; headingDeg: number }

export class BattleRuntime implements Objective {
  readonly id: string;
  state: ObjectiveState = 'active';
  result: Record<string, number> = {};
  readonly respawnDelay = PLAYER_RESPAWN;
  readonly zone;
  outside = 0;

  constructor(readonly map: BattleMapDef, readonly mode: ModeId, readonly opts: BattleOptions) {
    this.id = `${map.id}:${mode}`;
    this.zone = modeZone(map, mode);
  }

  start(world: World) {
    world.playerSide = this.opts.side;
    world.battleHooks = composeHooks(brainSystems());
    for (const f of this.map.fixed) {
      if (f.modes && !f.modes.includes(this.mode)) continue;
      world.spawnUnit(f.unit, f.position[0], f.position[1], -(f.yawDeg * Math.PI) / 180);
    }
    this.outside = 0;
  }

  spawnPoints(world: World): SpawnPoint[] {
    const base = this.map.bases.find(b => b.side === this.opts.side)!;
    const pad = world.pads.findIndex(p => p.name === base.farp);
    const enemy = this.map.bases.find(b => b.side !== this.opts.side)!;
    const headingDeg = (Math.atan2(enemy.position[0] - base.position[0], -(enemy.position[1] - base.position[1])) * 180) / Math.PI;
    return [
      { id: 'base', kind: 'pad', pad, x: base.position[0], z: base.position[1], headingDeg },
      { id: 'baseAir', kind: 'air', pad, x: base.position[0], z: base.position[1], headingDeg },
    ];
  }

  spawnFor(point: SpawnPoint, kit: LoadoutDef): AvatarSpawn {
    return point.kind === 'pad'
      ? { kind: 'heli', at: 'pad', pad: point.pad, kit, running: true }
      : { kind: 'heli', at: 'air', x: point.x, z: point.z, agl: AIR_SPAWN_AGL, headingDeg: point.headingDeg, kit };
  }

  tick(world: World, dt: number) {
    const h = world.player;
    if (world.avatar.kind !== 'heli' || !h.alive) { this.outside = 0; return; }
    const inside = insidePolygon(this.zone, h.pos.x, h.pos.z);
    if (inside) {
      if (this.outside > 0) world.emit({ t: 'zone', inside: true, seconds: 0 });
      this.outside = 0;
      return;
    }
    const before = this.outside;
    this.outside += dt;
    if (before === 0 || Math.ceil(BOUNDARY_GRACE - before) !== Math.ceil(BOUNDARY_GRACE - this.outside)) {
      world.emit({ t: 'zone', inside: false, seconds: Math.max(0, BOUNDARY_GRACE - this.outside) });
    }
    if (this.outside >= BOUNDARY_GRACE) { this.outside = 0; world.killPlayer('outOfBounds'); }
  }

  onEvent(_e: SimEvent, _world: World) {}
}

export function createBattleSession(map: BattleMapDef, mode: ModeId, opts: BattleOptions) {
  const runtime = new BattleRuntime(map, mode, opts);
  const session = new FlightSession(opts.seed, runtime, battleTerrainOptions(map), map.environment.seed);
  return { session, runtime };
}
