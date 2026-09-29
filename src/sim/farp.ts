import { PYLONS, type LoadoutDef } from './heli/loadout';
import { createDamage } from './heli/damage';
import type { World } from './world';

export const REARM_PER_PYLON = 15;
export const REPAIR_SECONDS = 60;

export interface FarpService {
  pad: number;
  repairLeft: number;
  rearmLeft: number;
  rearm: LoadoutDef | null;
}

export function rearmSeconds(world: World, def: LoadoutDef) {
  const lo = world.loadout;
  let pylons = 0;
  for (const p of PYLONS) {
    const want = def.pylons[p];
    const full = want === 'empty' ? 0 : want === 'hydra70' ? 19 : 4;
    if (want !== lo.def.pylons[p] || lo.rounds[p] < full) pylons++;
  }
  if (def.gunRounds !== world.arms.gunAmmo) pylons++;
  if (def.stingers !== lo.def.stingers || (def.stingers && lo.stingerRounds < 2)) pylons++;
  return pylons * REARM_PER_PYLON;
}

export function farpUnder(world: World) {
  const i = world.padUnder();
  return i >= 0 && world.pads[i].base ? i : -1;
}

export function startService(world: World, opts: { repair?: boolean; rearm?: LoadoutDef | null }): FarpService | null {
  const pad = farpUnder(world);
  if (pad < 0 || !world.player.landed || !world.player.alive) return null;
  const s: FarpService = {
    pad,
    repairLeft: opts.repair ? REPAIR_SECONDS : 0,
    rearm: opts.rearm ?? null,
    rearmLeft: opts.rearm ? rearmSeconds(world, opts.rearm) : 0,
  };
  if (!s.repairLeft && !s.rearmLeft) return null;
  world.farpService = s;
  world.emit({ t: 'farp', state: 'started', repair: s.repairLeft, rearm: s.rearmLeft });
  return s;
}

export function stepService(world: World, dt: number) {
  const s = world.farpService;
  if (!s) return;
  const h = world.player;
  if (!h.landed || !h.alive || world.padUnder() !== s.pad) {
    world.farpService = null;
    world.emit({ t: 'farp', state: 'cancelled', repair: s.repairLeft, rearm: s.rearmLeft });
    return;
  }
  if (s.repairLeft > 0) {
    s.repairLeft = Math.max(0, s.repairLeft - dt);
    if (s.repairLeft === 0) { h.damage = createDamage(); h.rotorFailIn = null; }
  }
  if (s.rearmLeft > 0) {
    s.rearmLeft = Math.max(0, s.rearmLeft - dt);
    if (s.rearmLeft === 0 && s.rearm) world.rearm(s.rearm);
  }
  if (s.repairLeft === 0 && s.rearmLeft === 0) {
    world.farpService = null;
    world.emit({ t: 'farp', state: 'done', repair: 0, rearm: 0 });
  }
}
