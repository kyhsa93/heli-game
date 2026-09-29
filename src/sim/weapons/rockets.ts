import { Quaternion, Vector3 } from 'three';
import { toWorld, type HeliState } from '../heli/state';
import { PYLON_X, PYLONS, type Loadout, type PylonId } from '../heli/loadout';
import type { World } from '../world';
import { WEAPONS } from './damage';
import { sightPoint } from './ballistics';
import { integrate, segmentHitsTerrain, type Projectile } from './projectile';

export const HYDRA = WEAPONS.hydra70;
export const POD_MUZZLE_Y = -0.2;
export const POD_MUZZLE_Z = -0.7;
export const SALVO_INTERVAL = HYDRA.salvoInterval ?? 0.1;

export function rocketPods(lo: Loadout): PylonId[] {
  return PYLONS.filter(p => lo.def.pylons[p] === 'hydra70');
}

export function nextPod(lo: Loadout, fired: number): PylonId | null {
  const pods = rocketPods(lo).filter(p => lo.rounds[p] > 0);
  if (!pods.length) return null;
  const left = pods.filter(p => PYLON_X[p] < 0), right = pods.filter(p => PYLON_X[p] > 0);
  const side = fired % 2 === 0 ? (left.length ? left : right) : (right.length ? right : left);
  return side[Math.floor(fired / 2) % side.length];
}

export function podMuzzle(h: HeliState, pylon: PylonId, out = new Vector3()) {
  return toWorld(h, new Vector3(PYLON_X[pylon], POD_MUZZLE_Y, POD_MUZZLE_Z), out);
}

export function boresight(h: HeliState, out = new Vector3()) {
  return out.set(0, 0, -1).applyQuaternion(h.q);
}

export function launchVelocity(h: HeliState, dir: Vector3, out = new Vector3()) {
  return out.copy(dir).multiplyScalar(HYDRA.launchSpeed ?? 60).add(h.vel);
}

export function rocketProjectile(h: HeliState, pos: Vector3, dir: Vector3): Omit<Projectile, 'id' | 'owner'> {
  return {
    weapon: 'hydra70', pos: pos.clone(), origin: pos.clone(), vel: launchVelocity(h, dir),
    life: 60, drag: HYDRA.drag ?? 0, tracer: true, burn: HYDRA.burnTime, thrust: HYDRA.thrust,
  };
}

const probe: Projectile = { id: -1, weapon: 'hydra70', owner: -1, pos: new Vector3(), vel: new Vector3(), origin: new Vector3(), life: 0, drag: 0, tracer: false };

export interface RocketFlight { point: Vector3; time: number }

export function flyRocket(world: World, pos: Vector3, dir: Vector3, stopAt: (p: Vector3) => boolean, step = 1 / 60): RocketFlight | null {
  const r = rocketProjectile(world.player, pos, dir);
  probe.pos.copy(r.pos); probe.vel.copy(r.vel); probe.drag = r.drag; probe.burn = r.burn; probe.thrust = r.thrust; probe.life = 60;
  let t = 0;
  while (t < 40) {
    const a = integrate(probe, step).clone();
    t += step;
    if (stopAt(probe.pos)) return { point: probe.pos.clone(), time: t };
    const hit = segmentHitsTerrain(a, probe.pos, world.terrain);
    if (hit !== null) return { point: a.lerp(probe.pos, hit), time: t - step * (1 - hit) };
    if (probe.pos.distanceTo(pos) > HYDRA.maxRange * 1.2) return null;
  }
  return null;
}

export interface RocketSolution { yaw: number; pitch: number; range: number; time: number; dir: Vector3 }

const inv = new Quaternion();

export function rocketSolution(world: World, target: Vector3): RocketSolution | null {
  const h = world.player;
  const pos = h.pos.clone();
  const range = Math.hypot(target.x - pos.x, target.z - pos.z);
  if (range < 1 || range > HYDRA.maxRange) return null;
  const azT = Math.atan2(target.x - pos.x, target.z - pos.z);
  let az = azT;
  let el = Math.atan2(target.y - pos.y, range);
  let time = 0;
  for (let i = 0; i < 6; i++) {
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const f = flyRocket(world, pos, dir, p => Math.hypot(p.x - pos.x, p.z - pos.z) >= range);
    if (!f) { el += 0.05; continue; }
    time = f.time;
    const dy = target.y - f.point.y;
    const hitAz = Math.atan2(f.point.x - pos.x, f.point.z - pos.z);
    let dAz = azT - hitAz;
    dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz));
    el += Math.atan2(dy, range);
    az += dAz;
    if (Math.abs(dy) < 0.5 && Math.abs(dAz) * range < 0.5) break;
  }
  if (!time || el > 0.7) return null;
  const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const local = dir.clone().applyQuaternion(inv.copy(h.q).invert());
  return { yaw: Math.atan2(-local.x, -local.z), pitch: Math.asin(Math.max(-1, Math.min(1, local.y))), range, time, dir };
}

export function rocketTarget(world: World): { point: Vector3; laser: boolean } | null {
  const d = world.designation();
  if (d) return { point: d, laser: true };
  const p = sightPoint(world, world.commands.aim, HYDRA.maxRange);
  return p ? { point: p, laser: false } : null;
}
