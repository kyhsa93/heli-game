import { PAD_W, WORLD } from './constants';
import { clamp, rng, smooth } from './math';

export interface Pad {
  x: number;
  y: number;
  name: string;
  base: boolean;
}

export interface World {
  ground: Float32Array;
  pads: Pad[];
  miniPath: number[];
}

const PAD_NAMES = 'HABCDFGJ';

export function groundAt(world: World, x: number): number {
  const g = world.ground;
  const f = clamp(x, 0, WORLD) / 4;
  const i = Math.min(f | 0, g.length - 2);
  const t = f - i;
  return g[i] * (1 - t) + g[i + 1] * t;
}

export function buildWorld(seed: number): World {
  const r = rng(seed);
  const ph = Array.from({ length: 6 }, () => r() * Math.PI * 2);
  const n = WORLD / 4 + 1;
  const ground = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * 4;
    let h = 880 - 210 * Math.sin(x / 820 + ph[0]) - 110 * Math.sin(x / 310 + ph[1])
      - 45 * Math.sin(x / 120 + ph[2]) - 16 * Math.sin(x / 47 + ph[3]);
    h -= Math.max(0, Math.sin(x / 1500 + ph[4])) ** 6 * 380;
    ground[i] = h;
  }

  const pads: Pad[] = [];
  let px = 420;
  for (let k = 0; k < PAD_NAMES.length && px < WORLD - 300; k++) {
    pads.push({ x: px, y: 0, name: PAD_NAMES[k], base: k === 0 });
    px += 850 + r() * 450;
  }
  for (const p of pads) {
    const i0 = Math.round(p.x / 4);
    let sum = 0, cnt = 0;
    for (let i = i0 - 19; i <= i0 + 19; i++) { sum += ground[i]; cnt++; }
    p.y = sum / cnt;
    const half = PAD_W / 2 + 10;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(i * 4 - p.x);
      if (d < half + 180) {
        const t = d <= half ? 1 : 1 - smooth((d - half) / 180);
        ground[i] = ground[i] * (1 - t) + p.y * t;
      }
    }
  }

  const world: World = { ground, pads, miniPath: [] };
  for (let x = 0; x <= WORLD; x += 40) world.miniPath.push(groundAt(world, x));
  return world;
}
