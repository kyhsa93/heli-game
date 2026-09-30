import modesJson from '../../content/battle/modes.json';

export type TicketClass = 'person' | 'light' | 'apc' | 'airDefense' | 'tank' | 'transportHeli' | 'attackHeli' | 'jet';

export interface ConquestRules {
  tickets: number;
  bleedPerPointPerSec: number;
  timeLimitSec: number;
  captureRatePerSec: number;
  captureCap: number;
  contestedBelow: number;
  strength: { squadPerMember: number; player: number; groundVehicle: number; air: number };
  ticketCost: Record<TicketClass, number>;
  botWaveSec: number;
  playerRespawnSec: number;
  boundaryGraceSec: number;
  rosterScale: number;
}

type Raw = Record<string, Partial<ConquestRules> & { extends?: string }>;

export function conquestRules(mode: 'conquest' | 'quick', raw: Raw = modesJson as Raw): ConquestRules {
  const own = raw[mode];
  const base = own.extends ? conquestRules(own.extends as 'conquest', raw) : ({} as ConquestRules);
  const { extends: _, ...rest } = own;
  return { ...base, ...rest } as ConquestRules;
}

export function validateRules(r: ConquestRules): string[] {
  const errors: string[] = [];
  const positive = ['tickets', 'bleedPerPointPerSec', 'timeLimitSec', 'captureRatePerSec', 'captureCap', 'botWaveSec', 'rosterScale'] as const;
  for (const k of positive) if (!(r[k] > 0)) errors.push(`${k} must be > 0`);
  if (!(r.contestedBelow >= 0)) errors.push('contestedBelow must be ≥ 0');
  for (const k of ['person', 'light', 'apc', 'airDefense', 'tank', 'transportHeli', 'attackHeli', 'jet'] as const) if (!(r.ticketCost?.[k] > 0)) errors.push(`ticketCost.${k} must be > 0`);
  return errors;
}
