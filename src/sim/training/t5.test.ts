import { describe, expect, it } from 'vitest';
import { FlightSession } from '../session';
import { descend } from '../testing';
import { STEP } from '../world';
import { T5_MAX_HITS, T5_THREATS, TrainingT5 } from './t5';

function begin(seed = 7) {
  const t5 = new TrainingT5();
  const s = new FlightSession(seed, t5);
  s.start();
  return { t5, s, w: s.world };
}

describe('training T5 — survival', () => {
  it('starts airborne toward the far pad with the threat belt in between', () => {
    const { w, t5 } = begin();
    expect(t5.threats.size).toBe(T5_THREATS.length);
    const base = w.pads[0], pad = w.pads[t5.targetPad];
    const route = Math.hypot(pad.x - base.x, pad.z - base.z);
    for (const id of t5.threats) {
      const u = w.unit(id)!;
      expect(u.passive).toBeFalsy();
      expect(Math.hypot(u.pos.x - base.x, u.pos.z - base.z)).toBeLessThan(route);
      expect(w.terrain.heightAt(u.pos.x, u.pos.z)).toBeGreaterThan(0);
    }
    expect(w.player.landed).toBe(false);
    expect(t5.step).toBe('rwr');
  });

  it('is completed by landing on the far pad with at most two hits', () => {
    const { w, s, t5 } = begin();
    for (const id of t5.threats) w.unit(id)!.passive = true;
    const pad = w.pads[t5.targetPad];
    w.player.pos.set(pad.x, pad.y + 30, pad.z);
    w.player.vel.set(0, 0, 0);
    expect(t5.step).toBe('land');
    w.emit({ t: 'playerHit', by: [...t5.threats][0], weapon: 'zu23x4', damage: 1 });
    const pilot = descend(w, { x: pad.x, z: pad.z });
    for (let i = 0; i < 120 * 60 && s.getSnapshot().mode === 'play'; i++) { pilot(); s.step(STEP); }
    expect(s.getSnapshot().mode).toBe('done');
    expect(s.getSnapshot().result).toMatchObject({ hits: 1, flares: 0 });
  });

  it('fails on the third hit', () => {
    const { w, s, t5 } = begin();
    for (let i = 0; i <= T5_MAX_HITS; i++) w.emit({ t: 'playerHit', by: [...t5.threats][0], weapon: 'zu23x4', damage: 0.1 });
    for (let i = 0; i < 120 * 3; i++) s.step(STEP);
    expect(s.getSnapshot().mode).toBe('over');
    expect(s.getSnapshot().failure).toBe('tooManyHits');
  });

  it('switches to the flare step while a missile is inbound', () => {
    const { w, t5 } = begin();
    const mp = [...t5.threats].map(id => w.unit(id)!).find(u => u.defId === 'manpads')!;
    mp.pos.set(w.player.pos.x + 1500, w.terrain.surfaceAt(w.player.pos.x + 1500, w.player.pos.z), w.player.pos.z);
    w.player.pos.y += 300;
    w.launchEnemyMissile(mp, 'sa_ir');
    for (let i = 0; i < 20; i++) w.step(STEP);
    expect(t5.step).toBe('flare');
  });
});
