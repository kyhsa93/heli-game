export const P0 = { margin: 0.2, ceiling: 0.95, spread: 0.25, z: 1.96 } as const;

export interface Rate { wins: number; n: number }

export function wilson({ wins, n }: Rate, z: number = P0.z): [number, number] {
  if (n === 0) return [0, 1];
  const p = wins / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export function diffInterval(a: Rate, b: Rate, z: number = P0.z): [number, number] {
  const pa = a.wins / a.n, pb = b.wins / b.n;
  const [la, ua] = wilson(a, z), [lb, ub] = wilson(b, z);
  const d = pa - pb;
  return [d - Math.sqrt((pa - la) ** 2 + (ub - pb) ** 2), d + Math.sqrt((ua - pa) ** 2 + (pb - lb) ** 2)];
}

export type Verdict = 'pass' | 'fail' | 'undecided';

export function roleVerdict(role: Rate, idle: Rate): { verdict: Verdict; reason: string } {
  const [lo, hi] = diffInterval(role, idle);
  const [, roleHi] = wilson(role);
  const [roleLo] = wilson(role);
  if (roleLo >= P0.ceiling) return { verdict: 'fail', reason: `wins too surely (${(roleLo * 100).toFixed(0)}% at least)` };
  if (hi < P0.margin) return { verdict: 'fail', reason: `beats idle by at most ${(hi * 100).toFixed(0)}pp` };
  if (lo >= P0.margin && roleHi < P0.ceiling) return { verdict: 'pass', reason: `beats idle by ${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}pp` };
  return { verdict: 'undecided', reason: `beats idle by ${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}pp — more seeds` };
}

export function spreadVerdict(rates: Rate[]): { verdict: Verdict; reason: string } {
  if (rates.length < 2) return { verdict: 'undecided', reason: 'one judged role' };
  let worstLo = 0, worstHi = 0;
  for (const a of rates) for (const b of rates) {
    const [lo, hi] = diffInterval(a, b);
    worstLo = Math.max(worstLo, lo); worstHi = Math.max(worstHi, hi);
  }
  if (worstLo > P0.spread) return { verdict: 'fail', reason: `roles differ by at least ${(worstLo * 100).toFixed(0)}pp` };
  if (worstHi <= P0.spread) return { verdict: 'pass', reason: `roles differ by at most ${(worstHi * 100).toFixed(0)}pp` };
  return { verdict: 'undecided', reason: `roles differ by up to ${(worstHi * 100).toFixed(0)}pp — more seeds` };
}
