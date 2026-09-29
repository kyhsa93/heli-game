import { Vector3 } from 'three';
import type { SimEvent } from '../events';
import { GEAR_Y } from '../heli/airframe';
import { CLEAN_LOADOUT, hoverCollective, type LoadoutDef } from '../heli/loadout';
import { updateQ } from '../heli/state';
import type { Objective, ObjectiveState } from '../objective';
import type { World } from '../world';
import { TrainingT1 } from './t1';

export const T3_TARGETS: readonly [string, number, number][] = [
  ['truck', -30, 10], ['truck', 20, 25], ['truck', 45, -5], ['truck', -50, -20],
  ['technical', 0, 40], ['technical', -20, -45], ['technical', 35, -40],
  ['fuel_truck', 60, 30],
  ['inf', -65, 25], ['inf', 10, -65],
];
export const T3_NEED = 7;
export const T3_START_DISTANCE = 700;
export const T3_LOADOUT: LoadoutDef = { ...CLEAN_LOADOUT, gunRounds: 1200, fuel: 60 };

export class TrainingT3 implements Objective {
  readonly id = 't3';
  state: ObjectiveState = 'active';
  result: Record<string, number> = {};
  rangePad = -1;
  private targets = new Set<number>();
  private destroyed = 0;
  private shots = 0;
  private hits = 0;
  private startTime = 0;

  start(world: World) {
    world.applyLoadout(T3_LOADOUT);
    this.rangePad = TrainingT1.nearestPad(world);
    const pad = world.pads[this.rangePad], base = world.pads[0];
    world.target = { x: pad.x, y: pad.y, z: pad.z, name: pad.name };
    this.targets.clear();
    for (const [type, dx, dz] of T3_TARGETS) {
      const u = world.spawnUnit(type, pad.x + dx, pad.z + dz, world.rng() * Math.PI * 2, { missionId: `range-${type}`, group: 'range' });
      this.targets.add(u.id);
    }
    const dir = new Vector3(base.x - pad.x, 0, base.z - pad.z).normalize();
    const x = pad.x + dir.x * T3_START_DISTANCE, z = pad.z + dir.z * T3_START_DISTANCE;
    let clear = Math.max(world.terrain.surfaceAt(x, z), pad.y);
    for (let k = 0; k <= 20; k++) clear = Math.max(clear, world.terrain.surfaceAt(x + (pad.x - x) * k / 20, z + (pad.z - z) * k / 20));
    const h = world.player;
    h.pos.set(x, clear - GEAR_Y + 45, z);
    h.vel.set(0, 0, 0);
    h.yaw = Math.atan2(-(pad.x - x), -(pad.z - z));
    h.pitch = h.roll = h.pRate = h.rRate = h.yRate = 0;
    h.engineOn = true; h.rpm = 1; h.landed = false;
    updateQ(h);
    world.controls.collective = hoverCollective(world.grossWeight);
    this.state = 'active';
    this.result = {};
    this.destroyed = this.shots = this.hits = 0;
    this.startTime = world.time;
  }

  onEvent(e: SimEvent, world: World) {
    if (this.state !== 'active') return;
    if (e.t === 'fire' && e.owner === 0) this.shots++;
    else if (e.t === 'impact' && e.unit !== undefined && this.targets.has(e.unit)) this.hits++;
    else if (e.t === 'unitDestroyed' && this.targets.has(e.id)) {
      this.destroyed++;
      if (this.destroyed >= T3_NEED) {
        this.state = 'done';
        this.result = {
          timeSec: world.time - this.startTime,
          destroyed: this.destroyed,
          targets: this.targets.size,
          accuracy: this.shots ? (this.hits / this.shots) * 100 : 0,
        };
        world.emit({ t: 'objective', id: this.id, state: 'done' });
      }
    }
  }
}
