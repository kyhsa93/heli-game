import type { Quality } from '../save/save';

export interface QualityProfile { pixelRatio: number; trees: number; mpdVideo: boolean }

export const QUALITY: Record<Quality, QualityProfile> = {
  low: { pixelRatio: 1, trees: 0.5, mpdVideo: false },
  medium: { pixelRatio: 1.5, trees: 0.75, mpdVideo: true },
  high: { pixelRatio: 2, trees: 1, mpdVideo: true },
};

export function treeOrder(n: number) {
  let step = 7919;
  while (n > 1 && gcd(step, n) !== 1) step += 2;
  return Array.from({ length: n }, (_, j) => (j * step) % Math.max(1, n));
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}
