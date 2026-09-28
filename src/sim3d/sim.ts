import { Euler, Quaternion, Vector3 } from 'three';
import { clamp } from '../game/math';
import { HALF, PAD_R, Terrain, type Pad3 } from './terrain';

export const G3 = 9.81;
export const MAX_THRUST = 1.7 * G3;
export const SKID_Y = -1.35;
export const ROTOR_R = 5;
export const LAND_DESCENT = 3;
export const LAND_HS = 4;
export const LAND_ATT = 12 * Math.PI / 180;
export const SLOPE_MAX = 10 * Math.PI / 180;
export const MAX_PITCH = 25 * Math.PI / 180;
export const MAX_ROLL = 35 * Math.PI / 180;
export const EYE = new Vector3(0.42, 0.42, -0.72);
export const M_TO_FT = 3.281;
export const MS_TO_KT = 1.944;
export const MS_TO_FPM = 196.85;

const SKIDS = [
  new Vector3(-1, SKID_Y, -1.8), new Vector3(1, SKID_Y, -1.8),
  new Vector3(-1, SKID_Y, 1.3), new Vector3(1, SKID_Y, 1.3),
];
const HULL = [
  new Vector3(0, -0.4, -2.2), new Vector3(0, -0.9, 0), new Vector3(0, 0.4, 5.8), new Vector3(0, -0.4, 5.8),
  ...Array.from({ length: 8 }, (_, i) => new Vector3(Math.cos(i * Math.PI / 4) * ROTOR_R, 1.35, Math.sin(i * Math.PI / 4) * ROTOR_R)),
];

export type Mode3 = 'brief' | 'play' | 'crashed' | 'over';
export type Stage = 'pickup' | 'deliver';

export interface Controls3 { cyclicX: number; cyclicY: number; pedal: number; collective: number }

export interface Heli3 {
  pos: Vector3; vel: Vector3;
  yaw: number; pitch: number; roll: number;
  pRate: number; rRate: number; yRate: number;
  q: Quaternion;
  rpm: number; engineOn: boolean; collective: number; fuel: number;
  landed: boolean; alive: boolean;
}

export interface Mission3 { from: number; to: number; stage: Stage; t0: number; timer: number }
export interface Message { text: string; color: string; life: number }

export interface Snapshot3 {
  mode: Mode3; score: number; delivered: number; best: number; crashReason: string;
}

export interface BestStore3 { load(): number; save(v: number): void }

const noStore: BestStore3 = { load: () => 0, save: () => {} };
const tmpEuler = new Euler(0, 0, 0, 'YXZ');
const tmpV = new Vector3();

export class Sim {
  readonly terrain: Terrain;
  heli!: Heli3;
  mission!: Mission3;
  mode: Mode3 = 'brief';
  controls: Controls3 = { cyclicX: 0, cyclicY: 0, pedal: 0, collective: 0 };
  score = 0;
  delivered = 0;
  best: number;
  time = 0;
  wind = new Vector3();
  messages: Message[] = [];
  crashReason = '';
  touchdownDescent = 0;
  private overTimer = 0;
  private refuelNoted = false;
  private listeners = new Set<() => void>();
  private snapshot!: Snapshot3;
  private readonly random: () => number;
  private readonly store: BestStore3;

  constructor(opts: { seed?: number; random?: () => number; store?: BestStore3 } = {}) {
    this.random = opts.random ?? Math.random;
    this.store = opts.store ?? noStore;
    this.best = this.store.load();
    this.terrain = new Terrain(opts.seed ?? ((this.random() * 1e9) | 0));
    this.reset();
    this.emit();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getSnapshot = () => this.snapshot;

  private emit() {
    this.snapshot = {
      mode: this.mode, score: this.score, delivered: this.delivered, best: this.best, crashReason: this.crashReason,
    };
    for (const fn of this.listeners) fn();
  }

  get pads() { return this.terrain.pads; }

  reset() {
    const base = this.pads[0];
    this.heli = {
      pos: new Vector3(base.x, base.y - SKID_Y, base.z), vel: new Vector3(),
      yaw: this.random() * Math.PI * 2, pitch: 0, roll: 0, pRate: 0, rRate: 0, yRate: 0,
      q: new Quaternion(), rpm: 0, engineOn: false, collective: 0, fuel: 100, landed: true, alive: true,
    };
    this.updateQ();
    this.controls = { cyclicX: 0, cyclicY: 0, pedal: 0, collective: 0 };
    this.score = 0; this.delivered = 0; this.messages = []; this.crashReason = '';
    this.mission = undefined as unknown as Mission3;
    this.newMission(0);
  }

  start() {
    this.reset();
    this.mode = 'play';
    this.emit();
  }

  private newMission(current: number) {
    const idx = this.pads.map((_, i) => i);
    const froms = idx.filter(i => i !== 0 && i !== current);
    const from = froms[(this.random() * froms.length) | 0];
    const tos = idx.filter(i => i !== from);
    const to = tos[(this.random() * tos.length) | 0];
    this.mission = { from, to, stage: 'pickup', t0: this.time, timer: 0 };
  }

  targetPad(): Pad3 {
    const m = this.mission;
    return this.pads[m.stage === 'pickup' ? m.from : m.to];
  }

  say(text: string, color = '#ffd166') {
    this.messages.push({ text, color, life: 3 });
    if (this.messages.length > 4) this.messages.shift();
  }

  toggleEngine() {
    const h = this.heli;
    if (!h.alive || this.mode !== 'play') return;
    if (h.engineOn) { h.engineOn = false; this.say('엔진 정지', '#ef476f'); }
    else if (h.fuel > 0) { h.engineOn = true; this.say('시동 — 로터 회전수가 오를 때까지 기다리세요'); }
  }

  updateQ() {
    const h = this.heli;
    tmpEuler.set(h.pitch, h.yaw, -h.roll, 'YXZ');
    h.q.setFromEuler(tmpEuler);
  }

  toWorld(local: Vector3, out = new Vector3()) {
    return out.copy(local).applyQuaternion(this.heli.q).add(this.heli.pos);
  }

  agl() {
    const h = this.heli;
    return h.pos.y + SKID_Y - this.terrain.surfaceAt(h.pos.x, h.pos.z);
  }

  airspeed() {
    return tmpV.copy(this.heli.vel).sub(this.wind).length();
  }

  padUnder(): number {
    const h = this.heli;
    return this.pads.findIndex(p => Math.hypot(p.x - h.pos.x, p.z - h.pos.z) < PAD_R && Math.abs(h.pos.y + SKID_Y - p.y) < 1);
  }

  groundAttitude() {
    const h = this.heli, t = this.terrain;
    const fx = -Math.sin(h.yaw), fz = -Math.cos(h.yaw), rx = Math.cos(h.yaw), rz = -Math.sin(h.yaw);
    const { x, z } = h.pos;
    const pitch = Math.atan2(t.heightAt(x + fx * 1.5, z + fz * 1.5) - t.heightAt(x - fx * 1.5, z - fz * 1.5), 3);
    const roll = Math.atan2(t.heightAt(x - rx, z - rz) - t.heightAt(x + rx, z + rz), 2);
    return { pitch, roll };
  }

  step(dt: number) {
    this.time += dt;
    const wa = this.time * 0.013;
    const ws = 4 + 2.5 * Math.sin(this.time * 0.05) + 1.5 * Math.sin(this.time * 0.37);
    this.wind.set(Math.cos(wa) * ws, 0, Math.sin(wa) * ws);

    if (this.mode === 'play' && this.heli.alive) this.fly(dt);

    for (const m of this.messages) m.life -= dt;
    this.messages = this.messages.filter(m => m.life > 0);

    if (this.mode === 'crashed') {
      this.overTimer -= dt;
      if (this.overTimer <= 0) { this.mode = 'over'; this.emit(); }
    }
  }

  private fly(dt: number) {
    const h = this.heli, c = this.controls;
    const collective = clamp(c.collective, 0, 1);
    const dColl = (collective - h.collective) / dt;
    h.collective = collective;

    if (h.engineOn) {
      h.fuel = Math.max(0, h.fuel - (0.05 + 0.3 * collective * h.rpm) * dt);
      if (h.fuel <= 0) { h.engineOn = false; this.say('연료 고갈 — 엔진 정지! 콜렉티브를 내려 로터를 살리세요', '#ef476f'); }
    }

    const up = tmpV.set(0, 1, 0).applyQuaternion(h.q).clone();
    const fwd = new Vector3(0, 0, -1).applyQuaternion(h.q);
    const right = new Vector3(1, 0, 0).applyQuaternion(h.q);
    const air = h.vel.clone().sub(this.wind);
    const inflow = -air.dot(up);

    let drpm = h.landed ? 0 : 0.012 * Math.max(0, inflow);
    drpm -= (0.02 + 0.09 * collective) * h.rpm * (h.engineOn ? 0 : 1);
    if (h.engineOn) drpm += (1 - h.rpm) * (h.rpm < 0.9 ? 0.4 : 1.5);
    else if (h.landed) drpm -= 0.05 * h.rpm;
    h.rpm = clamp(h.rpm + drpm * dt, 0, 1.12);

    const agl = this.agl();
    const ground = agl < 10 ? 1 + 0.15 * (1 - Math.max(0, agl) / 10) : 1;
    const ceiling = h.pos.y > 900 ? Math.max(0, 1 - (h.pos.y - 900) / 300) : 1;
    const thrust = MAX_THRUST * collective * h.rpm * h.rpm * ground * ceiling;

    if (h.landed) {
      h.vel.set(0, 0, 0);
      if (thrust > G3 * 1.02) { h.landed = false; h.vel.y = 0.2; }
      else { this.onGround(dt); return; }
    }

    const tp = -c.cyclicY * MAX_PITCH, tr = c.cyclicX * MAX_ROLL;
    h.pRate += (8 * (tp - h.pitch) - 5 * h.pRate) * dt;
    h.rRate += (8 * (tr - h.roll) - 5 * h.rRate) * dt;
    h.pitch += h.pRate * dt; h.roll += h.rRate * dt;

    const hs = Math.hypot(air.x, air.z);
    let yawTarget = -c.pedal * 0.9;
    if (hs > 12) yawTarget -= Math.min(1, (hs - 12) / 10) * G3 * Math.tan(h.roll) / hs;
    h.yRate += (yawTarget - h.yRate) * 3 * dt - dColl * 0.004 * h.rpm;
    h.yaw += h.yRate * dt;
    this.updateQ();

    const vf = air.dot(fwd), vr = air.dot(right), vu = air.dot(up);
    const acc = up.multiplyScalar(thrust);
    acc.y -= G3;
    acc.addScaledVector(fwd, -(0.03 * vf + 0.0012 * vf * Math.abs(vf)));
    acc.addScaledVector(right, -(0.1 * vr + 0.006 * vr * Math.abs(vr)));
    acc.addScaledVector(new Vector3(0, 1, 0).applyQuaternion(h.q), -(0.35 * vu + 0.02 * vu * Math.abs(vu)));
    h.vel.addScaledVector(acc, dt);
    h.pos.addScaledVector(h.vel, dt);

    const lim = HALF - 150;
    for (const k of ['x', 'z'] as const) {
      if (Math.abs(h.pos[k]) > lim) {
        h.pos[k] = Math.sign(h.pos[k]) * lim;
        h.vel[k] *= -0.2;
        if (!this.messages.some(m => m.text.startsWith('작전 구역'))) this.say('작전 구역 경계입니다', '#ef476f');
      }
    }

    this.collide();
  }

  private collide() {
    const h = this.heli, t = this.terrain, p = new Vector3();
    for (let i = 0; i < HULL.length; i++) {
      this.toWorld(HULL[i], p);
      if (p.y < t.surfaceAt(p.x, p.z)) {
        this.crash(i >= 4 ? '로터 블레이드가 지형에 부딪혔습니다' : p.y < 0.3 && t.heightAt(p.x, p.z) < 0 ? '물에 추락했습니다' : '기체가 지형에 충돌했습니다');
        return;
      }
    }
    for (const tr of t.treesNear(h.pos.x, h.pos.z)) {
      if (Math.hypot(tr.x - h.pos.x, tr.z - h.pos.z) < tr.r + ROTOR_R - 0.5 && h.pos.y + SKID_Y < tr.y + tr.h && h.pos.y + 1.35 > tr.y) {
        this.crash('나무에 부딪혔습니다'); return;
      }
    }
    for (const b of t.buildings) {
      if (Math.abs(b.x - h.pos.x) < b.w / 2 + ROTOR_R - 0.5 && Math.abs(b.z - h.pos.z) < b.d / 2 + ROTOR_R - 0.5 && h.pos.y + SKID_Y < b.y + b.h + (b.kind === 'house' ? 2.4 : 0)) {
        this.crash('건물에 부딪혔습니다'); return;
      }
    }

    if (h.vel.y > 0.1) return;
    let touching = false;
    for (const s of SKIDS) { this.toWorld(s, p); if (p.y <= t.surfaceAt(p.x, p.z)) { touching = true; break; } }
    if (!touching) return;

    const descent = -h.vel.y, hs = Math.hypot(h.vel.x, h.vel.z);
    const n = t.normalAt(h.pos.x, h.pos.z);
    const ga = this.groundAttitude();
    if (t.heightAt(h.pos.x, h.pos.z) < 0.3) this.crash('물 위에 내려앉아 기체가 가라앉았습니다');
    else if (descent > LAND_DESCENT) this.crash(`착륙 충격이 너무 큽니다 (${Math.round(descent * MS_TO_FPM)} fpm)`);
    else if (hs > LAND_HS) this.crash(`미끄러지며 접지해 전복됐습니다 (${Math.round(hs * MS_TO_KT)} kt)`);
    else if (Math.abs(h.pitch - ga.pitch) > LAND_ATT || Math.abs(h.roll - ga.roll) > LAND_ATT) this.crash('기울어진 채로 접지해 전복됐습니다');
    else if (Math.acos(n.y) > SLOPE_MAX) this.crash('경사가 너무 급한 곳에 내려앉았습니다');
    else {
      h.landed = true;
      h.pitch = ga.pitch; h.roll = ga.roll;
      h.pRate = h.rRate = h.yRate = 0;
      h.vel.set(0, 0, 0);
      h.pos.y = t.heightAt(h.pos.x, h.pos.z) - SKID_Y;
      this.updateQ();
      this.touchdownDescent = descent;
      if (descent < 1) this.say('부드러운 착륙', '#06d6a0');
      else if (descent > 2.2) this.say('거친 착륙', '#ffd166');
      else this.say('착륙');
      this.refuelNoted = false;
    }
  }

  private onGround(dt: number) {
    const h = this.heli, m = this.mission;
    h.pRate = h.rRate = h.yRate = 0;
    const pi = this.padUnder();
    const pad = pi >= 0 ? this.pads[pi] : null;

    if (pad?.base && h.fuel < 100) {
      h.fuel = Math.min(100, h.fuel + 8 * dt);
      if (!this.refuelNoted && h.fuel < 95) { this.say('연료 보급 중', '#4cc9f0'); this.refuelNoted = true; }
    }

    const want = m.stage === 'pickup' ? m.from : m.to;
    if (pi === want) {
      m.timer += dt;
      if (m.stage === 'pickup' && m.timer >= 3) {
        m.stage = 'deliver'; m.timer = 0; m.t0 = this.time;
        this.say(`화물 적재 완료 — ${this.pads[m.to].name} 패드로 비행하세요`, '#06d6a0');
      } else if (m.stage === 'deliver' && m.timer >= 2) {
        const dist = Math.hypot(this.pads[m.from].x - pad!.x, this.pads[m.from].z - pad!.z);
        const soft = this.touchdownDescent < 1 ? 30 : 0;
        const pts = Math.round(100 + dist / 10 + Math.max(0, 180 - (this.time - m.t0)) + soft);
        this.score += pts; this.delivered++;
        this.say(`배달 완료 +${pts}${soft ? ' (부드러운 착륙 보너스 포함)' : ''}`, '#06d6a0');
        this.newMission(pi);
        this.say(`다음 화물: ${this.pads[this.mission.from].name} 패드`);
        this.emit();
      }
    } else m.timer = 0;
  }

  crash(reason: string) {
    const h = this.heli;
    if (!h.alive) return;
    h.alive = false; h.engineOn = false;
    this.crashReason = reason; this.mode = 'crashed'; this.overTimer = 2.2;
    if (this.score > this.best) { this.best = this.score; this.store.save(this.best); }
    this.emit();
  }
}
