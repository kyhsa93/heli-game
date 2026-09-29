import type { Vector3 } from 'three';
import type { SimEvent } from '../sim/events';

export const SOUND_SPEED = 340;

export type SampleId = 'gun_shot' | 'rocket_launch' | 'hellfire_launch' | 'impact_metal' | 'impact_ground' | 'explosion_near' | 'explosion_fire';

export class SfxPlayer {
  private lastGun = -1;
  private voices = 0;
  private noise: AudioBuffer;

  constructor(
    private ctx: AudioContext,
    private out: AudioNode,
    private samples: Partial<Record<SampleId, AudioBuffer>> = {},
    private rnd: () => number = Math.random,
    readonly maxVoices = 24,
  ) {
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = this.rnd() * 2 - 1;
  }

  setSamples(samples: Partial<Record<SampleId, AudioBuffer>>) {
    this.samples = { ...this.samples, ...samples };
  }

  get activeVoices() { return this.voices; }

  onEvent(e: SimEvent, listener: Vector3) {
    switch (e.t) {
      case 'fire':
        if (e.owner === 0 && e.weapon === 'agm114k') {
          this.play('hellfire_launch', 0.75, 1, 0, 20000, 1.2);
        } else if (e.owner === 0 && e.weapon === 'hydra70') {
          this.play('rocket_launch', 0.6, 1.25 + this.rnd() * 0.1, 0, 20000, 0.5);
        } else if (e.owner === 0) {
          if (this.ctx.currentTime - this.lastGun < 0.085) return;
          this.lastGun = this.ctx.currentTime;
          this.play('gun_shot', 0.35, 0.95 + this.rnd() * 0.1, 0, 20000, 0.12);
        }
        break;
      case 'impact': {
        const d = e.pos.distanceTo(listener);
        if (d > 2500) return;
        this.play(e.ground ? 'impact_ground' : 'impact_metal', 0.9 / (1 + d / 120), 0.9 + this.rnd() * 0.2, d / SOUND_SPEED, 20000 / (1 + d / 300), 0.08);
        break;
      }
      case 'explosion': {
        const d = e.pos.distanceTo(listener);
        const id: SampleId = this.rnd() < 0.5 ? 'explosion_near' : 'explosion_fire';
        this.play(id, Math.min(1.2, 0.4 + e.size / 20) / (1 + d / 250), e.size > 10 ? 0.85 : 1, d / SOUND_SPEED, 18000 / (1 + d / 400), 0.9);
        break;
      }
      case 'unitDestroyed': break;
      default: break;
    }
  }

  private play(id: SampleId, gain: number, rate: number, delay: number, lowpass: number, synthLength: number) {
    if (this.voices >= this.maxVoices || gain < 0.01) return;
    const buffer = this.samples[id];
    const src = this.ctx.createBufferSource();
    src.buffer = buffer ?? this.noise;
    src.playbackRate.value = rate;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.max(200, lowpass);
    const g = this.ctx.createGain();
    const at = this.ctx.currentTime + delay;
    g.gain.value = gain;
    if (!buffer) {
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + synthLength);
    }
    src.connect(filter).connect(g).connect(this.out);
    this.voices++;
    src.onended = () => { this.voices--; };
    src.start(at, 0, buffer ? undefined : synthLength);
  }
}
