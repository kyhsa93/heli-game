import { Vector3 } from 'three';
import { EYE } from '../heli/airframe';
import { toWorld } from '../heli/state';
import type { World } from '../world';
import { Quaternion } from 'three';
import { castRay } from '../sensors/laser';
import { tadsPosition } from '../sensors/tads';
import { aimDirection, gunInLimits, muzzlePosition, type Aim } from './arms';
import { WEAPONS } from './damage';
import { integrate, segmentHitsTerrain, type Projectile } from './projectile';

const probe: Projectile = { id: -1, weapon: 'gun30', pos: new Vector3(), vel: new Vector3(), origin: new Vector3(), owner: -1, life: 0, drag: 0, tracer: false };

export interface Prediction { point: Vector3; range: number; time: number; laser: boolean }

export function predictGunImpact(world: World, step = 1 / 60): Prediction | null {
  const h = world.player, w = WEAPONS.gun30;
  const aim = gunAim(world);
  if (!gunInLimits(aim)) return null;
  const start = muzzlePosition(h);
  probe.pos.copy(start);
  probe.vel.copy(aimDirection(h, aim)).multiplyScalar(w.speed).add(h.vel);
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

export const GUN_SIGHT_MAX = 3000;
export const GUN_DEFAULT_RANGE = 1000;

export function gunTarget(world: World): { point: Vector3; laser: boolean } {
  const h = world.player;
  if (world.laser.on && world.laser.point) return { point: world.laser.point.clone(), laser: true };
  const origin = world.tads.active ? tadsPosition(h) : toWorld(h, EYE, new Vector3());
  const dir = world.sensorDirection();
  const hit = castRay(world.terrain, world.units.filter(u => u.alive), origin, dir, GUN_SIGHT_MAX);
  return { point: hit ? hit.point : origin.addScaledVector(dir, GUN_DEFAULT_RANGE), laser: false };
}

const shot: Projectile = { id: -2, weapon: 'gun30', pos: new Vector3(), vel: new Vector3(), origin: new Vector3(), owner: -1, life: 0, drag: 0, tracer: false };
const inv = new Quaternion();

function closestPass(start: Vector3, vel0: Vector3, drag: number, target: Vector3, step: number) {
  shot.pos.copy(start); shot.vel.copy(vel0); shot.drag = drag; shot.life = 10;
  let best = shot.pos.clone(), bestD = Infinity;
  for (let t = 0; t < 7; t += step) {
    integrate(shot, step);
    const d = shot.pos.distanceTo(target);
    if (d < bestD) { bestD = d; best = shot.pos.clone(); } else if (d > bestD + 1) break;
  }
  return best;
}

export function gunSolution(world: World, target: Vector3, step = 1 / 120): Aim {
  const h = world.player, w = WEAPONS.gun30;
  const start = muzzlePosition(h);
  const dir = target.clone().sub(start).normalize();
  const vel = new Vector3();
  for (let i = 0; i < 5; i++) {
    const pass = closestPass(start, vel.copy(dir).multiplyScalar(w.speed).add(h.vel), w.drag ?? 0, target, step);
    const range = Math.max(1, pass.distanceTo(start));
    const miss = target.clone().sub(pass);
    if (miss.length() < 0.2) break;
    dir.addScaledVector(miss, 1 / range).normalize();
  }
  const local = dir.applyQuaternion(inv.copy(h.q).invert());
  return { yaw: Math.atan2(-local.x, -local.z), pitch: Math.asin(Math.max(-1, Math.min(1, local.y))) };
}

export function gunAim(world: World): Aim {
  return gunSolution(world, gunTarget(world).point);
}
