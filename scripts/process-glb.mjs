#!/usr/bin/env node
import { statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripToStatic } from './lib/strip-static.mjs';
import { args, gltfTransformBin, run } from './lib/tools.mjs';

const a = args(process.argv.slice(2), { 'texture-size': 'value', simplify: 'value', static: 'flag' });
let [input, output] = a._;
if (!input || !output) {
  console.error('usage: node scripts/process-glb.mjs <input.glb|gltf> <output.glb> [--texture-size 256] [--simplify 0.3] [--static]');
  process.exit(1);
}
if (a.static && input) {
  const tmp = join(tmpdir(), `static-${process.pid}.glb`);
  await stripToStatic(input, tmp);
  input = tmp;
}
const opts = ['optimize', input, output, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', a['texture-size'] ?? '256'];
if (a.simplify) opts.push('--simplify', 'true', '--simplify-ratio', a.simplify, '--simplify-error', '0.01');
run(gltfTransformBin(), opts);
console.log(`${output}: ${(statSync(output).size / 1024).toFixed(1)} KB`);
