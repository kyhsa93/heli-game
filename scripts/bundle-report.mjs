#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
export const BUDGET_KB = { first: 210, battle: 400, all: 440 };

const manifest = JSON.parse(readFileSync(join(DIST, '.vite', 'manifest.json'), 'utf8'));
const gz = file => gzipSync(readFileSync(join(DIST, file))).length / 1024;
const js = f => f.endsWith('.js');

function closure(keys, follow) {
  const out = new Set();
  const walk = k => {
    const e = manifest[k];
    if (!e || out.has(e.file)) return;
    out.add(e.file);
    for (const i of e.imports ?? []) walk(i);
    if (follow) for (const i of e.dynamicImports ?? []) if (follow(i)) walk(i);
  };
  keys.forEach(walk);
  return out;
}

const entry = Object.keys(manifest).find(k => manifest[k].isEntry);
const first = closure([entry]);
const battleKeys = Object.keys(manifest).filter(k => /ui\/battle\/Battle\.tsx$|sim\/battle\/index\.ts$|content\/battle\/maps\//.test(k));
const battle = new Set([...first, ...closure(battleKeys, k => /battle|maps|GLTFLoader|meshopt/.test(k))]);
const all = new Set(Object.values(manifest).map(e => e.file).filter(js));
const size = files => [...files].filter(js).reduce((s, f) => s + gz(f), 0);

const rows = [['first', size(first)], ['battle', size(battle)], ['all', size(all)]];
console.log('| route | JS gzip KB | budget (A1) |');
console.log('| --- | --- | --- |');
let over = false;
for (const [name, kb] of rows) {
  const b = BUDGET_KB[name];
  if (kb > b) over = true;
  console.log(`| ${name} | ${kb.toFixed(1)} | ${b}${kb > b ? ' ⚠ over' : ''} |`);
}
if (over) {
  console.error('a route is over its bundle budget (A1)');
  process.exitCode = 1;
}
