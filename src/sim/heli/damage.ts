import { Vector3 } from 'three';

export const SYSTEMS = ['engine1', 'engine2', 'rotor', 'tail', 'hydraulics', 'sensors', 'fuel', 'cockpit'] as const;
export type SystemId = typeof SYSTEMS[number];
export type Damage = Record<SystemId, number>;

export const DAMAGED = 50;
export const ROTOR_FAIL_SECONDS = 60;
export const TAIL_SPIN = 1.4;
export const WEATHERVANE_SPEED = 40 * 0.514444;
export const BLAST_REACH = 12;
export const BLAST_SHARE = 0.35;

export const SYSTEM_CENTER: Record<SystemId, Vector3> = {
  engine1: new Vector3(-0.9, 0.35, 0),
  engine2: new Vector3(0.9, 0.35, 0),
  rotor: new Vector3(0, 1.9, 0),
  tail: new Vector3(0, 0.6, 7.5),
  hydraulics: new Vector3(0, -0.3, 0.5),
  sensors: new Vector3(0, -0.7, -6.4),
  fuel: new Vector3(0, -0.9, -0.5),
  cockpit: new Vector3(0, 0.1, -3.6),
};

export function createDamage(): Damage {
  return { engine1: 100, engine2: 100, rotor: 100, tail: 100, hydraulics: 100, sensors: 100, fuel: 100, cockpit: 100 };
}

export function systemAt(p: Vector3): SystemId {
  if (p.y > 1.3 && Math.abs(p.x) < 1.2 && Math.abs(p.z) < 1.5) return 'rotor';
  if (p.z > 5) return 'tail';
  if (p.z < -5.6) return 'sensors';
  if (p.z < -1.8 && p.y > -0.4) return 'cockpit';
  if (Math.abs(p.x) > 0.55 && p.y > -0.2 && p.z >= -1.8 && p.z <= 2) return p.x < 0 ? 'engine1' : 'engine2';
  if (p.y < -0.6) return 'fuel';
  return 'hydraulics';
}

export function randomHitPoint(rng: () => number, fromLocal: Vector3, out = new Vector3()) {
  const z = -6.8 + rng() * 16.1;
  const half = z > 3 ? 0.35 : 1.1;
  const side = fromLocal.x >= 0 ? 1 : -1;
  const x = side * rng() * half * (rng() < 0.75 ? 1 : -1);
  const y = -1.1 + rng() * (Math.abs(z) < 1.5 ? 3 : 1.9);
  return out.set(x, y, z);
}

export function hitSystem(d: Damage, id: SystemId, amount: number) {
  const before = d[id];
  d[id] = Math.max(0, d[id] - amount);
  return before;
}

export function blastShares(center: Vector3, amount: number): [SystemId, number][] {
  return SYSTEMS.map(id => [id, amount * BLAST_SHARE * Math.max(0, 1 - SYSTEM_CENTER[id].distanceTo(center) / BLAST_REACH)]);
}

export function thrustFactor(d: Damage) {
  const pen = (v: number) => (v <= 0 ? 0.5 : v <= DAMAGED ? 0.15 : 0);
  return Math.max(0, 1 - pen(d.engine1) - pen(d.engine2));
}

export function pedalFactor(d: Damage) {
  return d.tail <= 0 ? 0 : d.tail <= DAMAGED ? 0.6 : 1;
}

export function controlFactor(d: Damage) {
  return d.hydraulics <= 0 ? 0.4 : d.hydraulics <= DAMAGED ? 0.7 : 1;
}

export function leakFactor(d: Damage) {
  return d.fuel <= 0 ? 4 : d.fuel <= DAMAGED ? 2 : 1;
}

export function tailSpin(d: Damage, airspeed: number, collective: number) {
  if (d.tail > 0) return 0;
  return TAIL_SPIN * collective * Math.max(0, 1 - airspeed / WEATHERVANE_SPEED);
}

export type Warning =
  | 'ENGINE 1 FIRE' | 'ENGINE 1 OUT' | 'ENGINE 2 FIRE' | 'ENGINE 2 OUT' | 'XMSN CHIP' | 'LAND NOW' | 'TAIL ROTOR'
  | 'HYD PRI' | 'HYD UTIL' | 'TADS FAIL' | 'FUEL LEAK' | 'CANOPY';

export function damageWarnings(d: Damage): Warning[] {
  const w: Warning[] = [];
  if (d.engine1 <= 0) w.push('ENGINE 1 OUT'); else if (d.engine1 <= DAMAGED) w.push('ENGINE 1 FIRE');
  if (d.engine2 <= 0) w.push('ENGINE 2 OUT'); else if (d.engine2 <= DAMAGED) w.push('ENGINE 2 FIRE');
  if (d.rotor <= 0) w.push('LAND NOW'); else if (d.rotor <= DAMAGED) w.push('XMSN CHIP');
  if (d.tail <= DAMAGED) w.push('TAIL ROTOR');
  if (d.hydraulics <= 0) w.push('HYD UTIL'); else if (d.hydraulics <= DAMAGED) w.push('HYD PRI');
  if (d.sensors <= 0) w.push('TADS FAIL');
  if (d.fuel <= DAMAGED) w.push('FUEL LEAK');
  if (d.cockpit <= DAMAGED) w.push('CANOPY');
  return w;
}
