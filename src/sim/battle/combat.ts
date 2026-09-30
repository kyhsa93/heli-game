import { eyeOf } from '../ai/awareness';
import { pairKey } from '../los';
import { armorMultiplier } from '../weapons/damage';
import type { Unit } from '../units';
import type { World } from '../world';
import { targetClass, usableWeapons } from './targeting';
import { Vector3 } from 'three';

export function hitChance(w: { accuracy?: number; range: number }, dist: number, skill = 1) {
  return Math.max(0, Math.min(1, (w.accuracy ?? 0) * (1 - (dist / w.range) ** 2) * skill));
}

const eye = new Vector3(), at = new Vector3();

export function stepCombat(world: World, dt: number) {
  for (const u of world.units) {
    const b = u.battle;
    if (!u.alive || !b?.target || b.target.kind !== 'unit') continue;
    const o = world.unit(b.target.id);
    if (!o || !o.alive) { b.target = null; continue; }
    if (b.aim > 0) { b.aim -= dt; continue; }
    fireAt(world, u, o, dt);
  }
}

function fireAt(world: World, u: Unit, o: Unit, dt: number) {
  eyeOf(u, eye); eyeOf(o, at);
  if (!world.los.visual(pairKey(u.id, o.id), eye, at, world.time).clear) return;
  const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
  const b = u.battle!;
  for (const w of usableWeapons(u, targetClass(o.def), d)) {
    let acc = (b.fire[w.id] ?? 0) + w.rate * dt;
    while (acc >= 1 && o.alive) {
      acc -= 1;
      if (world.rng() < hitChance(w, d, u.skill ?? 1)) world.damageUnit(o, w.damage * armorMultiplier(w.penetration, o.def.armor), false);
    }
    b.fire[w.id] = acc;
  }
}
