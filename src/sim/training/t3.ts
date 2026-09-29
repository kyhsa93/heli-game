import { Vector3 } from 'three';
import type { SimEvent } from '../events';
import { CLEAN_LOADOUT, type LoadoutDef } from '../heli/loadout';
import type { Objective, ObjectiveState } from '../objective';
import type { World } from '../world';
import { startAirborne } from './range';
import { TrainingT1 } from './t1';

export type T3Stage = 'gun' | 'rockets';

export const T3_GUN_TARGETS: readonly [string, number, number][] = [
  ['truck', -30, 10], ['truck', 20, 25], ['technical', 0, 40], ['technical', -20, -45], ['inf', 35, -30],
];
export const T3_ROCKET_OFFSET = 320;
export const T3_ROCKET_TARGETS: readonly [string, number, number][] = [
  ['inf', -12, 0], ['inf', 10, 8], ['inf', 0, -14], ['truck', 18, -10], ['technical', -20, 14],
];
export const T3_TARGETS = [...T3_GUN_TARGETS, ...T3_ROCKET_TARGETS];
export const T3_NEED = 7;
export const T3_GUN_NEED = 3;
export const T3_START_DISTANCE = 700;
export const T3_LOADOUT: LoadoutDef = { ...CLEAN_LOADOUT, pylons: { L2: 'hydra70', L1: 'empty', R1: 'empty', R2: 'hydra70' }, gunRounds: 1200, fuel: 60 };

export class TrainingT3 implements Objective {
  readonly id = 't3';
  state: ObjectiveState = 'active';
  result: Record<string, number> = {};
  step: T3Stage = 'gun';
  rangePad = -1;
  rocketCenter = new Vector3();
  readonly gunTargets = new Set<number>();
  readonly rocketTargets = new Set<number>();
  private destroyed = 0;
  private gunKills = 0;
  private shots = 0;
  private hits = 0;
  private startTime = 0;

  start(world: World) {
    world.applyLoadout(T3_LOADOUT);
    this.rangePad = TrainingT1.nearestPad(world);
    const pad = world.pads[this.rangePad], base = world.pads[0];
    world.target = { x: pad.x, y: pad.y, z: pad.z, name: pad.name };
    this.gunTargets.clear();
    this.rocketTargets.clear();
    for (const [type, dx, dz] of T3_GUN_TARGETS) {
      this.gunTargets.add(world.spawnUnit(type, pad.x + dx, pad.z + dz, world.rng() * Math.PI * 2, { missionId: `range-${type}`, group: 'gun' }).id);
    }
    const away = new Vector3(pad.x - base.x, 0, pad.z - base.z);
    if (away.lengthSq() < 1) away.set(0, 0, -1);
    away.normalize();
    this.rocketCenter.set(pad.x + away.x * T3_ROCKET_OFFSET, 0, pad.z + away.z * T3_ROCKET_OFFSET);
    for (const [type, dx, dz] of T3_ROCKET_TARGETS) {
      this.rocketTargets.add(world.spawnUnit(type, this.rocketCenter.x + dx, this.rocketCenter.z + dz, world.rng() * Math.PI * 2, { missionId: `range-${type}`, group: 'rockets' }).id);
    }
    this.rocketCenter.y = world.terrain.surfaceAt(this.rocketCenter.x, this.rocketCenter.z);
    startAirborne(world, new Vector3(pad.x, pad.y, pad.z), T3_START_DISTANCE, 45);
    this.state = 'active';
    this.step = 'gun';
    this.result = {};
    this.destroyed = this.gunKills = this.shots = this.hits = 0;
    this.startTime = world.time;
  }

  isTarget(id: number) {
    return this.gunTargets.has(id) || this.rocketTargets.has(id);
  }

  onEvent(e: SimEvent, world: World) {
    if (this.state !== 'active') return;
    if (e.t === 'fire' && e.owner === 0) this.shots++;
    else if (e.t === 'impact' && e.unit !== undefined && this.isTarget(e.unit)) this.hits++;
    else if (e.t === 'unitDestroyed' && this.isTarget(e.id)) {
      this.destroyed++;
      if (this.gunTargets.has(e.id)) this.gunKills++;
      if (this.step === 'gun' && this.gunKills >= T3_GUN_NEED) {
        this.step = 'rockets';
        world.target = { x: this.rocketCenter.x, y: this.rocketCenter.y, z: this.rocketCenter.z, name: 'RKT', area: true };
      }
      if (this.destroyed >= T3_NEED) {
        this.state = 'done';
        this.result = {
          timeSec: world.time - this.startTime,
          destroyed: this.destroyed,
          targets: this.gunTargets.size + this.rocketTargets.size,
          accuracy: this.shots ? (this.hits / this.shots) * 100 : 0,
        };
        world.emit({ t: 'objective', id: this.id, state: 'done' });
      }
    }
  }
}
