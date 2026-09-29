import { Vector3 } from 'three';
import { clamp } from '../../core/math';
import type { Emit } from '../events';
import type { Terrain } from '../terrain';
import {
  AIRCRAFT, G3, GEAR, GEAR_Y, HULL, LAND_ATT, LAND_DESCENT, LAND_HS, MAX_PITCH, MAX_ROLL, MAX_THRUST, ROTOR_R, ROTOR_TIPS, ROTOR_Y, SLOPE_MAX,
} from './airframe';
import { controlFactor, pedalFactor, tailSpin, thrustFactor } from './damage';
import { agl, groundAttitude, toWorld, updateQ, type Controls, type HeliState } from './state';
import { burnFuel, stepRotor } from './systems';

export interface FlightEnv { terrain: Terrain; wind: Vector3 }

const tmpV = new Vector3();

export function liftPerCollective(h: HeliState, env: FlightEnv) {
  const height = agl(h, env.terrain);
  const ge = AIRCRAFT.groundEffect, ceil = AIRCRAFT.ceiling;
  const ground = height < ge.height ? 1 + ge.gain * (1 - Math.max(0, height) / ge.height) : 1;
  const ceiling = h.pos.y > ceil.start ? Math.max(0, 1 - (h.pos.y - ceil.start) / ceil.fade) : 1;
  return MAX_THRUST * h.thrustScale * thrustFactor(h.damage) * h.rpm * h.rpm * ground * ceiling;
}

export function stepFlight(h: HeliState, c: Controls, env: FlightEnv, dt: number, emit: Emit): 'air' | 'ground' {
  const collective = clamp(c.collective, 0, 1);
  const dColl = (collective - h.collective) / dt;
  h.collective = collective;

  burnFuel(h, collective, dt, emit);

  const up = tmpV.set(0, 1, 0).applyQuaternion(h.q).clone();
  const fwd = new Vector3(0, 0, -1).applyQuaternion(h.q);
  const right = new Vector3(1, 0, 0).applyQuaternion(h.q);
  const air = h.vel.clone().sub(env.wind);
  stepRotor(h, -air.dot(up), collective, dt);

  const thrust = liftPerCollective(h, env) * collective;

  if (h.landed) {
    h.vel.set(0, 0, 0);
    if (thrust > G3 * AIRCRAFT.takeoffThrustRatio) { h.landed = false; h.vel.y = 0.2; }
    else { h.pRate = h.rRate = h.yRate = 0; return 'ground'; }
  }

  const tp = -c.cyclicY * MAX_PITCH, tr = c.cyclicX * MAX_ROLL;
  const response = controlFactor(h.damage);
  const k = AIRCRAFT.attitude.stiffness * response, d = AIRCRAFT.attitude.damping * Math.sqrt(response);
  h.pRate += (k * (tp - h.pitch) - d * h.pRate) * dt;
  h.rRate += (k * (tr - h.roll) - d * h.rRate) * dt;
  h.pitch += h.pRate * dt; h.roll += h.rRate * dt;

  const hs = Math.hypot(air.x, air.z);
  const y = AIRCRAFT.yaw;
  let yawTarget = -c.pedal * y.pedalRate * pedalFactor(h.damage) + tailSpin(h.damage, hs, collective);
  if (hs > y.coordinationSpeed) yawTarget -= Math.min(1, (hs - y.coordinationSpeed) / y.coordinationBlend) * G3 * Math.tan(h.roll) / hs;
  h.yRate += (yawTarget - h.yRate) * y.response * dt - dColl * y.torqueCoupling * h.rpm;
  h.yaw += h.yRate * dt;
  updateQ(h);

  const vf = air.dot(fwd), vr = air.dot(right), vu = air.dot(up);
  const acc = up.multiplyScalar(thrust);
  acc.y -= G3;
  const dr = AIRCRAFT.drag;
  acc.addScaledVector(fwd, -(dr.forward.linear * vf + dr.forward.quadratic * vf * Math.abs(vf)));
  acc.addScaledVector(right, -(dr.side.linear * vr + dr.side.quadratic * vr * Math.abs(vr)));
  acc.addScaledVector(new Vector3(0, 1, 0).applyQuaternion(h.q), -(dr.vertical.linear * vu + dr.vertical.quadratic * vu * Math.abs(vu)));
  h.vel.addScaledVector(acc, dt);
  h.pos.addScaledVector(h.vel, dt);
  return 'air';
}

export function clampToArea(h: HeliState, half: number) {
  const lim = half - 150;
  let hit = false;
  for (const k of ['x', 'z'] as const) {
    if (Math.abs(h.pos[k]) > lim) {
      h.pos[k] = Math.sign(h.pos[k]) * lim;
      h.vel[k] *= -0.2;
      hit = true;
    }
  }
  return hit;
}

export function collide(h: HeliState, t: Terrain, emit: Emit) {
  const p = new Vector3();
  const crash = (reason: Parameters<Emit>[0] & { t: 'crash' }) => { h.alive = false; h.engineOn = false; emit(reason); };
  for (const tip of ROTOR_TIPS) {
    toWorld(h, tip, p);
    if (p.y < t.surfaceAt(p.x, p.z)) { crash({ t: 'crash', reason: 'rotorStrike' }); return; }
  }
  for (const pt of HULL) {
    toWorld(h, pt, p);
    if (p.y < t.surfaceAt(p.x, p.z)) {
      crash({ t: 'crash', reason: p.y < 0.3 && t.heightAt(p.x, p.z) < 0 ? 'water' : 'terrain' });
      return;
    }
  }
  for (const tr of t.treesNear(h.pos.x, h.pos.z)) {
    if (Math.hypot(tr.x - h.pos.x, tr.z - h.pos.z) < tr.r + ROTOR_R - 0.5 && h.pos.y + GEAR_Y < tr.y + tr.h && h.pos.y + ROTOR_Y > tr.y) {
      crash({ t: 'crash', reason: 'tree' }); return;
    }
  }
  for (const b of t.buildings) {
    if (Math.abs(b.x - h.pos.x) < b.w / 2 + ROTOR_R - 0.5 && Math.abs(b.z - h.pos.z) < b.d / 2 + ROTOR_R - 0.5 && h.pos.y + GEAR_Y < b.y + b.h + (b.kind === 'house' ? 2.4 : 0)) {
      crash({ t: 'crash', reason: 'building' }); return;
    }
  }

  if (h.vel.y > 0.1) return;
  let touching = false;
  for (const s of GEAR) { toWorld(h, s, p); if (p.y <= t.surfaceAt(p.x, p.z)) { touching = true; break; } }
  if (!touching) return;

  const descent = -h.vel.y, hs = Math.hypot(h.vel.x, h.vel.z);
  const n = t.normalAt(h.pos.x, h.pos.z);
  const ga = groundAttitude(h, t);
  if (t.heightAt(h.pos.x, h.pos.z) < 0.3) crash({ t: 'crash', reason: 'ditched' });
  else if (descent > LAND_DESCENT) crash({ t: 'crash', reason: 'hardLanding', value: descent });
  else if (hs > LAND_HS) crash({ t: 'crash', reason: 'slideLanding', value: hs });
  else if (Math.abs(h.pitch - ga.pitch) > LAND_ATT || Math.abs(h.roll - ga.roll) > LAND_ATT) crash({ t: 'crash', reason: 'tiltLanding' });
  else if (Math.acos(n.y) > SLOPE_MAX) crash({ t: 'crash', reason: 'slope' });
  else {
    h.landed = true;
    h.pitch = ga.pitch; h.roll = ga.roll;
    h.pRate = h.rRate = h.yRate = 0;
    h.vel.set(0, 0, 0);
    h.pos.y = t.heightAt(h.pos.x, h.pos.z) - GEAR_Y;
    updateQ(h);
    h.touchdownDescent = descent;
    emit({ t: 'landed', descent });
  }
}
