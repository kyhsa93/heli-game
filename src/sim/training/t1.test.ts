import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../events';
import { GEAR_Y } from '../heli/airframe';
import { FlightSession } from '../session';
import { airborneAt, descend } from '../testing';
import { TrainingT1 } from './t1';

function setup() {
  const t1 = new TrainingT1();
  const session = new FlightSession(7, t1);
  const events: SimEvent[] = [];
  session.world.events.onAny(e => events.push(e));
  session.start();
  return { t1, session, world: session.world, events };
}

function step(session: FlightSession, seconds: number, each?: () => void) {
  for (let i = 0; i < seconds * 120; i++) { each?.(); session.step(1 / 120); }
}

describe('training T1', () => {
  it('targets the pad nearest to base', () => {
    const { t1, world } = setup();
    const base = world.pads[0], target = world.pads[t1.targetPad];
    for (const [i, p] of world.pads.entries()) {
      if (i === 0) continue;
      expect(Math.hypot(target.x - base.x, target.z - base.z)).toBeLessThanOrEqual(Math.hypot(p.x - base.x, p.z - base.z));
    }
    expect(world.target).toMatchObject({ name: target.name });
  });

  it('completes after a soft landing on the target pad and shows the result', () => {
    const { t1, session, world } = setup();
    const p = world.pads[t1.targetPad];
    airborneAt(world, p.x, p.z, p.y - GEAR_Y + 8);
    step(session, 25, descend(world, p));
    expect(t1.state).toBe('done');
    expect(t1.result.fpm).toBeLessThanOrEqual(500);
    expect(session.getSnapshot().mode).toBe('done');
    expect(session.getSnapshot().result).toEqual(t1.result);
  });

  it('does not count a hard (but survivable) landing and gives advice', () => {
    const { t1, session, world, events } = setup();
    const p = world.pads[t1.targetPad];
    airborneAt(world, p.x, p.z, p.y - GEAR_Y + 0.03);
    world.player.vel.y = -2.7;
    world.controls.collective = 0.3;
    step(session, 1);
    const landed = events.find(e => e.t === 'landed');
    expect(landed).toBeDefined();
    expect((landed as { descent: number }).descent * 196.85).toBeGreaterThan(500);
    expect(world.player.alive).toBe(true);
    expect(world.player.landed).toBe(true);
    expect(t1.state).toBe('active');
    expect(events.find(e => e.t === 'advice')).toMatchObject({ code: 'landingTooHard' });
  });

  it('advises when landing on another pad', () => {
    const { t1, session, world, events } = setup();
    const other = world.pads.findIndex((_, i) => i !== 0 && i !== t1.targetPad);
    const p = world.pads[other];
    airborneAt(world, p.x, p.z, p.y - GEAR_Y + 8);
    step(session, 25, descend(world, p));
    expect(t1.state).toBe('active');
    expect(events.find(e => e.t === 'advice')).toMatchObject({ code: 'wrongPad' });
  });
});
