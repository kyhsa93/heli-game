import { Vector3 } from 'three';

import aircraft from '../../content/aircraft.json';

export const AIRCRAFT = aircraft;
export const G3 = 9.81;
export const MAX_THRUST = aircraft.maxThrustG * G3;
export const GEAR_Y = aircraft.gearHeight;
export const ROTOR_R = aircraft.rotor.radius;
export const ROTOR_Y = aircraft.rotor.hubHeight;
export const ROTOR_HZ = aircraft.rotor.hz;
export const BLADES = aircraft.rotor.blades;
export const LAND_DESCENT = aircraft.landing.maxDescent;
export const LAND_HS = aircraft.landing.maxHorizontal;
export const LAND_ATT = aircraft.landing.maxAttitudeDeg * Math.PI / 180;
export const SLOPE_MAX = aircraft.landing.maxSlopeDeg * Math.PI / 180;
export const MAX_PITCH = aircraft.maxPitchDeg * Math.PI / 180;
export const MAX_ROLL = aircraft.maxRollDeg * Math.PI / 180;
export const EYE = new Vector3(...(aircraft.eye as [number, number, number]));
export const BASE_REFUEL_RATE = aircraft.fuel.baseRefuelRate;

export const GEAR = [
  new Vector3(-1.2, GEAR_Y, -2.35), new Vector3(1.2, GEAR_Y, -2.35), new Vector3(0, GEAR_Y, 7.9),
];
export const HULL = [
  new Vector3(0, -0.75, -6.8), new Vector3(0, -1.25, -5.0), new Vector3(0, -1.05, -2.0), new Vector3(0, -1.05, 1.5),
  new Vector3(0, -0.3, 8.0), new Vector3(-1.7, 0, 8.7), new Vector3(1.7, 0, 8.7), new Vector3(0, 2.5, 9.3),
  new Vector3(-0.35, 0.7, 9.0), new Vector3(-2.6, 0.3, 0.15), new Vector3(2.6, 0.3, 0.15),
  new Vector3(-2.1, -0.3, 0.2), new Vector3(2.1, -0.3, 0.2),
];
export const ROTOR_TIPS = Array.from({ length: 8 }, (_, i) => new Vector3(Math.cos(i * Math.PI / 4) * ROTOR_R, ROTOR_Y, Math.sin(i * Math.PI / 4) * ROTOR_R));
