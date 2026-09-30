import { describe, expect, it } from 'vitest';
import { STEP, World } from '../world';
import { Intel } from './intel';
import { PlayerSpotting, SPOT_KEY_HOLD } from './spotting';
import { Targeting } from './targeting';
import { visualSight } from '../los';

function world() {
  const w = new World({ seed: 3, terrain: { features: [{ kind: 'flatten', center: [0, 0], radius: 1400 }], pads: [{ x: -1800, z: -1800, name: 'H' }] } });
  w.active = true;
  return w;
}

describe('spot key and shared marks (wiki 8.5, B2-10)', () => {
  it('marks the enemy under the crosshair for 10 s', () => {
    const w = world();
    const intel = new Intel();
    const s = new PlayerSpotting(intel);
    const e = w.spawnUnit('inf', 0, -150);
    w.spawnAvatar({ kind: 'soldier', x: 0, z: 0, headingDeg: 0, cls: 'assault' });
    w.soldierCommands.yaw = 0; w.soldierCommands.pitch = -0.005;
    for (let i = 0; i < 12; i++) w.step(STEP);
    w.spotRequest = true;
    s.step(w, 0.1);
    expect(w.spotRequest).toBe(false);
    expect(s.markers(w)).toEqual([e]);
    expect(intel.marked('coalition', w.time)).toEqual([e.id]);
    w.soldierCommands.yaw = Math.PI;
    w.soldier!.yaw = Math.PI;
    for (let t = 0; t < SPOT_KEY_HOLD + 0.5; t += 0.1) { w.time += 0.1; s.step(w, 0.1); }
    expect(s.markers(w)).toEqual([]);
    expect(intel.marked('coalition', w.time)).toEqual([]);
  });

  it('puts a marked enemy on friendly bots\' candidate list even when it is not among the nearest', () => {
    const run = (mark: boolean) => {
      const w = world();
      const intel = new Intel();
      const at = w.spawnUnit('c_inf_at', 0, 0);
      for (let i = 0; i < 4; i++) w.spawnUnit('inf', -60 + i * 40, -200);
      const tank = w.spawnUnit('tank', 0, -1200);
      for (let k = 0; k < 400 && !visualSight(w.terrain, at.pos.clone().setY(at.pos.y + 3.8), tank.pos.clone().setY(tank.pos.y + 4.4)).clear; k++) {
        const a = k * 0.07;
        tank.pos.set(Math.sin(a) * 1200, 0, -Math.cos(a) * 1200);
        tank.pos.y = w.terrain.surfaceAt(tank.pos.x, tank.pos.z);
      }
      if (mark) intel.mark('coalition', tank.id, 10);
      const t = new Targeting(intel);
      t.step(w);
      t.choose(w, at);
      return at.battle?.target?.kind === 'unit' ? at.battle.target.id === tank.id : false;
    };
    expect(run(false)).toBe(false);
    expect(run(true)).toBe(true);
  });
});
