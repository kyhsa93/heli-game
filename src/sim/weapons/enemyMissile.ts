import { Vector3 } from 'three';
import { G3 } from '../heli/airframe';
import { radarSight, terrainClear } from '../los';
import type { Terrain } from '../terrain';
import { WEAPONS, type WeaponDef } from './damage';

export type ThreatKind = 'ir' | 'radar';

export interface EnemyMissile {
  id: number;
  weapon: string;
  kind: ThreatKind;
  owner: number;
  pos: Vector3;
  vel: Vector3;
  age: number;
  guiding: boolean;
  blind: number;
  launcher: Vector3;
  target: Vector3 | null;
}

export function threatDef(weapon: string): WeaponDef {
  const w = WEAPONS[weapon];
  if (!w) throw new Error(`unknown missile ${weapon}`);
  return w;
}

export function speedAt(w: WeaponDef, age: number) {
  return Math.min(w.speed, 40 + (w.speed / (w.burnTime ?? 2)) * age);
}

const r = new Vector3(), vr = new Vector3(), omega = new Vector3(), acc = new Vector3();

export function pnAccel(m: EnemyMissile, targetPos: Vector3, targetVel: Vector3, n: number, out = new Vector3()) {
  r.copy(targetPos).sub(m.pos);
  vr.copy(targetVel).sub(m.vel);
  const r2 = Math.max(1, r.lengthSq());
  omega.crossVectors(r, vr).divideScalar(r2);
  return out.crossVectors(omega, m.vel).multiplyScalar(-n).negate();
}

export interface StepResult { detonate: boolean; miss: boolean }

export function stepEnemyMissile(m: EnemyMissile, t: Terrain, targetPos: Vector3, targetVel: Vector3, dt: number): StepResult {
  const w = threatDef(m.weapon);
  m.age += dt;
  const aim = m.target ?? targetPos;
  const lineClear = terrainClear(t, m.pos, aim);
  if (m.guiding) {
    if (m.kind === 'radar') {
      if (!lineClear || !radarSight(t, m.launcher, aim)) m.guiding = false;
    } else if (!lineClear) {
      m.blind += dt;
      if (m.blind >= (w.irLostSeconds ?? 2)) m.guiding = false;
    } else m.blind = 0;
  }
  const burning = m.age < (w.burnTime ?? 2);
  if (m.guiding && (m.kind === 'radar' || lineClear)) {
    pnAccel(m, aim, m.target ? new Vector3() : targetVel, w.navConstant ?? 3, acc);
    const max = (w.maxG ?? 25) * G3;
    if (acc.length() > max) acc.setLength(max);
    m.vel.addScaledVector(acc, dt);
  }
  if (burning) {
    m.vel.setLength(speedAt(w, m.age));
  } else {
    const s = m.vel.length();
    m.vel.addScaledVector(m.vel, -(w.drag ?? 0.0003) * s * dt);
    if (!m.guiding) m.vel.y -= G3 * dt;
  }
  const prev = m.pos.clone();
  m.pos.addScaledVector(m.vel, dt);
  const fuse = w.fuse ?? 6;
  const seg = m.pos.clone().sub(prev);
  const k = Math.max(0, Math.min(1, targetPos.clone().sub(prev).dot(seg) / Math.max(1e-9, seg.lengthSq())));
  const closest = prev.clone().addScaledVector(seg, k);
  if (!m.target && closest.distanceTo(targetPos) <= fuse) { m.pos.copy(closest); return { detonate: true, miss: false }; }
  if (m.age > (w.maxFlight ?? 20) || m.pos.y <= t.surfaceAt(m.pos.x, m.pos.z)) return { detonate: false, miss: true };
  return { detonate: false, miss: false };
}
