import { Vector3 } from 'three';
import type { World } from '../world';
import { aimDirection, gunInLimits, muzzlePosition } from './arms';
import { WEAPONS } from './damage';
import { integrate, segmentHitsTerrain, type Projectile } from './projectile';

const probe: Projectile = { id: -1, weapon: 'gun30', pos: new Vector3(), vel: new Vector3(), owner: -1, life: 0, drag: 0, tracer: false };

export interface Prediction { point: Vector3; range: number; time: number }

export function predictGunImpact(world: World, step = 1 / 60): Prediction | null {
  const h = world.player, w = WEAPONS.gun30;
  if (!gunInLimits(world.commands.aim)) return null;
  const start = muzzlePosition(h);
  probe.pos.copy(start);
  probe.vel.copy(aimDirection(h, world.commands.aim)).multiplyScalar(w.speed).add(h.vel);
  probe.drag = w.drag ?? 0;
  probe.life = 10;
  let t = 0;
  while (t < 6) {
    const a = integrate(probe, step).clone();
    t += step;
    const hit = segmentHitsTerrain(a, probe.pos, world.terrain);
    if (hit !== null) {
      const point = a.lerp(probe.pos, hit);
      return { point, range: point.distanceTo(start), time: t - step * (1 - hit) };
    }
    if (probe.pos.distanceTo(start) > w.maxRange * 1.2) return null;
  }
  return null;
}
