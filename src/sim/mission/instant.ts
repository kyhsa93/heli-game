import { t } from '../../content/strings';
import { rng } from '../../core/math';
import { Terrain } from '../terrain';
import type { MissionDef, UnitSpawn, Vec2 } from './schema';
import { UNIT_DEFS } from '../units';

export type ThreatLevel = 'low' | 'medium' | 'high';
export interface InstantOptions { seed: number; threat: ThreatLevel; time: MissionDef['environment']['time'] }

export const INSTANT_SIZE = 8000;
export const START_DISTANCE = 3000;

const TARGETS: Record<ThreatLevel, string[]> = {
  low: ['truck', 'truck', 'technical', 'inf', 'fuel_truck'],
  medium: ['apc', 'truck', 'truck', 'inf', 'inf_mg', 'fuel_truck', 'tank'],
  high: ['tank', 'tank', 'apc', 'apc', 'truck', 'inf_mg', 'fuel_truck'],
};
const THREATS: Record<ThreatLevel, string[]> = {
  low: ['technical'],
  medium: ['technical', 'aaa_light', 'manpads'],
  high: ['aaa_light', 'spaag', 'manpads', 'sam_short'],
};

export function generateInstant(opts: InstantOptions): MissionDef {
  const r = rng(opts.seed);
  const ter = new Terrain(opts.seed, { size: INSTANT_SIZE });
  const lim = ter.half - 900;
  const good = (x: number, z: number, minUp = 0.93) => Math.abs(x) < ter.half - 250 && Math.abs(z) < ter.half - 250 && ter.heightAt(x, z) > 4 && ter.heightAt(x, z) < 320 && ter.normalAt(x, z).y >= minUp;
  const near = (x: number, z: number, radius: number, minUp = 0.9): Vec2 => {
    for (let k = 0; k < 400; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
      const px = Math.round(x + Math.cos(a) * d), pz = Math.round(z + Math.sin(a) * d);
      if (good(px, pz, minUp)) return [px, pz];
    }
    for (let d = 10; d < 2000; d += 20) for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const px = Math.round(x + Math.cos(a) * d), pz = Math.round(z + Math.sin(a) * d);
      if (good(px, pz, minUp)) return [px, pz];
    }
    return [Math.round(x), Math.round(z)];
  };

  const clusters: Vec2[] = [];
  const count = r() < 0.5 ? 1 : 2;
  for (let tries = 0; clusters.length < count && tries < 2000; tries++) {
    const x = (r() * 2 - 1) * lim * 0.7, z = (r() * 2 - 1) * lim * 0.7;
    if (!good(x, z, 0.95) || clusters.some(c => Math.hypot(c[0] - x, c[1] - z) < 1200)) continue;
    clusters.push([Math.round(x), Math.round(z)]);
  }
  if (!clusters.length) clusters.push(near(0, 0, 1500, 0.95));

  const units: UnitSpawn[] = [];
  const groups: MissionDef['groups'] = [];
  const objectives: MissionDef['objectives'] = [];
  clusters.forEach(([cx, cz], ci) => {
    const g = `c${ci + 1}`;
    groups.push({ id: g, behavior: 'defend' });
    const targets = TARGETS[opts.threat].map((type, k) => ({ id: `${g}t${k}`, type, position: near(cx, cz, 160), headingDeg: Math.round(r() * 360), group: g }));
    units.push(...targets);
    THREATS[opts.threat].forEach((type, k) => {
      const ring = type === 'sam_short' ? 1400 : type === 'manpads' ? 500 : 350;
      const a = r() * Math.PI * 2;
      units.push({ id: `${g}a${k}`, type, position: near(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, 150), headingDeg: Math.round(r() * 360), group: `${g}ad` });
    });
    groups.push({ id: `${g}ad`, behavior: 'defend' });
    units.push({ id: `${g}v0`, type: 'civ_car', position: near(cx + 260, cz - 180, 120), headingDeg: Math.round(r() * 360) });
    objectives.push({ id: `o${ci + 1}`, kind: 'destroy', units: targets.map(u => u.id), count: Math.ceil(targets.length * 0.7), primary: true, label: t('instant.objective', { n: ci + 1 }) });
  });

  const [fx, fz] = clusters[0];
  const toCenter = Math.atan2(-fx, -fz);
  const want: Vec2 = [fx + Math.sin(toCenter) * START_DISTANCE, fz + Math.cos(toCenter) * START_DISTANCE];
  const start = near(Math.max(-lim, Math.min(lim, want[0])), Math.max(-lim, Math.min(lim, want[1])), 300, 0.8);
  const heading = ((Math.atan2(fx - start[0], -(fz - start[1])) * 180 / Math.PI) + 360) % 360;
  const farp = near(start[0] + Math.sin(toCenter) * 1500, start[1] + Math.cos(toCenter) * 1500, 500, 0.97);
  const side: Vec2 = [Math.cos(toCenter), -Math.sin(toCenter)];
  const bp = (s: number): Vec2 => near(fx + Math.sin(toCenter) * 2200 + side[0] * 900 * s, fz + Math.cos(toCenter) * 2200 + side[1] * 900 * s, 400, 0.85);
  const kills = units.filter(u => UNIT_DEFS[u.type].side === 'veros').reduce((sum, u) => sum + UNIT_DEFS[u.type].score, 0);

  return {
    id: 'instant', title: t('instant.title'), act: 1, kind: 'instant',
    briefing: {
      summary: t(clusters.length > 1 ? 'instant.summaryTwo' : 'instant.summaryOne'),
      situation: [], threats: [...new Set(THREATS[opts.threat].map(tp => t(`units.${tp}`)))],
      recommendedLoadout: { pylons: { L2: 'hydra70', L1: 'agm114k', R1: 'agm114k', R2: 'hydra70' }, stingers: false, gunRounds: 1200, fuel: 70 },
    },
    environment: { seed: opts.seed, time: opts.time, fog: false, wind: { dirDeg: Math.round(r() * 360), speed: Math.round(2 + r() * 5), gust: Math.round(r() * 3) } },
    terrain: { size: INSTANT_SIZE, features: [{ kind: 'base', center: farp, radius: 100 }], roads: [] },
    start: { kind: 'air', position: start, headingDeg: Math.round(heading), altitudeAgl: 60, speedKt: 60 },
    farps: [{ id: 'farp_a', position: farp, services: ['fuel', 'ammo', 'repair'] }],
    waypoints: [...clusters.map((c, i) => ({ id: `tgt${i + 1}`, name: `TGT${i + 1}`, position: c })), { id: 'bp1', name: 'BP1', position: bp(1) }, { id: 'bp2', name: 'BP2', position: bp(-1) }],
    units, groups, objectives,
    triggers: [{ id: 'go', once: true, when: { kind: 'time', afterSec: 2 }, then: [{ kind: 'radio', from: 'control', text: t('instant.radio') }] }],
    par: Math.round(1000 + kills * 0.7 + 400), parTimeSec: 480, wingman: false,
  };
}
