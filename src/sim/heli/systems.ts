import { clamp } from '../../core/math';
import type { Emit } from '../events';
import { AIRCRAFT } from './airframe';
import { leakFactor } from './damage';
import type { HeliState } from './state';

export function burnFuel(h: HeliState, collective: number, dt: number, emit: Emit) {
  if (!h.engineOn) return;
  const f = AIRCRAFT.fuel;
  h.fuel = Math.max(0, h.fuel - (f.burnBase + f.burnPerCollective * collective * h.rpm) * f.burnScale * h.fuelBurnScale * leakFactor(h.damage) * dt);
  if (h.fuel <= 0) { h.engineOn = false; emit({ t: 'engine', on: false, cause: 'fuel' }); }
}

export function stepRotor(h: HeliState, inflow: number, collective: number, dt: number) {
  const r = AIRCRAFT.rpm;
  let drpm = h.landed ? 0 : r.autorotationGain * Math.max(0, inflow);
  drpm -= (r.dragBase + r.dragPerCollective * collective) * h.rpm * (h.engineOn ? 0 : 1);
  if (h.engineOn) drpm += (1 - h.rpm) * (h.rpm < r.spoolThreshold ? r.spoolRate : r.governRate);
  else if (h.landed) drpm -= r.groundSpindown * h.rpm;
  h.rpm = clamp(h.rpm + drpm * dt, 0, r.max);
}

export function toggleEngine(h: HeliState, emit: Emit) {
  if (!h.alive) return;
  if (h.engineOn) { h.engineOn = false; emit({ t: 'engine', on: false }); }
  else if (h.fuel > 0 && (h.damage.engine1 > 0 || h.damage.engine2 > 0) && h.rotorFailIn !== 0) { h.engineOn = true; emit({ t: 'engine', on: true }); }
}
