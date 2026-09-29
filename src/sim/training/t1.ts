import { MS_TO_FPM } from '../../core/units';
import type { SimEvent } from '../events';
import { CLEAN_LOADOUT } from '../heli/loadout';
import type { Objective, ObjectiveState } from '../objective';
import type { World } from '../world';

export const T1_MAX_FPM = 500;

export class TrainingT1 implements Objective {
  readonly id = 't1';
  state: ObjectiveState = 'active';
  result: Record<string, number> = {};
  targetPad = -1;
  private startTime = 0;

  static nearestPad(world: World) {
    const base = world.pads[0];
    let best = -1, bestD = Infinity;
    world.pads.forEach((p, i) => {
      if (i === 0) return;
      const d = Math.hypot(p.x - base.x, p.z - base.z);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  start(world: World) {
    world.applyLoadout(CLEAN_LOADOUT);
    const best = TrainingT1.nearestPad(world);
    this.targetPad = best;
    const p = world.pads[best];
    world.target = { x: p.x, y: p.y, z: p.z, name: p.name };
    this.state = 'active';
    this.result = {};
    this.startTime = world.time;
  }

  onEvent(e: SimEvent, world: World) {
    if (this.state !== 'active' || e.t !== 'landed') return;
    const pad = world.padUnder();
    if (pad !== this.targetPad) {
      if (pad !== 0) world.emit({ t: 'advice', code: 'wrongPad' });
      return;
    }
    const fpm = e.descent * MS_TO_FPM;
    if (fpm > T1_MAX_FPM) { world.emit({ t: 'advice', code: 'landingTooHard', value: fpm }); return; }
    this.state = 'done';
    this.result = { timeSec: world.time - this.startTime, fpm };
    world.emit({ t: 'objective', id: this.id, state: 'done' });
  }
}


