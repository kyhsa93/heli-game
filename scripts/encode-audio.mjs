#!/usr/bin/env node
import { statSync } from 'node:fs';
import { args, ffmpegPath, run } from './lib/tools.mjs';

const a = args(process.argv.slice(2), { kbps: 'value', start: 'value', duration: 'value', fade: 'value' });
const [input, output] = a._;
if (!input || !output) {
  console.error('usage: node scripts/encode-audio.mjs <input> <output.mp3> [--kbps 64] [--start s] [--duration s] [--fade s]');
  process.exit(1);
}
const ff = ['-y', '-hide_banner', '-loglevel', 'error'];
if (a.start) ff.push('-ss', a.start);
if (a.duration) ff.push('-t', a.duration);
ff.push('-i', input, '-ac', '1', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', `${a.kbps ?? 64}k`);
if (a.fade) ff.push('-af', `afade=t=in:d=${a.fade},areverse,afade=t=in:d=${a.fade},areverse`);
ff.push(output);
run(ffmpegPath(), ff);
console.log(`${output}: ${(statSync(output).size / 1024).toFixed(1)} KB`);
