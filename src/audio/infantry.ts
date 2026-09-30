import type { Vector3 } from 'three';
import type { SimEvent } from '../sim/events';
import { distanceGain, distanceLowpass } from './mixer';
import { SOUND_SPEED, type SfxPlayer } from './sfx';

export type FireClass = 'small' | 'heavy' | 'cannon';

export const FIRE_CLASS: Readonly<Record<string, FireClass>> = {
  rifle: 'small', g_rifle: 'small', lmg: 'small', g_lmg: 'small', g_coax: 'small', g_sniper: 'small',
  hmg: 'heavy', g_hmg: 'heavy', aa_mg: 'heavy', ac30: 'heavy', g_ac30: 'heavy', g_aaa: 'heavy', zu23x2: 'heavy', zu23x4: 'heavy', heli_gun: 'heavy', jet_gun: 'heavy',
  g_main: 'cannon', g_at: 'cannon',
};

export const FIRE_RANGE: Readonly<Record<FireClass, { ref: number; max: number }>> = {
  small: { ref: 40, max: 1500 },
  heavy: { ref: 80, max: 3000 },
  cannon: { ref: 150, max: 6000 },
};

export const BOT_FIRE_GAP = 0.05;

export const STEP_LENGTH = { stand: 1.5, crouch: 1.0, prone: 0.7 } as const;
export const STEP_GAIN = { stand: 0.22, crouch: 0.12, prone: 0.07 } as const;
export const STEP_MIN_SPEED = 0.5;

export interface FootState { dt: number; speed: number; stance: keyof typeof STEP_LENGTH; onGround: boolean; reloading: boolean }

export class InfantryAudio {
  private botFireAt: Record<FireClass, number> = { small: -1, heavy: -1, cannon: -1 };
  private stepDist = 0;
  private reloading = false;

  constructor(private sfx: SfxPlayer, private now: () => number, private rnd: () => number = Math.random) {}

  onEvent(e: SimEvent, listener: Vector3, foot: boolean) {
    if (e.t === 'fire') {
      if (e.owner === 0) {
        if (e.weapon === 'rifle') this.sfx.clip('gun_shot', { gain: 0.5, rate: 1.65 + this.rnd() * 0.1, length: 0.16, highpass: 400 });
        else if (e.weapon === 'grenade') this.sfx.clip('rocket_launch', { gain: 0.45, rate: 1.9, length: 0.25, lowpass: 3000 });
        return;
      }
      const cls = FIRE_CLASS[e.weapon];
      if (!cls) return;
      const t = this.now();
      if (t - this.botFireAt[cls] < BOT_FIRE_GAP) return;
      const d = e.pos.distanceTo(listener), r = FIRE_RANGE[cls];
      const gain = distanceGain(d, r.ref, 1, r.max);
      if (gain <= 0) return;
      this.botFireAt[cls] = t;
      const delay = d / SOUND_SPEED, lowpass = distanceLowpass(d, 16000, 500);
      if (cls === 'cannon') this.sfx.clip('explosion_near', { gain: gain, rate: 1.5, length: 0.5, delay, lowpass });
      else this.sfx.clip('gun_shot', { gain: (cls === 'small' ? 0.8 : 1) * gain, rate: cls === 'small' ? 1.5 + this.rnd() * 0.15 : 1, length: cls === 'small' ? 0.15 : 0.2, delay, lowpass, highpass: cls === 'small' ? 300 : 0 });
      return;
    }
    if (!foot) return;
    if (e.t === 'playerHit') this.sfx.clip('impact_ground', { gain: Math.min(1, 0.4 + e.damage / 40), rate: 0.6, length: 0.25, lowpass: 900 });
    else if (e.t === 'memberHit' && e.byPlayer) this.sfx.clip('hit_metal_2', e.killed ? { gain: 0.35, rate: 1.6, length: 0.1 } : { gain: 0.25, rate: 2.4, length: 0.06 });
  }

  update(s: FootState | null) {
    if (!s) { this.stepDist = 0; this.reloading = false; return; }
    if (s.reloading !== this.reloading) {
      this.reloading = s.reloading;
      this.sfx.clip('impact_metal', { gain: 0.3, rate: s.reloading ? 2.2 : 2.6, length: 0.06, highpass: 800 });
    }
    if (!s.onGround || s.speed < STEP_MIN_SPEED) { this.stepDist = Math.min(this.stepDist, STEP_LENGTH[s.stance] * 0.5); return; }
    this.stepDist += s.speed * s.dt;
    if (this.stepDist < STEP_LENGTH[s.stance]) return;
    this.stepDist -= STEP_LENGTH[s.stance];
    this.sfx.clip('impact_ground', { gain: STEP_GAIN[s.stance] * Math.min(1.5, s.speed / 3), rate: 1.9 + this.rnd() * 0.3, length: 0.09, lowpass: 1800, highpass: 150 });
  }
}
