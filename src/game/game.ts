import {
  BREAK_VY, C, CEIL, CR, G, HOOK_REACH, K, LAND_A, LAND_VX, LAND_VY, MC, MH, PAD_W, ROPE, SKID, WORLD,
} from './constants';
import { clamp } from './math';
import { buildWorld, groundAt, type World } from './world';

export type Mode = 'title' | 'play' | 'crashed' | 'over';
export type Key = 'up' | 'down' | 'left' | 'right';

export interface Heli {
  x: number; y: number; vx: number; vy: number;
  a: number; w: number; T: number; fuel: number;
  landed: boolean; facing: 1 | -1; rotor: number; alive: boolean;
}

export interface Crate {
  x: number; y: number; vx: number; vy: number;
  attached: boolean; onGround: boolean; dead: boolean;
}

export interface Mission { from: number; to: number; t0: number }

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; c: string; s: number; g: number;
}

export interface Floater { x: number; y: number; text: string; color: string; life: number }

export interface Snapshot {
  mode: Mode;
  score: number;
  delivered: number;
  best: number;
  crashReason: string;
}

export interface BestStore {
  load(): number;
  save(v: number): void;
}

const noStore: BestStore = { load: () => 0, save: () => {} };

export class Game {
  world!: World;
  heli!: Heli;
  crate!: Crate;
  mission!: Mission;
  mode: Mode = 'title';
  keys: Record<Key, boolean> = { up: false, down: false, left: false, right: false };
  hookPressed = false;
  score = 0;
  delivered = 0;
  best: number;
  time = 0;
  wind = 0;
  particles: Particle[] = [];
  floaters: Floater[] = [];
  cam = { x: 0, y: 0 };
  crashReason = '';
  overTimer = 0;
  missionPause = 0;

  private listeners = new Set<() => void>();
  private snapshot!: Snapshot;
  private readonly random: () => number;
  private readonly store: BestStore;

  constructor(opts: { random?: () => number; store?: BestStore } = {}) {
    this.random = opts.random ?? Math.random;
    this.store = opts.store ?? noStore;
    this.best = this.store.load();
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

  ground(x: number) { return groundAt(this.world, x); }

  reset() {
    this.world = buildWorld((this.random() * 1e9) | 0);
    const b = this.world.pads[0];
    this.heli = {
      x: b.x - 20, y: b.y - SKID, vx: 0, vy: 0, a: 0, w: 0, T: 0, fuel: 100,
      landed: true, facing: 1, rotor: 0, alive: true,
    };
    this.score = 0; this.delivered = 0; this.time = 0;
    this.particles = []; this.floaters = []; this.missionPause = 0;
    this.cam.x = this.heli.x; this.cam.y = this.heli.y;
    this.newMission();
  }

  start() {
    this.reset();
    this.mode = 'play';
    for (const k of Object.keys(this.keys) as Key[]) this.keys[k] = false;
    this.emit();
  }

  newMission() {
    const pads = this.world.pads;
    const prev = this.mission;
    const cands = pads.map((_, i) => i).filter(i => i !== 0 && (!prev || i !== prev.to));
    const from = cands[(this.random() * cands.length) | 0];
    const tos = pads.map((_, i) => i).filter(i => i !== from);
    const to = tos[(this.random() * tos.length) | 0];
    const p = pads[from];
    this.crate = { x: p.x + 38, y: p.y - CR, vx: 0, vy: 0, attached: false, onGround: true, dead: false };
    this.mission = { from, to, t0: this.time };
  }

  local(lx: number, ly: number) {
    const h = this.heli;
    lx *= h.facing;
    const c = Math.cos(h.a), s = Math.sin(h.a);
    return { x: h.x + lx * c - ly * s, y: h.y + lx * s + ly * c };
  }

  hookPos() { return this.local(0, 20); }

  crateInReach() {
    const c = this.crate;
    if (!this.heli.alive || c.dead || c.attached) return false;
    const hp = this.hookPos();
    return Math.hypot(hp.x - c.x, hp.y - c.y) < HOOK_REACH;
  }

  padUnder(x: number) { return this.world.pads.find(p => Math.abs(p.x - x) < PAD_W / 2); }

  burst(x: number, y: number, n: number, colors: string[], spd: number, life: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = Math.random() * spd;
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.3,
        life: life * (0.5 + Math.random()), max: life,
        c: colors[(Math.random() * colors.length) | 0], s: 2 + Math.random() * 4, g: 1,
      });
    }
  }

  floatText(x: number, y: number, text: string, color: string) {
    this.floaters.push({ x, y, text, color, life: 1.8 });
  }

  crash(reason: string) {
    const h = this.heli;
    if (!h.alive) return;
    h.alive = false; this.crashReason = reason; this.mode = 'crashed'; this.overTimer = 1.4;
    this.burst(h.x, h.y, 90, ['#ffd166', '#ff7b39', '#ef476f', '#555', '#333'], 320, 1.6);
    this.crate.attached = false;
    if (this.score > this.best) { this.best = this.score; this.store.save(this.best); }
    this.emit();
  }

  private breakCrate() {
    const c = this.crate;
    c.dead = true; c.attached = false;
    this.burst(c.x, c.y, 30, ['#c68b3e', '#8a5a24', '#e0b36a'], 180, 1);
    this.score = Math.max(0, this.score - 50);
    this.floatText(c.x, c.y - 30, '화물 파손 −50', '#ef476f');
    this.missionPause = 1.6;
    this.emit();
  }

  private deliver() {
    const c = this.crate, pads = this.world.pads, m = this.mission;
    const el = this.time - m.t0;
    const dist = Math.abs(pads[m.from].x - pads[m.to].x);
    const pts = Math.round(60 + dist / 40 + Math.max(0, 90 - el) * 2);
    this.score += pts; this.delivered++;
    this.floatText(c.x, c.y - 30, `배달 완료 +${pts}`, '#06d6a0');
    this.burst(c.x, c.y - 10, 24, ['#06d6a0', '#ffd166', '#fff'], 160, 0.9);
    c.dead = true;
    this.missionPause = 1.2;
    this.emit();
  }

  idle(dt: number) {
    this.time += dt;
    this.heli.rotor += dt * 2;
  }

  step(dt: number) {
    this.time += dt;
    this.wind = 28 * Math.sin(this.time * 0.07) + 16 * Math.sin(this.time * 0.23 + 1);
    const h = this.heli, crate = this.crate, keys = this.keys, wind = this.wind;

    if (this.missionPause > 0) { this.missionPause -= dt; if (this.missionPause <= 0) this.newMission(); }

    let tension: { x: number; y: number } | null = null;
    if (h.alive) {
      if (this.hookPressed && !crate.dead) {
        const hp = this.hookPos();
        if (crate.attached) { crate.attached = false; this.floatText(hp.x, hp.y + 10, '고리 해제', '#ffd166'); }
        else if (this.crateInReach()) { crate.attached = true; this.floatText(hp.x, hp.y - 40, '고리 연결', '#ffd166'); }
      }

      let target = keys.up ? 1.78 * G : keys.down ? 0.35 * G : (h.landed ? 0 : 0.97 * G);
      if (h.fuel <= 0) target = 0;
      h.T += (target - h.T) * Math.min(1, dt * 3);
      if (h.T > 0.2 * G) h.fuel = Math.max(0, h.fuel - h.T / G * 1.05 * dt);
      h.rotor += (h.T / G + (h.landed ? 0.05 : 0.3)) * dt * 40;

      const tin = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (!h.landed) {
        h.w += tin * 7 * dt - h.a * (tin ? 0.8 : 3.5) * dt;
        h.w *= Math.exp(-3 * dt);
        h.a = clamp(h.a + h.w * dt, -0.75, 0.75);
        if (Math.abs(h.a) === 0.75) h.w = 0;
      } else { h.a *= Math.exp(-10 * dt); h.w = 0; }
      if (tin) h.facing = tin > 0 ? 1 : -1;
      else if (Math.abs(h.vx) > 60) h.facing = h.vx > 0 ? 1 : -1;

      const eff = h.y < CEIL ? Math.max(0, 1 - (CEIL - h.y) / 250) : 1;
      const T = h.T * eff;
      let ax = T * Math.sin(h.a) + (wind - h.vx) * 0.35;
      let ay = G - T * Math.cos(h.a) - h.vy * 0.5;

      if (crate.attached) {
        const hp = this.hookPos(), dx = crate.x - hp.x, dy = crate.y - hp.y, d = Math.hypot(dx, dy);
        if (d > ROPE) {
          const nx = dx / d, ny = dy / d;
          const vr = (crate.vx - h.vx) * nx + (crate.vy - h.vy) * ny;
          const f = Math.max(0, K * (d - ROPE) + C * vr);
          tension = { x: f * nx, y: f * ny };
          ax += tension.x / MH; ay += tension.y / MH;
        }
      }

      if (h.landed) {
        h.vx = 0; h.vy = 0;
        if (keys.up && T - G + (tension ? tension.y : 0) > 0) { h.landed = false; h.vy = -5; }
      } else {
        h.vx += ax * dt; h.vy += ay * dt;
        h.x += h.vx * dt; h.y += h.vy * dt;
        if (h.x < 60) { h.x = 60; h.vx = Math.abs(h.vx) * 0.3; }
        if (h.x > WORLD - 60) { h.x = WORLD - 60; h.vx = -Math.abs(h.vx) * 0.3; }
        this.collide();
      }

      if (h.landed && this.padUnder(h.x)?.base) h.fuel = Math.min(100, h.fuel + 22 * dt);

      const alt = this.ground(h.x) - h.y - SKID;
      if (alt < 90 && h.T > 0.6 * G && Math.random() < dt * 40 * (1 - alt / 90)) {
        const gx = h.x + (Math.random() - 0.5) * 30;
        this.particles.push({
          x: gx, y: this.ground(gx) - 2, vx: (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 120),
          vy: -10 - Math.random() * 30, life: 0.7, max: 0.7, c: 'rgba(210,190,150,0.6)', s: 3 + Math.random() * 4, g: 0,
        });
      }
    }
    this.hookPressed = false;

    if (!crate.dead) this.stepCrate(dt, tension);

    for (const p of this.particles) { p.vy += G * p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const f of this.floaters) { f.y -= 30 * dt; f.life -= dt; }
    this.floaters = this.floaters.filter(f => f.life > 0);

    if (this.mode === 'crashed') {
      this.overTimer -= dt;
      if (this.overTimer <= 0) { this.mode = 'over'; this.emit(); }
    }
  }

  private collide() {
    const h = this.heli;
    const body = [
      this.local(23, 3), this.local(-46, -6), this.local(-46, -16),
      this.local(42, -17), this.local(-42, -17), this.local(0, 12),
    ];
    for (let i = 0; i < body.length; i++) {
      const p = body[i];
      if (p.y >= this.ground(p.x)) {
        this.crash(i === 3 || i === 4 ? '로터가 지형에 부딪혔습니다' : '기체가 지형에 충돌했습니다');
        return;
      }
    }
    const sl = this.local(-16, SKID), sr = this.local(16, SKID);
    const gl = this.ground(sl.x), gr = this.ground(sr.x);
    if (sl.y < gl && sr.y < gr) return;
    if (h.vy > LAND_VY) this.crash(`착륙 속도 초과 (${Math.round(h.vy)} > ${LAND_VY})`);
    else if (Math.abs(h.vx) > LAND_VX) this.crash('수평 속도가 너무 빠릅니다');
    else if (Math.abs(h.a) > LAND_A) this.crash('기울어진 채로 착륙했습니다');
    else if (Math.abs(gl - gr) > 8) this.crash('경사가 너무 급한 곳에 착륙했습니다');
    else {
      h.landed = true; h.y = Math.min(gl, gr) - SKID; h.vx = 0; h.vy = 0; h.w = 0;
      if (this.padUnder(h.x)?.base && h.fuel < 99) this.floatText(h.x, h.y - 40, '연료 보급 중', '#118ab2');
    }
  }

  private stepCrate(dt: number, tension: { x: number; y: number } | null) {
    const crate = this.crate;
    let ax = (this.wind - crate.vx) * 0.12, ay = G - crate.vy * 0.12;
    if (tension && crate.attached) { ax -= tension.x / MC; ay -= tension.y / MC; }
    crate.vx += ax * dt; crate.vy += ay * dt;
    crate.x = clamp(crate.x + crate.vx * dt, 20, WORLD - 20);
    crate.y += crate.vy * dt;
    const gy = this.ground(crate.x) - CR;
    if (crate.y >= gy) {
      if (crate.vy > BREAK_VY) { this.breakCrate(); return; }
      crate.y = gy;
      if (crate.vy > 0) crate.vy = 0;
      crate.vx *= Math.exp(-7 * dt);
      crate.onGround = true;
    } else crate.onGround = false;

    if (!crate.attached && crate.onGround && Math.abs(crate.vx) < 8 && this.missionPause <= 0) {
      const tp = this.world.pads[this.mission.to];
      if (Math.abs(crate.x - tp.x) < PAD_W / 2 - 4) this.deliver();
    }
  }
}
