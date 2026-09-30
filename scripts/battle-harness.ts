import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { ProxyPilot } from '../src/sim/battle/proxy';
import { createBattleSession } from '../src/sim/battle/runtime';
import type { BattleMapDef, BattleSide } from '../src/sim/battle/schema';
import { STEP } from '../src/sim/world';

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const mapId = arg('map', 'harek');
const mode = arg('mode', 'quick') as 'quick' | 'conquest';
const side = arg('side', 'coalition') as BattleSide;
const player = arg('player', 'idle') as 'idle' | 'proxy';
const seeds = Number(arg('seeds', '20'));
const first = Number(arg('seed', '1'));
const trace = process.argv.includes('--trace');
const overrides = process.argv.flatMap((a, i) => (a === '--set' ? [process.argv[i + 1]] : []));
const def = JSON.parse(readFileSync(`src/content/battle/maps/${mapId}.json`, 'utf8')) as BattleMapDef;

interface Run { seed: number; minutes: number; winner: string; tickets: string; flips: Record<string, number>; kills: number; proxyKills: number; proxyDeaths: number; ms: number }

function play(seed: number): Run {
  const { session, runtime } = createBattleSession(def, mode, { side, seed });
  for (const kv of overrides) { const [k, v] = kv.split('='); (runtime.rules as unknown as Record<string, number>)[k] = Number(v); }
  session.start();
  session.frozen = false;
  const world = session.world;
  const flips: Record<string, number> = Object.fromEntries(runtime.conquest.points.map(p => [p.id, 0]));
  let kills = 0;
  world.events.on('pointOwner', e => { flips[e.id]++; });
  world.events.on('unitDestroyed', () => { kills++; });
  const proxy = player === 'proxy' ? new ProxyPilot(runtime, side) : null;
  const t0 = performance.now();
  let steps = 0;
  const limit = (runtime.rules.timeLimitSec + 30) * 120;
  while (session.mode !== 'done' && steps < limit) {
    proxy?.step(world, STEP);
    session.step(STEP);
    steps++;
    if (trace && steps % (120 * 60) === 0) {
      const c = runtime.conquest;
      const alive = (s: BattleSide) => world.units.filter(u => u.alive && u.side === s && u.def.move).length;
      const orders = runtime.commanders.map(cmd => cmd.platoons.map(pl => `${pl.order?.kind[0] ?? '-'}${pl.order?.point ?? ''}:${pl.state[0]}`).join(' ')).join(' | ');
      const targeting = world.units.filter(u => u.alive && u.battle?.target?.kind === 'unit').length;
      const pts = c.points.map(p => `${p.id}:${p.strength.coalition.toFixed(1)}/${p.strength.veros.toFixed(1)}`).join(' ');
      console.log(`   engaged ${targeting}  strength ${pts}`);
      console.log(`${(steps / 7200).toFixed(0).padStart(2)}m  tickets ${c.tickets.coalition.toFixed(0)}:${c.tickets.veros.toFixed(0)}  points ${c.points.map(p => `${p.id}${p.owner[0]}${p.v.toFixed(0)}`).join(' ')}  alive ${alive('coalition')}:${alive('veros')}  kills ${kills}  ${orders}`);
    }
  }
  const c = runtime.conquest;
  return {
    seed, minutes: c.elapsed / 60, winner: c.winner ?? 'none', tickets: `${Math.floor(c.tickets.coalition)}:${Math.floor(c.tickets.veros)}`,
    flips, kills, proxyKills: proxy?.kills ?? 0, proxyDeaths: proxy?.deaths ?? 0, ms: (performance.now() - t0) / Math.max(1, steps / 2),
  };
}

const runs: Run[] = [];
for (let s = first; s < first + seeds; s++) {
  const r = play(s);
  runs.push(r);
  console.log(`seed ${String(r.seed).padStart(3)}  ${r.minutes.toFixed(1).padStart(5)} min  ${r.winner.padEnd(9)}  tickets ${r.tickets.padEnd(8)}  flips ${Object.entries(r.flips).map(([k, v]) => `${k}${v}`).join(' ')}  kills ${r.kills}${player === 'proxy' ? `  proxy ${r.proxyKills}/${r.proxyDeaths}` : ''}`);
}
const sorted = runs.map(r => r.minutes).sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const wins = runs.filter(r => r.winner === side).length;
const draws = runs.filter(r => r.winner === 'draw').length;
const everyFlip = runs.filter(r => Object.values(r.flips).every(v => v >= 1)).length;
console.log('');
console.log(`| ${mapId} ${mode} · ${side} · ${player} · ${runs.length} seeds | value |`);
console.log('| --- | --- |');
console.log(`| median length | ${median.toFixed(1)} min (min ${sorted[0].toFixed(1)}, max ${sorted[sorted.length - 1].toFixed(1)}) |`);
console.log(`| ${side} wins | ${wins}/${runs.length} (${((wins / runs.length) * 100).toFixed(0)}%), draws ${draws} |`);
console.log(`| seeds where every point changed owner | ${everyFlip}/${runs.length} (${((everyFlip / runs.length) * 100).toFixed(0)}%) |`);
console.log(`| mean kills | ${(runs.reduce((a, r) => a + r.kills, 0) / runs.length).toFixed(0)} |`);
if (player === 'proxy') console.log(`| proxy kills / deaths | ${(runs.reduce((a, r) => a + r.proxyKills, 0) / runs.length).toFixed(1)} / ${(runs.reduce((a, r) => a + r.proxyDeaths, 0) / runs.length).toFixed(1)} |`);
console.log(`| sim ms per 60 fps frame | ${(runs.reduce((a, r) => a + r.ms, 0) / runs.length).toFixed(3)} |`);
