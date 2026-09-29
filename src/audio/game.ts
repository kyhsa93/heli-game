import type { Vector3 } from 'three';
import type { SimEvent } from '../sim/events';
import { RotorAudio, type AudioState } from './rotor';
import { SfxPlayer, type SampleId } from './sfx';

export const AUDIO_ASSETS: Record<string, string> = {
  'audio.rotor_loop': 'rotor_interior_loop',
  'audio.engine_start': 'engine_start',
  'audio.gun_shot': 'gun_shot',
  'audio.rocket_launch': 'rocket_launch',
  'audio.hellfire_launch': 'hellfire_launch',
  'audio.explosion_near': 'explosion_near',
  'audio.explosion_fire': 'explosion_fire',
  'audio.impact_metal': 'impact_metal',
  'audio.impact_ground': 'impact_ground',
};

export class GameAudio {
  readonly rotor: RotorAudio;
  readonly sfx: SfxPlayer;
  private buffers: Record<string, AudioBuffer> = {};

  constructor(ctx?: AudioContext) {
    this.rotor = new RotorAudio(ctx);
    this.sfx = new SfxPlayer(this.rotor.context, this.rotor.output);
  }

  async loadSamples(get: (id: string) => ArrayBuffer | undefined) {
    const ctx = this.rotor.context;
    await Promise.all(Object.entries(AUDIO_ASSETS).map(async ([id, name]) => {
      const raw = get(id);
      if (!raw) return;
      try { this.buffers[name] = await ctx.decodeAudioData(raw.slice(0)); } catch { /* keep synthesis fallback */ }
    }));
    if (this.buffers.rotor_interior_loop) this.rotor.setRotorLoop(this.buffers.rotor_interior_loop);
    const s: Partial<Record<SampleId, AudioBuffer>> = {};
    for (const k of ['gun_shot', 'rocket_launch', 'hellfire_launch', 'impact_metal', 'impact_ground', 'explosion_near', 'explosion_fire'] as SampleId[]) if (this.buffers[k]) s[k] = this.buffers[k];
    this.sfx.setSamples(s);
  }

  onEvent(e: SimEvent, listener: Vector3) {
    if (e.t === 'engine') {
      if (e.on) this.rotor.playEngineStart(this.buffers.engine_start);
      else this.rotor.stopEngineStart();
    }
    this.sfx.onEvent(e, listener);
  }

  update(s: AudioState) { this.rotor.update(s); }
  resume() { return this.rotor.resume(); }
  toggleMute() { return this.rotor.toggleMute(); }
  dispose() { this.rotor.dispose(); }
}
