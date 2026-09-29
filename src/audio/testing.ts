interface Started { buffer: unknown; when: number; rate: number }

export class FakeParam {
  value = 0;
  targets: number[] = [];
  setTargetAtTime(v: number) { this.targets.push(v); this.value = v; return this; }
  setValueAtTime(v: number) { this.value = v; return this; }
  exponentialRampToValueAtTime() { return this; }
}

export function fakeCtx() {
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
