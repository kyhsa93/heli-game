import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GameAudio } from './game';
import { SfxPlayer, SOUND_SPEED } from './sfx';

interface Started { buffer: unknown; when: number; rate: number }

class FakeParam {
  value = 0;
  targets: number[] = [];
  setTargetAtTime(v: number) { this.targets.push(v); this.value = v; return this; }
  setValueAtTime(v: number) { this.value = v; return this; }
  exponentialRampToValueAtTime() { return this; }
}

function fakeCtx() {
  const started: Started[] = [];
  const node = () => ({ connect(n: unknown) { return n; } });
  const buffer = (len: number, sr = 22050) => {
    const data = new Float32Array(len);
    return { sampleRate: sr, length: len, duration: len / sr, getChannelData: () => data };
  };
  const ctx = {
    sampleRate: 22050,
    currentTime: 10,
    destination: node(),
    started,
    createGain: () => ({ ...node(), gain: new FakeParam() }),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: new FakeParam(), Q: new FakeParam() }),
    createOscillator: () => ({ ...node(), type: '', frequency: new FakeParam(), start() {} }),
    createBuffer: (_c: number, len: number, sr: number) => buffer(len, sr),
    createBufferSource: () => {
      const src = {
        ...node(), buffer: null as unknown, loop: false, loopStart: 0, loopEnd: 0, playbackRate: new FakeParam(), onended: null as null | (() => void),
        start(when = 0) { started.push({ buffer: src.buffer, when, rate: src.playbackRate.value }); },
        stop() {},
      };
      src.playbackRate.value = 1;
      return src;
    },
    decodeAudioData: async (ab: ArrayBuffer) => { const b = buffer(22050); b.getChannelData()[100] = 0.5; (b as unknown as { tag: number }).tag = ab.byteLength; return b; },
    resume: async () => {},
    close: async () => {},
  };
  return ctx;
}

type Ctx = ReturnType<typeof fakeCtx>;
const asCtx = (c: Ctx) => c as unknown as AudioContext;

describe('SfxPlayer', () => {
  it('plays the gun sample for the player, at most every 85 ms', () => {
    const c = fakeCtx();
    const gun = c.createBuffer(1, 100, 22050);
    const sfx = new SfxPlayer(asCtx(c), c.destination as unknown as AudioNode, { gun_shot: gun as unknown as AudioBuffer });
    const fire = { t: 'fire' as const, weapon: 'gun30', pos: new Vector3(), dir: new Vector3(0, 0, -1), owner: 0, tracer: false };
    sfx.onEvent(fire, new Vector3());
    sfx.onEvent(fire, new Vector3());
    expect(c.started).toHaveLength(1);
    expect(c.started[0].buffer).toBe(gun);
    c.currentTime += 0.1;
    sfx.onEvent(fire, new Vector3());
    expect(c.started).toHaveLength(2);
    sfx.onEvent({ ...fire, owner: 7 }, new Vector3());
    expect(c.started).toHaveLength(2);
  });

  it('plays the rocket launch sample for each player rocket, without the gun throttle', () => {
    const c = fakeCtx();
    const rocket = c.createBuffer(1, 100, 22050);
    const sfx = new SfxPlayer(asCtx(c), c.destination as unknown as AudioNode, { rocket_launch: rocket as unknown as AudioBuffer });
    const fire = { t: 'fire' as const, weapon: 'hydra70', pos: new Vector3(), dir: new Vector3(0, 0, -1), owner: 0, tracer: true };
    sfx.onEvent(fire, new Vector3());
    sfx.onEvent(fire, new Vector3());
    expect(c.started).toHaveLength(2);
    expect(c.started.every(s => s.buffer === rocket)).toBe(true);
  });

  it('delays distant explosions by the speed of sound', () => {
    const c = fakeCtx();
    const sfx = new SfxPlayer(asCtx(c), c.destination as unknown as AudioNode, {}, () => 0.1);
    sfx.onEvent({ t: 'explosion', pos: new Vector3(680, 0, 0), size: 6 }, new Vector3());
    expect(c.started[0].when).toBeCloseTo(10 + 680 / SOUND_SPEED, 5);
  });

  it('falls back to synthesised noise when a sample is missing', () => {
    const c = fakeCtx();
    const sfx = new SfxPlayer(asCtx(c), c.destination as unknown as AudioNode);
    sfx.onEvent({ t: 'impact', weapon: 'gun30', pos: new Vector3(10, 0, 0), ground: true }, new Vector3());
    expect(c.started).toHaveLength(1);
    expect(c.started[0].buffer).toBeTruthy();
  });

  it('ignores impacts too far away to hear', () => {
    const c = fakeCtx();
    const sfx = new SfxPlayer(asCtx(c), c.destination as unknown as AudioNode);
    sfx.onEvent({ t: 'impact', weapon: 'gun30', pos: new Vector3(4000, 0, 0), ground: true }, new Vector3());
    expect(c.started).toHaveLength(0);
  });
});

describe('GameAudio', () => {
  it('switches the rotor to the recording once decoded and plays the engine start clip', async () => {
    const c = fakeCtx();
    const audio = new GameAudio(asCtx(c));
    expect(audio.rotor.usingRecording).toBe(false);
    await audio.loadSamples(id => (id === 'audio.rotor_loop' || id === 'audio.engine_start' ? new ArrayBuffer(8) : undefined));
    expect(audio.rotor.usingRecording).toBe(true);
    const before = c.started.length;
    audio.onEvent({ t: 'engine', on: true }, new Vector3());
    expect(c.started.length).toBe(before + 1);
  });

  it('raises the loop pitch with rotor rpm', async () => {
    const c = fakeCtx();
    const audio = new GameAudio(asCtx(c));
    await audio.loadSamples(id => (id === 'audio.rotor_loop' ? new ArrayBuffer(8) : undefined));
    const loop = (audio.rotor as unknown as { loop: { src: { playbackRate: FakeParam } } }).loop;
    audio.update({ rpm: 0.2, collective: 0, airspeed: 0, warn: false });
    const low = loop.src.playbackRate.value;
    audio.update({ rpm: 1, collective: 0.6, airspeed: 0, warn: false });
    expect(loop.src.playbackRate.value).toBeGreaterThan(low);
    expect(loop.src.playbackRate.value).toBeCloseTo(1, 5);
  });
});
