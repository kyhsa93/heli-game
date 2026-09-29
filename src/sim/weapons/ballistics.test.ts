import { describe, expect, it } from 'vitest';
import { DEG } from '../../core/math';
import type { SimEvent } from '../events';
import { updateQ } from '../heli/state';
import { airborneAt } from '../testing';
import { STEP, World } from '../world';
import { predictGunImpact } from './ballistics';

describe('gun impact prediction (IHADSS)', () => {
  it('predicts where a round actually lands', () => {
    const w = new World({ seed: 7 });
    w.active = true;
    const events: SimEvent[] = [];
    w.events.onAny(e => events.push(e));
    const p = w.pads[0];
    airborneAt(w, p.x, p.z, p.y + 60);
    w.player.yaw = 0.4; updateQ(w.player);
    w.commands.aim = { yaw: 0.1, pitch: -12 * DEG };
    w.arms = { ...w.arms, gunTimer: 0 };
    const pred = predictGunImpact(w, STEP)!;
    expect(pred).not.toBeNull();
    w.commands.fire = true;
    w.step(STEP);
    w.commands.fire = false;
    const origDisp = w.projectiles[0];
    expect(origDisp).toBeDefined();
    for (let i = 0; i < 600 && w.projectiles.length; i++) w.step(STEP);
    const impact = events.find(e => e.t === 'impact') as { pos: { distanceTo(v: unknown): number } } | undefined;
    expect(impact).toBeDefined();
    const miss = impact!.pos.distanceTo(pred.point);
    expect(miss).toBeLessThan(0.006 * pred.range + 2);
  });

  it('returns nothing outside the gimbal limits or when no ground is within range', () => {
    const w = new World({ seed: 7 });
    const p = w.pads[0];
    airborneAt(w, p.x, p.z, p.y + 60);
    w.commands.aim = { yaw: 100 * DEG, pitch: 0 };
    expect(predictGunImpact(w)).toBeNull();
    airborneAt(w, p.x, p.z, 3000);
    w.commands.aim = { yaw: 0, pitch: 10 * DEG };
    expect(predictGunImpact(w)).toBeNull();
  });
});
