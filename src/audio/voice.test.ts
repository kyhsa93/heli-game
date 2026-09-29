import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Threat } from '../sim/sensors/ase';
import { fakeCtx } from './testing';
import { GameAudio, voiceFor } from './game';
import { rwrGateOn, rwrLevel } from './rwr';
import { SfxPlayer } from './sfx';
import { speechBackend, VOICE_COOLDOWN, VOICE_LINES, VoiceWarnings } from './voice';

const asCtx = (c: ReturnType<typeof fakeCtx>) => c as unknown as AudioContext;

describe('voice warnings (07-ui-ux.md 7.7, 09 9.3)', () => {
  it('maps sim events to the eight lines', () => {
    expect(voiceFor({ t: 'missileWarning', id: 1, kind: 'radar', from: new Vector3(), owner: 2 })).toBe('missileLaunch');
    expect(voiceFor({ t: 'missileWarning', id: 1, kind: 'ir', from: new Vector3(), owner: 2 })).toBe('missile');
    expect(voiceFor({ t: 'systemDamaged', system: 'engine1', level: 'damaged' })).toBe('engine1Fire');
    expect(voiceFor({ t: 'systemDamaged', system: 'engine2', level: 'damaged' })).toBe('engine2Fire');
    expect(voiceFor({ t: 'systemDamaged', system: 'rotor', level: 'destroyed' })).toBe('landNow');
    expect(voiceFor({ t: 'engine', on: false, cause: 'damage' })).toBe('engineOut');
    expect(voiceFor({ t: 'engine', on: false })).toBeNull();
    expect(Object.keys(VOICE_LINES)).toHaveLength(8);
  });

  it('speaks through the backend with a per-line cooldown and can be switched off', () => {
    const said: string[] = [];
    let t = 0;
    const v = new VoiceWarnings({ speak: s => said.push(s) }, () => said.push('BEEP'), () => t);
    v.say('missileLaunch'); v.say('missileLaunch'); v.say('bingoFuel');
    expect(said).toEqual(['Missile launch', 'Bingo fuel']);
    t += VOICE_COOLDOWN + 0.1;
    v.say('missileLaunch');
    expect(said).toHaveLength(3);
    v.enabled = false;
    t += 10;
    expect(v.say('missile')).toBe(false);
    expect(said).toHaveLength(3);
  });

  it('beeps when speech synthesis is unavailable', () => {
    expect(speechBackend({})).toBeNull();
    const out: string[] = [];
    const v = new VoiceWarnings(null, () => out.push('BEEP'), () => 0);
    v.say('altitude');
    expect(out).toEqual(['BEEP']);
  });

  it('uses speechSynthesis with an English voice when present', () => {
    const spoken: { text: string; lang: string; voice: unknown }[] = [];
    class U { lang = ''; rate = 1; voice: unknown = null; constructor(public text: string) {} }
    const win = {
      speechSynthesis: { speak: (u: U) => spoken.push({ text: u.text, lang: u.lang, voice: u.voice }), getVoices: () => [{ lang: 'ko-KR', name: 'Yuna' }, { lang: 'en-US', name: 'Samantha' }] },
      SpeechSynthesisUtterance: U,
    };
    speechBackend(win)!.speak('Missile launch');
    expect(spoken).toEqual([{ text: 'Missile launch', lang: 'en-US', voice: { lang: 'en-US', name: 'Samantha' } }]);
  });

  it('GameAudio calls out warnings from events and state, once for bingo fuel', () => {
    const said: string[] = [];
    const a = new GameAudio(asCtx(fakeCtx()), { speak: s => said.push(s) });
    a.voice.enabled = true;
    a.onEvent({ t: 'missileWarning', id: 1, kind: 'radar', from: new Vector3(), owner: 2 }, new Vector3());
    const base = { rpm: 1, collective: 0.6, airspeed: 30, warn: false };
    a.update({ ...base, fuel: 8 }); a.update({ ...base, fuel: 7 });
    a.update({ ...base, fuel: 50, flying: true, aglFt: 30, vsFpm: -1200 });
    expect(said).toEqual(['Missile launch', 'Bingo fuel', 'Altitude, altitude']);
  });

});

describe('RWR and hit sounds', () => {
  const th = (state: Threat['state']): Threat => ({ id: 'x', symbol: 'S', state, bearing: 0, range: 1000 });
  it('picks the loudest RWR level and gates its beeps', () => {
    expect(rwrLevel([])).toBe('none');
    expect(rwrLevel([th('search')])).toBe('search');
    expect(rwrLevel([th('search'), th('track')])).toBe('track');
    expect(rwrLevel([th('track'), th('missile')])).toBe('launch');
    const on = (lvl: Parameters<typeof rwrGateOn>[0]) => Array.from({ length: 1000 }, (_, i) => rwrGateOn(lvl, i / 1000)).filter(Boolean).length;
    expect(on('none')).toBe(0);
    expect(on('launch')).toBeGreaterThan(on('track'));
    expect(on('track')).toBeGreaterThan(on('search'));
  });

  it('plays one of three metal hit samples when the aircraft is hit', () => {
    const c = fakeCtx();
    const bufs = [0, 1, 2].map(() => c.createBuffer(1, 100, 22050));
    const sfx = new SfxPlayer(asCtx(c), c.destination as unknown as AudioNode, { hit_metal_0: bufs[0], hit_metal_1: bufs[1], hit_metal_2: bufs[2] } as never, () => 0.5);
    sfx.onEvent({ t: 'playerHit', by: 3, weapon: 'hmg', damage: 2 }, new Vector3());
    expect(c.started).toHaveLength(1);
    expect(bufs).toContain(c.started[0].buffer);
    sfx.radio();
    expect(c.started).toHaveLength(2);
  });
});
