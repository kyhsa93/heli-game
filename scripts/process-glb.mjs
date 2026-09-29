#!/usr/bin/env node
import { statSync } from 'node:fs';
import { args, gltfTransformBin, run } from './lib/tools.mjs';

const a = args(process.argv.slice(2), { 'texture-size': 'value' });
const [input, output] = a._;
if (!input || !output) {
  console.error('usage: node scripts/process-glb.mjs <input.glb|gltf> <output.glb> [--texture-size 256]');
  process.exit(1);
}
run(gltfTransformBin(), ['optimize', input, output, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', a['texture-size'] ?? '256']);
console.log(`${output}: ${(statSync(output).size / 1024).toFixed(1)} KB`);
