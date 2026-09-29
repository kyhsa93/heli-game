import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GameAudio } from './game';
import { BUS_LEVELS, busGains, distanceGain, distanceLowpass, Mixer, RADIO_BAND } from './mixer';
import { fakeCtx } from './testing';

const asCtx = (c: ReturnType<typeof fakeCtx>) => c as unknown as AudioContext;

describe('mixer (07 7.7)', () => {
  it('sets each bus to its level and ducks engine and weapons under warnings', () => {
    expect(busGains(0)).toEqual(BUS_LEVELS);
    const d = busGains(1);
    expect(d.engine).toBeCloseTo(BUS_LEVELS.engine * 0.45, 5);
    expect(d.weapons).toBeCloseTo(BUS_LEVELS.weapons * 0.6, 5);
    expect(d.warnings).toBe(BUS_LEVELS.warnings);
    expect(d.radio).toBe(BUS_LEVELS.radio);
    expect(busGains(0.5).engine).toBeGreaterThan(d.engine);
    expect(busGains(7)).toEqual(d);
  });

  it('builds the four buses with a band-limited, driven radio path', () => {
    const c = fakeCtx();
    const m = new Mixer(asCtx(c), c.destination as unknown as AudioNode);
    expect(Object.keys(m.buses)).toEqual(['engine', 'weapons', 'warnings', 'radio']);
    expect(RADIO_BAND).toEqual([320, 3200]);
    m.duck(true);
    expect(m.isDucked).toBe(true);
    m.duck(false);
    expect(m.isDucked).toBe(false);
  });

  it('falls off with distance like an inverse-distance model and cuts off past the limit', () => {
    expect(distanceGain(50, 100)).toBe(1);
    expect(distanceGain(200, 100)).toBeCloseTo(0.5, 5);
    expect(distanceGain(1100, 100, 0.5)).toBeCloseTo(100 / 600, 5);
    expect(distanceGain(3000, 100, 1, 2500)).toBe(0);
    expect(distanceLowpass(0)).toBe(20000);
    expect(distanceLowpass(600)).toBe(10000);
    expect(distanceLowpass(1e6)).toBe(400);
  });

  it('ducks the mix while a voice warning speaks, then lets it back up', () => {
    const c = fakeCtx();
    const said: string[] = [];
    const audio = new GameAudio(asCtx(c), { speak: (t: string) => { said.push(t); } });
    audio.voice.enabled = true;
    audio.onEvent({ t: 'missileWarning', id: 1, kind: 'ir', from: new Vector3(), owner: 2 }, new Vector3());
    audio.update({ rpm: 1, collective: 0.5, airspeed: 0, warn: false });
    expect(said).toHaveLength(1);
    expect(audio.rotor.mixer.isDucked).toBe(true);
    c.currentTime += 5;
    audio.update({ rpm: 1, collective: 0.5, airspeed: 0, warn: false });
    expect(audio.rotor.mixer.isDucked).toBe(false);
    audio.update({ rpm: 1, collective: 0.5, airspeed: 0, warn: true });
    expect(audio.rotor.mixer.isDucked).toBe(true);
  });
});
