import { AIRCRAFT } from './airframe';

export type Store = 'empty' | 'agm114k' | 'agm114l' | 'hydra70';
export type PylonId = 'L2' | 'L1' | 'R1' | 'R2';

export const PYLONS: readonly PylonId[] = ['L2', 'L1', 'R1', 'R2'];
export const GUN_ROUND_OPTIONS = [0, 300, 600, 1200] as const;

export interface LoadoutDef {
  pylons: Record<PylonId, Store>;
  stingers: boolean;
  gunRounds: number;
  fuel: number;
}

export interface Loadout {
  def: LoadoutDef;
  rounds: Record<PylonId, number>;
  stingerRounds: number;
}

const W = AIRCRAFT.weights;

export const REFERENCE_WEIGHT = W.emptyKg + W.fuelFullKg * 0.5;

export const STANDARD_LOADOUT: LoadoutDef = {
  pylons: { L2: 'hydra70', L1: 'agm114k', R1: 'agm114k', R2: 'hydra70' },
  stingers: false,
  gunRounds: 1200,
  fuel: 100,
};

export const CLEAN_LOADOUT: LoadoutDef = {
  pylons: { L2: 'empty', L1: 'empty', R1: 'empty', R2: 'empty' },
  stingers: false,
  gunRounds: 0,
  fuel: 60,
};

export function capacity(store: Store) {
  return store === 'hydra70' ? 19 : store === 'empty' ? 0 : 4;
}

export function createLoadout(def: LoadoutDef): Loadout {
  const rounds = {} as Record<PylonId, number>;
  for (const p of PYLONS) rounds[p] = capacity(def.pylons[p]);
  return { def: { ...def, pylons: { ...def.pylons } }, rounds, stingerRounds: def.stingers ? 2 : 0 };
}

export function storesWeight(lo: Loadout) {
  let kg = 0;
  for (const p of PYLONS) {
    const s = lo.def.pylons[p];
    if (s === 'hydra70') kg += W.rocketPodKg + lo.rounds[p] * W.rocketKg;
    else if (s !== 'empty') kg += W.hellfireLauncherKg + lo.rounds[p] * W.hellfireKg;
  }
  if (lo.def.stingers) kg += W.stingerLauncherKg;
  return kg;
}

export function grossWeight(lo: Loadout, fuelPct: number, gunRounds: number) {
  return W.emptyKg + W.fuelFullKg * (fuelPct / 100) + gunRounds * W.gunRoundKg + storesWeight(lo);
}

export function thrustScale(weightKg: number) {
  return REFERENCE_WEIGHT / weightKg;
}

export function hoverCollective(weightKg: number, maxThrustG = AIRCRAFT.maxThrustG) {
  return 1 / (maxThrustG * thrustScale(weightKg));
}

export function count(lo: Loadout, store: Store) {
  return PYLONS.reduce((n, p) => n + (lo.def.pylons[p] === store ? lo.rounds[p] : 0), 0);
}
