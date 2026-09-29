import { Vector3 } from 'three';
import type { SimEvent } from '../events';
import { CLEAN_LOADOUT, type LoadoutDef } from '../heli/loadout';
import type { Objective, ObjectiveState } from '../objective';
import { lineOfSight } from '../sensors/laser';
import { tadsPosition } from '../sensors/tads';
import type { World } from '../world';
import { startAirborne } from './range';

export type T4Stage = 'tads' | 'identify' | 'lobl' | 'loal';

export const T4_TANKS: readonly [number, number][] = [[-40, 0], [0, 30], [45, -10], [10, -50]];
export const T4_NEED = 4;
export const T4_START_DISTANCE = 2200;
export const T4_LOADOUT: LoadoutDef = { ...CLEAN_LOADOUT, pylons: { L2: 'empty', L1: 'agm114k', R1: 'agm114k', R2: 'empty' }, gunRounds: 300, fuel: 60 };

export class TrainingT4 implements Objective {
  readonly id = 't4';
  state: ObjectiveState = 'active';
  result: Record<string, number> = {};
  failure?: string;
  targetPad = -1;
  readonly tanks = new Set<number>();
  private kills = 0;
  private fired = 0;
  private loalKills = 0;
  private startTime = 0;
  private missileModes = new Map<number, 'lobl' | 'loal'>();
  private world: World | null = null;
  private identified = false;
  private lastHit: { unit: number; mode?: 'lobl' | 'loal' } | null = null;

  get step(): T4Stage {
    if (this.kills > 0) return 'loal';
    if (this.identified) return 'lobl';
    return this.world?.tads.active ? 'identify' : 'tads';
  }

  static farPad(world: World) {
    const base = world.pads[0];
    let best = 1, bestD = -1;
    world.pads.forEach((p, i) => {
      if (i === 0) return;
      const d = Math.hypot(p.x - base.x, p.z - base.z);
      if (d > bestD) { bestD = d; best = i; }
    });
    return best;
  }

  start(world: World) {
    world.applyLoadout(T4_LOADOUT);
    this.targetPad = TrainingT4.farPad(world);
    const pad = world.pads[this.targetPad];
    world.target = { x: pad.x, y: pad.y, z: pad.z, name: pad.name };
    this.tanks.clear();
    this.missileModes.clear();
    const center = new Vector3(pad.x, pad.y, pad.z);
    const heading = Math.atan2(world.pads[0].x - pad.x, world.pads[0].z - pad.z);
    startAirborne(world, center, Math.min(T4_START_DISTANCE, Math.hypot(pad.x - world.pads[0].x, pad.z - world.pads[0].z) + 400), 60);
    const spots = T4_TANKS.map(([dx, dz]) => new Vector3(pad.x + 60 + dx, 0, pad.z + 60 + dz));
    const eye = () => tadsPosition(world.player);
    const visible = (p: Vector3) => lineOfSight(world.terrain, eye(), p.clone().setY(world.terrain.surfaceAt(p.x, p.z) + 0.4));
    for (let climb = 0; climb < 250 && !spots.every(visible); climb += 10) world.player.pos.y += 10;
    for (let k = 0; k < spots.length; k++) {
      if (visible(spots[k])) continue;
      for (let r = 40; r <= 400 && !visible(spots[k]); r += 20) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
          const q = new Vector3(pad.x + Math.sin(a + k) * r, 0, pad.z + Math.cos(a + k) * r);
          if (world.terrain.heightAt(q.x, q.z) < 1 || spots.some(o => o !== spots[k] && o.distanceTo(q) < 25)) continue;
          if (visible(q)) { spots[k] = q; break; }
        }
      }
    }
    for (const p of spots) this.tanks.add(world.spawnUnit('tank', p.x, p.z, heading, { missionId: 't4-tank', group: 'armor' }).id);
    this.world = world;
    this.identified = false;
    this.lastHit = null;
    this.state = 'active';
    this.failure = undefined;
    this.result = {};
    this.kills = this.fired = this.loalKills = 0;
    this.startTime = world.time;
  }

  onEvent(e: SimEvent, world: World) {
    if (this.state !== 'active') return;
    switch (e.t) {
      case 'identified':
        if (this.tanks.has(e.id)) this.identified = true;
        break;
      case 'fire':
        if (e.owner === 0 && e.weapon === 'agm114k') {
          this.fired++;
          const m = world.missiles[world.missiles.length - 1];
          if (m) this.missileModes.set(m.id, m.mode);
        }
        break;
      case 'missileLost':
        if (e.owner === 0 && e.reason === 'spotLost') {
          this.state = 'failed';
          this.failure = 'laserBreak';
          world.emit({ t: 'objective', id: this.id, state: 'failed', reason: 'laserBreak' });
        }
        break;
      case 'impact':
        if (e.missile !== undefined && e.unit !== undefined && this.tanks.has(e.unit)) this.lastHit = { unit: e.unit, mode: this.missileModes.get(e.missile) };
        break;
      case 'unitDestroyed':
        if (!this.tanks.has(e.id)) break;
        this.kills++;
        if (this.lastHit?.unit === e.id && this.lastHit.mode === 'loal') this.loalKills++;
        if (this.kills >= T4_NEED) {
          this.state = 'done';
          this.result = { timeSec: world.time - this.startTime, destroyed: this.kills, targets: this.tanks.size, missiles: this.fired, loal: this.loalKills };
          world.emit({ t: 'objective', id: this.id, state: 'done' });
        }
        break;
      default: break;
    }
  }
}
