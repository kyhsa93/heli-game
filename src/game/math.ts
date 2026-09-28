export const smooth = (t: number) => t * t * (3 - 2 * t);
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function rng(seed: number): () => number {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
