import { Vector3 } from 'three';
import type { SimEvent } from '../events';
import { CLEAN_LOADOUT, type LoadoutDef } from '../heli/loadout';
import type { Objective, ObjectiveState } from '../objective';
import { aseThreats, missileInbound } from '../sensors/ase';
import type { World } from '../world';
import { startAirborne } from './range';
import { TrainingT4 } from './t4';

export type T5Stage = 'rwr' | 'mask' | 'flare' | 'land';

export const T5_MAX_HITS = 2;
export const T5_RWR_SECONDS = 8;
export const T5_THREATS: readonly [string, number, number][] = [
  ['spaag', 0.4, -250], ['manpads', 0.5, 280], ['technical', 0.62, -120], ['sam_short', 0.72, 450],
];
export const T5_LOADOUT: LoadoutDef = { ...CLEAN_LOADOUT, gunRounds: 300, fuel: 70 };

export class TrainingT5 implements Objective {
  readonly id = 't5';
  state: ObjectiveState = 'active';
  result: Record<string, number> = {};
  failure?: string;
  targetPad = -1;
  hits = 0;
  readonly threats = new Set<number>();
  private world: World | null = null;
  private startTime = 0;
  private flaresAtStart = 0;
  private sawThreat = false;

  get step(): T5Stage {
    const w = this.world;
    if (!w) return 'rwr';
    if (missileInbound(w)) return 'flare';
    const h = w.player, pad = w.pads[this.targetPad];
    const left = Math.hypot(pad.x - h.pos.x, pad.z - h.pos.z);
    if (left < 600) return 'land';
    if (!this.sawThreat && w.time - this.startTime >= T5_RWR_SECONDS && aseThreats(w).length) this.sawThreat = true;
    return this.sawThreat ? 'mask' : 'rwr';
  }

  start(world: World) {
    this.world = world;
    world.applyLoadout(T5_LOADOUT);
    this.targetPad = TrainingT4.farPad(world);
    const base = world.pads[0], pad = world.pads[this.targetPad];
    world.target = { x: pad.x, y: pad.y, z: pad.z, name: pad.name };
    this.threats.clear();
    const along = new Vector3(pad.x - base.x, 0, pad.z - base.z);
    const len = along.length();
    along.normalize();
    const side = new Vector3(-along.z, 0, along.x);
    for (const [defId, k, off] of T5_THREATS) {
      const p = new Vector3(base.x, 0, base.z).addScaledVector(along, len * k).addScaledVector(side, off);
      for (let tries = 0; tries < 8 && world.terrain.heightAt(p.x, p.z) < 1; tries++) p.addScaledVector(side, off >= 0 ? 60 : -60);
      const u = world.spawnUnit(defId, p.x, p.z, Math.atan2(along.x, along.z), { missionId: `t5-${defId}`, group: 't5' });
      this.threats.add(u.id);
    }
    startAirborne(world, new Vector3(pad.x, pad.y, pad.z), len - 250, 40, new Vector3(base.x, 0, base.z));
    this.state = 'active';
    this.failure = undefined;
    this.result = {};
    this.hits = 0;
    this.sawThreat = false;
    this.flaresAtStart = world.cm.flares;
    this.startTime = world.time;
  }

  private hit(world: World) {
    this.hits++;
    if (this.hits > T5_MAX_HITS) {
      this.state = 'failed';
      this.failure = 'tooManyHits';
      world.emit({ t: 'objective', id: this.id, state: 'failed', reason: 'tooManyHits' });
    }
  }

  onEvent(e: SimEvent, world: World) {
    if (this.state !== 'active') return;
    if (e.t === 'playerHit') this.hit(world);
    else if (e.t === 'missileEnd' && e.hit) this.hit(world);
    else if (e.t === 'landed' && world.padUnder() === this.targetPad) {
      this.state = 'done';
      this.result = { timeSec: world.time - this.startTime, hits: this.hits, flares: this.flaresAtStart - world.cm.flares };
      world.emit({ t: 'objective', id: this.id, state: 'done' });
    }
  }
}
