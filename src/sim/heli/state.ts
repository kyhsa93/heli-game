import { Euler, Quaternion, Vector3 } from 'three';
import type { Terrain } from '../terrain';
import { GEAR_Y } from './airframe';

export interface Controls { cyclicX: number; cyclicY: number; pedal: number; collective: number }

export interface HeliState {
  pos: Vector3; vel: Vector3;
  yaw: number; pitch: number; roll: number;
  pRate: number; rRate: number; yRate: number;
  q: Quaternion;
  rpm: number; engineOn: boolean; collective: number; fuel: number;
  landed: boolean; alive: boolean;
  touchdownDescent: number;
}

const tmpEuler = new Euler(0, 0, 0, 'YXZ');
const tmpV = new Vector3();

export function createHeli(pos: Vector3, yaw: number): HeliState {
  const h: HeliState = {
    pos: pos.clone(), vel: new Vector3(),
    yaw, pitch: 0, roll: 0, pRate: 0, rRate: 0, yRate: 0,
    q: new Quaternion(), rpm: 0, engineOn: false, collective: 0, fuel: 100,
    landed: true, alive: true, touchdownDescent: 0,
  };
  updateQ(h);
  return h;
}

export function updateQ(h: HeliState) {
  tmpEuler.set(h.pitch, h.yaw, -h.roll, 'YXZ');
  h.q.setFromEuler(tmpEuler);
}

export function toWorld(h: HeliState, local: Vector3, out = new Vector3()) {
  return out.copy(local).applyQuaternion(h.q).add(h.pos);
}

export function agl(h: HeliState, terrain: Terrain) {
  return h.pos.y + GEAR_Y - terrain.surfaceAt(h.pos.x, h.pos.z);
}

export function airspeed(h: HeliState, wind: Vector3) {
  return tmpV.copy(h.vel).sub(wind).length();
}

export function groundAttitude(h: HeliState, t: Terrain) {
  const fx = -Math.sin(h.yaw), fz = -Math.cos(h.yaw), rx = Math.cos(h.yaw), rz = -Math.sin(h.yaw);
  const { x, z } = h.pos;
  const pitch = Math.atan2(t.heightAt(x + fx * 2.35, z + fz * 2.35) - t.heightAt(x - fx * 7.9, z - fz * 7.9), 10.25);
  const roll = Math.atan2(t.heightAt(x - rx * 1.2, z - rz * 1.2) - t.heightAt(x + rx * 1.2, z + rz * 1.2), 2.4);
  return { pitch, roll };
}
