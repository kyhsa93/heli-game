import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TOOLS = process.env.HELI_TOOLS ?? join(homedir(), '.cache', 'karda-tools');

export const PINNED = {
  'ffmpeg-static': '5.3.0',
  '@gltf-transform/cli': '4.5.1',
};

function onPath(cmd) {
  return spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0;
}

export function ensurePackage(name) {
  const pkgDir = join(TOOLS, 'node_modules', ...name.split('/'));
  if (!existsSync(pkgDir)) {
    mkdirSync(TOOLS, { recursive: true });
    console.error(`installing ${name}@${PINNED[name]} into ${TOOLS} …`);
    execFileSync('npm', ['install', '--no-save', '--prefix', TOOLS, `${name}@${PINNED[name]}`], { stdio: 'inherit' });
  }
  return pkgDir;
}

export function ffmpegPath() {
  if (onPath('ffmpeg')) return 'ffmpeg';
  ensurePackage('ffmpeg-static');
  return createRequire(join(TOOLS, 'noop.js'))('ffmpeg-static');
}

export function gltfTransformBin() {
  ensurePackage('@gltf-transform/cli');
  return join(TOOLS, 'node_modules', '.bin', 'gltf-transform');
}

export function requireTool(cmd, hint) {
  if (!onPath(cmd)) {
    console.error(`${cmd} not found. ${hint}`);
    process.exit(1);
  }
  return cmd;
}

export function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

export function args(argv, spec) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      out[key] = spec[key] === 'flag' ? true : argv[++i];
    } else out._.push(a);
  }
  return out;
}
