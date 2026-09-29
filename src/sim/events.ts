export type CrashReason =
  | 'rotorStrike' | 'terrain' | 'water' | 'tree' | 'building'
  | 'ditched' | 'hardLanding' | 'slideLanding' | 'tiltLanding' | 'slope';

export type SimEvent =
  | { t: 'crash'; reason: CrashReason; value?: number }
  | { t: 'landed'; descent: number }
  | { t: 'engine'; on: boolean; cause?: 'fuel' }
  | { t: 'refuel' }
  | { t: 'boundary' }
  | { t: 'objective'; id: string; state: 'done' | 'failed' }
  | { t: 'advice'; code: AdviceCode; value?: number };

export type AdviceCode = 'landingTooHard' | 'wrongPad';

export type Emit = (e: SimEvent) => void;
