import type { BattleHooks, World } from '../world';

export type BattleSystem = (world: World, dt: number) => void;

export interface BattleSystems {
  tick10Hz: BattleSystem[];
  tick1Hz: BattleSystem[];
}

export function composeHooks(systems: BattleSystems): BattleHooks {
  return {
    tick10Hz(world, dt) { for (const s of systems.tick10Hz) s(world, dt); },
    tick1Hz(world, dt) { for (const s of systems.tick1Hz) s(world, dt); },
  };
}
