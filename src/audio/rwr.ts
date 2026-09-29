import type { Threat } from '../sim/sensors/ase';

export type RwrLevel = 'none' | 'search' | 'track' | 'launch';

export function rwrLevel(threats: readonly Threat[]): RwrLevel {
  if (threats.some(t => t.state === 'launch' || t.state === 'missile')) return 'launch';
  if (threats.some(t => t.state === 'track')) return 'track';
  return threats.length ? 'search' : 'none';
}

export const RWR_PATTERN: Record<RwrLevel, { freq: number; rate: number; duty: number; gain: number }> = {
  none: { freq: 0, rate: 0, duty: 0, gain: 0 },
  search: { freq: 900, rate: 0.5, duty: 0.05, gain: 0.03 },
  track: { freq: 1100, rate: 2, duty: 0.4, gain: 0.05 },
  launch: { freq: 2000, rate: 8, duty: 0.5, gain: 0.07 },
};

export function rwrGateOn(level: RwrLevel, t: number) {
  const p = RWR_PATTERN[level];
  return p.rate > 0 && (t * p.rate) % 1 < p.duty;
}
