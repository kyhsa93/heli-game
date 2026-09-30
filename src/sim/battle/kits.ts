import type { LoadoutDef } from '../heli/loadout';

export type KitId = 'antiArmor' | 'closeSupport' | 'antiAir';

export const KITS: Record<KitId, LoadoutDef> = {
  antiArmor: { pylons: { L2: 'agm114k', L1: 'agm114k', R1: 'agm114k', R2: 'agm114k' }, stingers: false, gunRounds: 1200, fuel: 80 },
  closeSupport: { pylons: { L2: 'hydra70', L1: 'agm114k', R1: 'agm114k', R2: 'hydra70' }, stingers: false, gunRounds: 1200, fuel: 100 },
  antiAir: { pylons: { L2: 'hydra70', L1: 'agm114k', R1: 'empty', R2: 'empty' }, stingers: true, gunRounds: 1200, fuel: 100 },
};

export const KIT_IDS = Object.keys(KITS) as KitId[];
