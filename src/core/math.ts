export const smooth = (t: number) => t * t * (3 - 2 * t);
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const DEG = Math.PI / 180;

export function wrapPi(a: number) {
  a = (a + Math.PI) % (Math.PI * 2);
  return (a < 0 ? a + Math.PI * 2 : a) - Math.PI;
}

export function wrapDeg360(d: number) {
  return ((d % 360) + 360) % 360;
}

export function rng(seed: number): () => number {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
