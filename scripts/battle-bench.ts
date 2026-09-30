import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createBattleSession } from '../src/sim/battle/runtime';
import type { BattleMapDef } from '../src/sim/battle/schema';
import { STEP } from '../src/sim/world';

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const mapId = arg('map', 'harek');
const mode = arg('mode', 'quick') as 'quick' | 'conquest';
const minutes = Number(arg('minutes', '10'));
const seed = Number(arg('seed', '1'));
const def = JSON.parse(readFileSync(`src/content/battle/maps/${mapId}.json`, 'utf8')) as BattleMapDef;

const { session, runtime } = createBattleSession(def, mode, { side: 'coalition', seed });
session.start();
session.frozen = false;
const world = session.world;
const hooks = world.battleHooks!;
const ticks: number[] = [], slow: number[] = [];
world.battleHooks = {
  tick10Hz: (w, dt) => { const t = performance.now(); hooks.tick10Hz(w, dt); ticks.push(performance.now() - t); },
  tick1Hz: (w, dt) => { const t = performance.now(); hooks.tick1Hz(w, dt); slow.push(performance.now() - t); },
};

const frames: number[] = [];
let peakUnits = 0, peakAlive = 0, peakProjectiles = 0;
const warm = 60 * 5;
for (let f = 0; f < minutes * 60 * 60; f++) {
  const t = performance.now();
  session.step(STEP);
  session.step(STEP);
  const ms = performance.now() - t;
  if (f >= warm) frames.push(ms);
  peakUnits = Math.max(peakUnits, world.units.length);
  peakAlive = Math.max(peakAlive, world.units.filter(u => u.alive).length);
  peakProjectiles = Math.max(peakProjectiles, world.projectiles.length);
  if (session.mode === 'done') break;
}

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  return { mean: s.reduce((a, b) => a + b, 0) / Math.max(1, s.length), p99: q(0.99), max: s[s.length - 1] ?? 0 };
};
const f = stats(frames), t10 = stats(ticks), t1 = stats(slow);
const c = runtime.conquest;
const row = (name: string, s: { mean: number; p99: number; max: number }) => `| ${name} | ${s.mean.toFixed(3)} | ${s.p99.toFixed(3)} | ${s.max.toFixed(3)} |`;
console.log(`## battle-bench — ${mapId} ${mode}, seed ${seed}, ${(frames.length / 3600).toFixed(1)} min simulated (node ${process.version})`);
console.log('');
console.log('| measure (ms) | mean | p99 | max |');
console.log('| --- | --- | --- | --- |');
console.log(row('sim frame (2 steps, 60 fps)', f));
console.log(row('battle 10 Hz tick', t10));
console.log(row('battle 1 Hz tick', t1));
console.log('');
console.log(`| units | peak in list ${peakUnits} | peak alive ${peakAlive} | retired ${world.retired.length} | peak projectiles ${peakProjectiles} |`);
console.log(`| result | tickets ${Math.floor(c.tickets.coalition)} : ${Math.floor(c.tickets.veros)} | points ${c.points.map(p => `${p.id}=${p.owner}`).join(' ')} | ${c.winner ?? 'running'} |`);
