import { Vector3 } from 'three';
import { EYE } from '../heli/airframe';
import { toWorld } from '../heli/state';
import type { World } from '../world';
import { aimDirection, gunInLimits, muzzlePosition, type Aim } from './arms';
import { WEAPONS } from './damage';
import { integrate, segmentHitsTerrain, type Projectile } from './projectile';

const probe: Projectile = { id: -1, weapon: 'gun30', pos: new Vector3(), vel: new Vector3(), origin: new Vector3(), owner: -1, life: 0, drag: 0, tracer: false };

export interface Prediction { point: Vector3; range: number; time: number; laser: boolean }

export function predictGunImpact(world: World, step = 1 / 60): Prediction | null {
  const h = world.player, w = WEAPONS.gun30;
  if (!gunInLimits(world.commands.aim)) return null;
  const start = muzzlePosition(h);
  probe.pos.copy(start);
  probe.vel.copy(aimDirection(h, world.commands.aim)).multiplyScalar(w.speed).add(h.vel);
  probe.drag = w.drag ?? 0;
  probe.life = 10;
  const lased = world.laser.on ? world.laser.range : null;
  let t = 0;
  while (t < 6) {
    const a = integrate(probe, step).clone();
    t += step;
    if (lased !== null && probe.pos.distanceTo(start) >= lased) {
      return { point: probe.pos.clone(), range: lased, time: t, laser: true };
    }
    const hit = segmentHitsTerrain(a, probe.pos, world.terrain);
    if (hit !== null) {
      const point = a.lerp(probe.pos, hit);
      return { point, range: point.distanceTo(start), time: t - step * (1 - hit), laser: false };
    }
    if (probe.pos.distanceTo(start) > w.maxRange * 1.2) return null;
  }
  return null;
}

export function sightPoint(world: World, aim: Aim, maxRange = 8000): Vector3 | null {
  const h = world.player;
  const start = toWorld(h, EYE, new Vector3());
  const dir = aimDirection(h, aim);
  const a = new Vector3(), b = start.clone();
  for (let d = 10; d <= maxRange; d += 10) {
    a.copy(b);
    b.copy(start).addScaledVector(dir, d);
    const hit = segmentHitsTerrain(a, b, world.terrain);
    if (hit !== null) return a.lerp(b, hit);
  }
  return null;
}
