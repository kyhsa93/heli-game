import type { AvatarSpawn } from '../avatar';
import type { SimEvent } from '../events';
import type { LoadoutDef } from '../heli/loadout';
import type { Objective, ObjectiveState } from '../objective';
import { FlightSession } from '../session';
import type { World } from '../world';
import { Commander } from './commander';
import { Conquest, type Winner } from './conquest';
import { Intel } from './intel';
import { buildPlatoons } from './platoon';
import { brainSystems, composeHooks } from './index';
import { conquestRules, type ConquestRules } from './modes';
import { buildRoster } from './roster';
import { Spawner } from './spawner';
import { PlayerSpotting } from './spotting';
import { insidePolygon, modeZone, type BattleMapDef, type BattleSide } from './schema';
import { battleTerrainOptions } from './terrain';

export const AIR_SPAWN_AGL = 60;
export const AIR_SPAWN_SPEED = 31;
export const WRECK_SECONDS = 90;

export interface BattleOptions { side: BattleSide; seed: number }

export interface SpawnPoint { id: string; kind: 'pad' | 'air'; pad: number; x: number; z: number; headingDeg: number }

export class BattleRuntime implements Objective {
  readonly id: string;
  state: ObjectiveState = 'active';
  result: Record<string, number> = {};
  readonly respawnDelay: number;
  readonly rules: ConquestRules;
  readonly zone;
  conquest!: Conquest;
  spawner!: Spawner;
  commanders: Commander[] = [];
  intel = new Intel();
  spotting = new PlayerSpotting();
  outside = 0;

  constructor(readonly map: BattleMapDef, readonly mode: 'conquest' | 'quick', readonly opts: BattleOptions) {
    this.id = `${map.id}:${mode}`;
    this.zone = modeZone(map, mode);
    this.rules = conquestRules(mode);
    this.respawnDelay = this.rules.playerRespawnSec;
  }

  start(world: World) {
    world.playerSide = this.opts.side;
    world.retireAfter = WRECK_SECONDS;
    this.conquest = new Conquest(this.map, this.mode, this.rules);
    const roster = (side: BattleSide) => buildRoster({ scale: this.rules.forces, side, playerSide: this.opts.side, difficulty: world.difficulty.level });
    this.spawner = new Spawner(this.map, { coalition: roster('coalition'), veros: roster('veros') }, this.conquest, this.rules.botWaveSec);
    this.intel = new Intel();
    this.commanders = (['coalition', 'veros'] as const).map(side => {
      const home = this.map.bases.find(b => b.side === side)!.position;
      return new Commander(side, buildPlatoons(side, this.spawner.slots[side], home), this.intel);
    });
    this.spawner.threatened = (side, p) => this.commanders.find(c => c.side === side)!.knownEnemy(world, p, this.conquest.elapsed) > 0;
    const brains = brainSystems(this.intel, this.rules.botLethality);
    this.spotting = new PlayerSpotting();
    world.battleHooks = composeHooks({ tick10Hz: [...brains.tick10Hz, this.spotting.step], tick1Hz: [...brains.tick1Hz, this.conquest.step, this.spawner.step, this.command] });
    this.state = 'active';
    this.result = {};
    for (const f of this.map.fixed) {
      if (f.modes && !f.modes.includes(this.mode)) continue;
      world.spawnUnit(f.unit, f.position[0], f.position[1], -(f.yawDeg * Math.PI) / 180);
    }
    this.spawner.wave(world);
    this.outside = 0;
  }

  command = (world: World) => {
    for (const c of this.commanders) c.step(world, this.conquest.points, this.conquest.elapsed);
    for (const [id, g] of world.groups) if (g.members.every(m => !world.unit(m.unit)?.alive)) world.groups.delete(id);
  };

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
      : { kind: 'heli', at: 'air', x: point.x, z: point.z, agl: AIR_SPAWN_AGL, headingDeg: point.headingDeg, kit, speed: AIR_SPAWN_SPEED };
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
    const grace = this.rules.boundaryGraceSec;
    if (before === 0 || Math.ceil(grace - before) !== Math.ceil(grace - this.outside)) {
      world.emit({ t: 'zone', inside: false, seconds: Math.max(0, grace - this.outside) });
    }
    if (this.outside >= this.rules.boundaryGraceSec) { this.outside = 0; world.killPlayer('outOfBounds'); }
  }

  onEvent(e: SimEvent, world: World) {
    if (e.t === 'crash') this.conquest.playerDied(this.opts.side, 'attackHeli');
    else if (e.t === 'identified') this.spotting.identified(e.id, world.time);
    else if (e.t === 'battleEnd') this.end(world, e.winner);
  }

  private end(world: World, winner: Winner) {
    if (this.state !== 'active') return;
    this.state = 'done';
    const c = this.conquest;
    this.result = {
      winner: winner === 'draw' ? 0 : winner === this.opts.side ? 1 : -1,
      coalition: Math.floor(c.tickets.coalition), veros: Math.floor(c.tickets.veros),
      seconds: Math.round(c.elapsed), byTime: c.endReason === 'time' ? 1 : 0,
    };
    world.emit({ t: 'objective', id: this.id, state: 'done' });
  }
}

export function createBattleSession(map: BattleMapDef, mode: 'conquest' | 'quick', opts: BattleOptions) {
  const runtime = new BattleRuntime(map, mode, opts);
  const session = new FlightSession(opts.seed, runtime, battleTerrainOptions(map), map.environment.seed);
  return { session, runtime };
}
