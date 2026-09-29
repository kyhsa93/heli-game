import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEG } from '../core/math';
import { updateQ } from '../sim/heli/state';
import { airborneAt } from '../sim/testing';
import { STEP, World } from '../sim/world';
import { BURN_SECONDS, Effects } from './effects';

describe('Effects pool (M1-5)', () => {
  it('stays within its pools through a minute of firing and lets wrecks burn out', () => {
    const w = new World({ seed: 7 });
    w.active = true;
    const fx = new Effects(new THREE.Texture());
    w.events.onAny(e => fx.onEvent(e, w));
    const p = w.pads[0];
    airborneAt(w, p.x, p.z, p.y + 60);
    w.player.yaw = 0; updateQ(w.player);
    for (let i = 0; i < 8; i++) w.spawnUnit('truck', p.x + (i - 4) * 12, p.z - 150);
    w.commands.aim = { yaw: 0, pitch: -20 * DEG };
    w.commands.fire = true;
    w.arms.gunAmmo = 100000;
    let peak = 0;
    for (let frame = 0; frame < 60 * 60; frame++) {
      for (let s = 0; s < 2; s++) {
        w.controls.collective = Math.min(1, Math.max(0, 1 / 1.7 - w.player.vel.y * 0.3));
        w.step(STEP);
      }
      fx.update(STEP * 2, w);
      peak = Math.max(peak, fx.activeParticles);
      w.commands.aim.yaw = Math.sin(frame / 60) * 0.3;
    }
    expect(w.arms.shots).toBeGreaterThan(500);
    expect(peak).toBeLessThanOrEqual(fx.capacity);
    expect(peak).toBeGreaterThan(50);
    w.commands.fire = false;
    const burning = fx.burningCount;
    for (let frame = 0; frame < (BURN_SECONDS + 5) * 60; frame++) { w.step(STEP); fx.update(1 / 60, w); }
    expect(fx.burningCount).toBe(0);
    expect(burning).toBeGreaterThanOrEqual(0);
  });
});
