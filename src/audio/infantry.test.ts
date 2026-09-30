import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GameAudio } from './game';
import { FIRE_RANGE, InfantryAudio, STEP_LENGTH, type FootState } from './infantry';
import { SfxPlayer, SOUND_SPEED, type SampleId } from './sfx';
import { fakeCtx } from './testing';

type Ctx = ReturnType<typeof fakeCtx>;
const asCtx = (c: Ctx) => c as unknown as AudioContext;
const IDS: SampleId[] = ['gun_shot', 'rocket_launch', 'impact_ground', 'impact_metal', 'hit_metal_0', 'hit_metal_1', 'hit_metal_2', 'explosion_near'];

function setup(withSamples = true) {
  const c = fakeCtx();
  const samples: Partial<Record<SampleId, AudioBuffer>> = {};
  if (withSamples) for (const id of IDS) samples[id] = Object.assign(c.createBuffer(1, 100, 22050), { id }) as unknown as AudioBuffer;
  const sfx = new SfxPlayer(asCtx(c), c.destination as unknown as AudioNode, samples, () => 0.5);
  const inf = new InfantryAudio(sfx, () => c.currentTime, () => 0.5);
  const played = () => c.started.map(s => (s.buffer as { id?: string }).id ?? 'noise');
  return { c, sfx, inf, played };
}

const fire = (weapon: string, owner: number, x = 0) => ({ t: 'fire' as const, weapon, pos: new Vector3(x, 0, 0), dir: new Vector3(0, 0, -1), owner, tracer: true });

function walk(c: Ctx, inf: InfantryAudio, s: Omit<FootState, 'dt'>, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) { c.currentTime += 1 / 60; inf.update({ ...s, dt: 1 / 60 }); }
}

describe('infantry sounds from reworked clips (B2-14)', () => {
  it('plays the rifle as a short, high-pitched cut of the cannon shot and the grenade as a thump', () => {
    const { c, sfx, inf, played } = setup();
    inf.onEvent(fire('rifle', 0), new Vector3(), true);
    sfx.onEvent(fire('rifle', 0), new Vector3());
    inf.onEvent(fire('grenade', 0), new Vector3(), true);
    sfx.onEvent(fire('grenade', 0), new Vector3());
    expect(played()).toEqual(['gun_shot', 'rocket_launch']);
    expect(c.started[0].rate).toBeGreaterThan(1.5);
    expect(c.started[1].rate).toBeGreaterThan(1.5);
    sfx.onEvent(fire('gun30', 0), new Vector3());
    inf.onEvent(fire('gun30', 0), new Vector3(), false);
    expect(played()).toEqual(['gun_shot', 'rocket_launch', 'gun_shot']);
    expect(c.started[2].rate).toBeLessThan(1.1);
  });

  it('hears bot gunfire late by the speed of sound, not beyond its range, and at most every 50 ms per class', () => {
    const { c, inf, played } = setup();
    inf.onEvent(fire('g_rifle', 12, 680), new Vector3(), true);
    expect(c.started[0].when).toBeCloseTo(10 + 680 / SOUND_SPEED, 5);
    inf.onEvent(fire('g_rifle', 13, 100), new Vector3(), true);
    expect(c.started).toHaveLength(1);
    inf.onEvent(fire('g_main', 14, 900), new Vector3(), true);
    expect(played()).toEqual(['gun_shot', 'explosion_near']);
    c.currentTime += 0.06;
    inf.onEvent(fire('g_rifle', 12, FIRE_RANGE.small.max + 10), new Vector3(), true);
    inf.onEvent(fire('sa_ir', 15, 100), new Vector3(), true);
    expect(c.started).toHaveLength(2);
    inf.onEvent(fire('g_rifle', 12, 50), new Vector3(), false);
    expect(c.started).toHaveLength(3);
  });

  it('steps once per stride while walking, quieter and shorter crouched, and never standing still or in the air', () => {
    const stand = setup();
    walk(stand.c, stand.inf, { speed: 3, stance: 'stand', onGround: true, reloading: false }, 3);
    expect(stand.c.started.length).toBe(Math.floor((3 * 3) / STEP_LENGTH.stand));
    expect(stand.played().every(id => id === 'impact_ground')).toBe(true);
    const crouch = setup();
    walk(crouch.c, crouch.inf, { speed: 3, stance: 'crouch', onGround: true, reloading: false }, 3);
    expect(crouch.c.started.length).toBeGreaterThan(stand.c.started.length);
    expect(crouch.c.gains[0].value).toBeLessThan(stand.c.gains[0].value);
    const still = setup();
    walk(still.c, still.inf, { speed: 0.2, stance: 'stand', onGround: true, reloading: false }, 3);
    walk(still.c, still.inf, { speed: 6, stance: 'stand', onGround: false, reloading: false }, 3);
    expect(still.c.started).toHaveLength(0);
  });

  it('clicks when a reload starts and when it ends', () => {
    const { c, inf, played } = setup();
    const s = { speed: 0, stance: 'stand' as const, onGround: true, reloading: false };
    walk(c, inf, s, 0.5);
    walk(c, inf, { ...s, reloading: true }, 2);
    walk(c, inf, s, 0.5);
    expect(played()).toEqual(['impact_metal', 'impact_metal']);
  });

  it('thuds instead of ringing metal when the player is hit on foot, and ticks on a hit squad member', () => {
    const c = fakeCtx();
    const audio = new GameAudio(asCtx(c), null);
    const tag = (id: string) => Object.assign(c.createBuffer(1, 100, 22050), { id }) as unknown as AudioBuffer;
    audio.sfx.setSamples({ impact_ground: tag('impact_ground'), hit_metal_0: tag('hit_metal'), hit_metal_1: tag('hit_metal'), hit_metal_2: tag('hit_metal') });
    const ids = () => c.started.map(s => (s.buffer as { id?: string }).id).filter(Boolean);
    const hit = { t: 'playerHit' as const, by: 3, weapon: 'g_rifle', damage: 4 };
    audio.update({ rpm: 0, collective: 0, airspeed: 0, warn: false, soldier: { dt: 0, speed: 0, stance: 'stand', onGround: true, reloading: false } });
    audio.onEvent(hit, new Vector3());
    audio.onEvent({ t: 'memberHit', unit: 3, killed: false, byPlayer: true }, new Vector3());
    audio.onEvent({ t: 'memberHit', unit: 3, killed: false, byPlayer: false }, new Vector3());
    expect(ids()).toEqual(['impact_ground', 'hit_metal']);
    audio.update({ rpm: 1, collective: 0, airspeed: 0, warn: false, soldier: null });
    audio.onEvent(hit, new Vector3());
    expect(ids()).toEqual(['impact_ground', 'hit_metal', 'hit_metal']);
  });

  it('still makes every infantry sound from synthesised noise when no clip loaded', () => {
    const { c, inf, played } = setup(false);
    inf.onEvent(fire('rifle', 0), new Vector3(), true);
    inf.onEvent(fire('g_hmg', 4, 200), new Vector3(), true);
    walk(c, inf, { speed: 3, stance: 'stand', onGround: true, reloading: false }, 2);
    expect(played().length).toBeGreaterThanOrEqual(4);
    expect(played().every(id => id === 'noise')).toBe(true);
  });
});
