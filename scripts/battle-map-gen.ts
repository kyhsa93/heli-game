import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { checkPrinciples, modePoints, validateBattleMap, type BattleMapDef, type ModeId } from '../src/sim/battle/schema';
import { battleTerrain } from '../src/sim/battle/terrain';
import type { Terrain } from '../src/sim/terrain';

const SEARCHED = [1, 4, 7, 9, 13];

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const id = arg('map', 'harek')!;
const file = `src/content/battle/maps/${id}.json`;
const def = JSON.parse(readFileSync(file, 'utf8')) as BattleMapDef;
const modes = (Object.keys(def.modes) as ModeId[]).filter(m => m !== 'breakthrough');
const errors = validateBattleMap(def);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

function evaluate(seed: number, only?: number[]) {
  const t = battleTerrain(def, seed);
  const fails = modes.flatMap(m => checkPrinciples(def, t, m, only).map(f => `${m} #${f.principle} ${f.message}`));
  return { t, fails };
}

if (process.argv.includes('--search')) {
  const from = Number(arg('from', '1')), tries = Number(arg('tries', '200'));
  let best: { seed: number; fails: string[] } | null = null;
  for (let seed = from; seed < from + tries; seed++) {
    const { fails } = evaluate(seed, SEARCHED);
    if (!best || fails.length < best.fails.length) best = { seed, fails };
    process.stdout.write(`seed ${seed}: ${fails.length} failing\n`);
    if (!fails.length) break;
  }
  console.log(`best seed ${best!.seed}${best!.fails.length ? `\n  ${best!.fails.join('\n  ')}` : ''}`);
  if (!best!.fails.length && process.argv.includes('--write')) {
    def.environment.seed = best!.seed;
    writeFileSync(file, JSON.stringify(def, null, 2) + '\n');
    console.log(`wrote seed ${best!.seed} to ${file}`);
  }
}

const { t, fails } = evaluate(def.environment.seed);
console.log(`${file} seed ${def.environment.seed}: ${fails.length ? `\n  ${fails.join('\n  ')}` : 'all principles hold'}`);
const png = arg('png');
if (png) writeFileSync(png, render(t, def));

function render(t: Terrain, map: BattleMapDef) {
  const S = 768, half = t.half, scale = (2 * half) / S;
  const px = new Uint8Array(S * S * 3);
  const put = (i: number, j: number, c: [number, number, number]) => {
    if (i < 0 || j < 0 || i >= S || j >= S) return;
    const k = (j * S + i) * 3;
    px[k] = c[0]; px[k + 1] = c[1]; px[k + 2] = c[2];
  };
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = -half + (i + 0.5) * scale, z = -half + (j + 0.5) * scale;
    const h = t.heightAt(x, z);
    if (h < 0.5) { put(i, j, [52, 92, 140]); continue; }
    const n = t.normalAt(x, z);
    const shade = Math.max(0.35, Math.min(1, 0.55 + 0.6 * (n.x * -0.5 + n.y * 0.7 + n.z * -0.5)));
    const g = Math.min(1, h / 500);
    const base: [number, number, number] = t.forest(x, z) >= 0.5 ? [58, 92, 50] : [120 + g * 70, 128 + g * 50, 86 + g * 40];
    put(i, j, base.map(c => Math.round(c * shade)) as [number, number, number]);
  }
  const at = (x: number, z: number) => [Math.floor((x + half) / scale), Math.floor((z + half) / scale)];
  const line = (a: [number, number], b: [number, number], c: [number, number, number]) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / scale) + 1;
    for (let k = 0; k <= n; k++) { const [i, j] = at(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n); put(i, j, c); }
  };
  const disc = (x: number, z: number, r: number, c: [number, number, number]) => {
    const [ci, cj] = at(x, z);
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (di * di + dj * dj <= r * r) put(ci + di, cj + dj, c);
  };
  for (const road of t.roads) for (let k = 0; k + 1 < road.length; k++) line(road[k], road[k + 1], [196, 170, 120]);
  for (const b of t.bridges) line(b.from, b.to, [240, 240, 240]);
  for (const b of t.buildings) disc(b.x, b.z, 1, [90, 60, 50]);
  const zone = map.modes.quick?.combatZone;
  if (zone) for (let k = 0; k < zone.length; k++) line(zone[k], zone[(k + 1) % zone.length], [230, 60, 60]);
  for (const w of map.waypoints) disc(w.position[0], w.position[1], 3, [250, 200, 40]);
  for (const f of map.farps) disc(f.position[0], f.position[1], 3, [255, 255, 255]);
  const quick = new Set(modePoints(map, 'quick').map(p => p.id));
  for (const p of map.points) disc(p.position[0], p.position[1], Math.max(4, Math.round(p.radius / scale)), quick.has(p.id) ? [255, 120, 20] : [250, 250, 250]);
  for (const b of map.bases) disc(b.position[0], b.position[1], 7, b.side === 'coalition' ? [60, 110, 230] : [200, 50, 50]);
  return encodePng(S, S, px);
}

function encodePng(w: number, h: number, rgb: Uint8Array) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let j = 0; j < h; j++) { raw[j * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, j * w * 3, w * 3).copy(raw, j * (w * 3 + 1) + 1); }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
