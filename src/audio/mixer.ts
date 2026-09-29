export type Bus = 'engine' | 'weapons' | 'warnings' | 'radio';

export const BUS_LEVELS: Readonly<Record<Bus, number>> = { engine: 0.85, weapons: 1, warnings: 0.9, radio: 0.9 };
export const DUCK_DEPTH: Readonly<Record<Bus, number>> = { engine: 0.45, weapons: 0.6, warnings: 1, radio: 1 };
export const DUCK_ATTACK = 0.05;
export const DUCK_RELEASE = 0.6;
export const RADIO_BAND: readonly [number, number] = [320, 3200];

export function busGains(duck: number): Record<Bus, number> {
  const d = Math.min(1, Math.max(0, duck));
  const out = {} as Record<Bus, number>;
  for (const b of Object.keys(BUS_LEVELS) as Bus[]) out[b] = BUS_LEVELS[b] * (1 - d * (1 - DUCK_DEPTH[b]));
  return out;
}

export function distanceGain(d: number, ref: number, rolloff = 1, max = Infinity) {
  if (d >= max) return 0;
  if (d <= ref) return 1;
  return ref / (ref + rolloff * (d - ref));
}

export function distanceLowpass(d: number, near = 20000, halfAt = 600) {
  return Math.max(400, near / (1 + d / halfAt));
}

export class Mixer {
  readonly buses: Record<Bus, GainNode>;
  private ducked = false;

  constructor(private ctx: AudioContext, out: AudioNode) {
    const make = (b: Bus) => { const g = ctx.createGain(); g.gain.value = BUS_LEVELS[b]; return g; };
    this.buses = { engine: make('engine'), weapons: make('weapons'), warnings: make('warnings'), radio: make('radio') };
    for (const b of ['engine', 'weapons', 'warnings'] as Bus[]) this.buses[b].connect(out);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = RADIO_BAND[0];
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = RADIO_BAND[1];
    const drive = ctx.createWaveShaper();
    drive.curve = radioCurve();
    this.buses.radio.connect(hp).connect(lp).connect(drive).connect(out);
  }

  duck(on: boolean) {
    if (on === this.ducked) return;
    this.ducked = on;
    const g = busGains(on ? 1 : 0), t = this.ctx.currentTime;
    for (const b of Object.keys(g) as Bus[]) this.buses[b].gain.setTargetAtTime(g[b], t, on ? DUCK_ATTACK : DUCK_RELEASE);
  }

  get isDucked() { return this.ducked; }
}

function radioCurve(n = 256) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
  return c;
}
