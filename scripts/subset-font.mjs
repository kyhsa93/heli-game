#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, requireTool, run } from './lib/tools.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const a = args(process.argv.slice(2), { ascii: 'flag', strings: 'flag', extra: 'value', rename: 'value' });
const [input, output] = a._;
if (a._.length !== 2 || !output.endsWith('.woff2') || resolve(input) === resolve(output)) {
  console.error('usage: node scripts/subset-font.mjs <input.ttf|otf|woff2> <output.woff2> [--ascii] [--strings] [--extra "°±"] [--rename "New Family"]');
  console.error('one input and one .woff2 output per run (run once per weight); the output must differ from the input');
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const chars = new Set();
if (a.ascii) for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
if (a.strings) {
  for (const f of walk(join(ROOT, 'src', 'content')).filter(f => f.endsWith('.json'))) {
    for (const ch of readFileSync(f, 'utf8')) chars.add(ch);
  }
  for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
}
for (const ch of a.extra ?? '') chars.add(ch);
chars.delete('\n'); chars.delete('\r');

const textFile = join(tmpdir(), `subset-${process.pid}.txt`);
writeFileSync(textFile, [...chars].join(''));
requireTool('pyftsubset', 'Install fonttools and brotli: pip install --user fonttools brotli');
// Name IDs 13 and 14 are the licence description and URL. pyftsubset keeps only 0-6 by
// default, which shipped every font without the licence record OFL asks to travel with it.
run('pyftsubset', [input, `--text-file=${textFile}`, '--flavor=woff2', `--output-file=${output}`, '--layout-features=*', '--no-hinting', '--name-IDs=0,1,2,3,4,5,6,13,14']);
if (a.rename) {
  const py = [
    'import sys',
    'from fontTools.ttLib import TTFont',
    'f = TTFont(sys.argv[1])',
    'fam = sys.argv[2]',
    'sub = f["name"].getDebugName(2) or "Regular"',
    'ps = fam.replace(" ", "") + "-" + sub.replace(" ", "")',
    'for rec in f["name"].names:',
    '    if rec.nameID in (1, 16): rec.string = fam',
    '    elif rec.nameID == 4: rec.string = fam + " " + sub',
    '    elif rec.nameID == 6: rec.string = ps',
    '    elif rec.nameID == 3: rec.string = ps',
    'f.save(sys.argv[1])',
  ].join('\n');
  run('python3', ['-c', py, output, a.rename]);
}
console.log(`${output}: ${chars.size} glyphs, ${(statSync(output).size / 1024).toFixed(1)} KB`);
