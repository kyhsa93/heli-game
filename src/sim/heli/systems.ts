import { clamp } from '../../core/math';
import type { Emit } from '../events';
import type { HeliState } from './state';

export function burnFuel(h: HeliState, collective: number, dt: number, emit: Emit) {
  if (!h.engineOn) return;
  h.fuel = Math.max(0, h.fuel - (0.05 + 0.3 * collective * h.rpm) * dt);
  if (h.fuel <= 0) { h.engineOn = false; emit({ t: 'engine', on: false, cause: 'fuel' }); }
}

export function stepRotor(h: HeliState, inflow: number, collective: number, dt: number) {
  let drpm = h.landed ? 0 : 0.012 * Math.max(0, inflow);
  drpm -= (0.02 + 0.09 * collective) * h.rpm * (h.engineOn ? 0 : 1);
  if (h.engineOn) drpm += (1 - h.rpm) * (h.rpm < 0.9 ? 0.4 : 1.5);
  else if (h.landed) drpm -= 0.05 * h.rpm;
  h.rpm = clamp(h.rpm + drpm * dt, 0, 1.12);
}

export function toggleEngine(h: HeliState, emit: Emit) {
  if (!h.alive) return;
  if (h.engineOn) { h.engineOn = false; emit({ t: 'engine', on: false }); }
  else if (h.fuel > 0) { h.engineOn = true; emit({ t: 'engine', on: true }); }
}
