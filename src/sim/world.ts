import { Vector3 } from 'three';
import { EventBus } from '../core/events';
import { rng } from '../core/math';
import type { SimEvent } from './events';
import { BASE_REFUEL_RATE, GEAR_Y } from './heli/airframe';
import { clampToArea, collide, stepFlight } from './heli/flight';
import { createHeli, type Controls, type HeliState } from './heli/state';
import { toggleEngine } from './heli/systems';
import { PAD_R, Terrain, type Pad3 } from './terrain';

export const STEP = 1 / 120;

export interface NavTarget { x: number; y: number; z: number; name: string }

export class World {
  time = 0;
  readonly rng: () => number;
  readonly terrain: Terrain;
  player!: HeliState;
  controls: Controls = { cyclicX: 0, cyclicY: 0, pedal: 0, collective: 0 };
  wind = new Vector3();
  target: NavTarget | null = null;
  active = false;
  readonly events = new EventBus<SimEvent>();
  private atBoundary = false;
  private refuelNoted = false;

  constructor(opts: { seed: number }) {
    this.rng = rng(opts.seed);
    this.terrain = new Terrain(opts.seed);
    this.resetPlayer();
  }

  get pads() { return this.terrain.pads; }

  resetPlayer(padIndex = 0) {
    const pad = this.pads[padIndex];
    this.player = createHeli(new Vector3(pad.x, pad.y - GEAR_Y, pad.z), this.rng() * Math.PI * 2);
    this.controls = { cyclicX: 0, cyclicY: 0, pedal: 0, collective: 0 };
    this.atBoundary = false;
    this.refuelNoted = false;
  }

  emit = (e: SimEvent) => { this.events.emit(e); };

  toggleEngine() {
    if (this.active) toggleEngine(this.player, this.emit);
  }

  padUnder(): number {
    const h = this.player;
    return this.pads.findIndex(p => Math.hypot(p.x - h.pos.x, p.z - h.pos.z) < PAD_R && Math.abs(h.pos.y + GEAR_Y - p.y) < 1);
  }

  padAt(i: number): Pad3 | undefined { return this.pads[i]; }

  step(dt: number) {
    this.time += dt;
    const wa = this.time * 0.013;
    const ws = 4 + 2.5 * Math.sin(this.time * 0.05) + 1.5 * Math.sin(this.time * 0.37);
    this.wind.set(Math.cos(wa) * ws, 0, Math.sin(wa) * ws);

    const h = this.player;
    if (this.active && h.alive) {
      const phase = stepFlight(h, this.controls, this, dt, this.emit);
      if (phase === 'ground') this.onGround(dt);
      else {
        const hit = clampToArea(h);
        if (hit && !this.atBoundary) this.emit({ t: 'boundary' });
        this.atBoundary = hit;
        const wasLanded = h.landed;
        collide(h, this.terrain, this.emit);
        if (h.landed && !wasLanded) this.refuelNoted = false;
      }
    }
    this.events.flush();
  }

  private onGround(dt: number) {
    const h = this.player;
    const pad = this.pads[this.padUnder()];
    if (pad?.base && h.fuel < 100) {
      h.fuel = Math.min(100, h.fuel + BASE_REFUEL_RATE * dt);
      if (!this.refuelNoted && h.fuel < 95) { this.emit({ t: 'refuel' }); this.refuelNoted = true; }
    }
  }
}
