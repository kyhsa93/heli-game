import type { CrashReason } from './events';
import type { Objective } from './objective';
import type { TerrainOptions } from './terrain';
import { World } from './world';

export type Mode = 'brief' | 'play' | 'crashed' | 'over' | 'done';

export interface Crash { reason: CrashReason; value?: number }

export interface SessionSnapshot { mode: Mode; crash: Crash | null; result: Record<string, number> | null; failure: string | null; failureText: string | null }

export class FlightSession {
  readonly world: World;
  mode: Mode = 'brief';
  crash: Crash | null = null;
  paused = false;
  private overTimer = 0;
  private listeners = new Set<() => void>();
  private snapshot: SessionSnapshot = { mode: 'brief', crash: null, result: null, failure: null, failureText: null };
  failure: string | null = null;
  private failTimer = 0;
  private doneTimer = 0;

  constructor(seed: number, readonly objective: Objective | null = null, terrain?: TerrainOptions) {
    this.world = new World({ seed, terrain });
    if (objective) this.world.events.onAny(e => objective.onEvent(e, this.world));
    this.world.events.on('objective', e => {
      if (e.state === 'done' && this.mode === 'play') { this.doneTimer = 1.5; }
      if (e.state === 'failed' && this.mode === 'play') { this.failure = e.reason ?? 'failed'; this.failTimer = 2; }
    });
    this.world.events.on('crash', e => {
      this.crash = { reason: e.reason, value: e.value };
      this.mode = 'crashed';
      this.overTimer = 2.2;
      this.publish();
    });
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getSnapshot = () => this.snapshot;

  private publish() {
    this.snapshot = { mode: this.mode, crash: this.crash, result: this.mode === 'done' ? this.objective?.result ?? null : null, failure: this.mode === 'over' ? this.failure : null, failureText: this.mode === 'over' ? this.objective?.failureText ?? null : null };
    for (const fn of this.listeners) fn();
  }

  start() {
    this.world.resetPlayer();
    this.world.clearCombat();
    this.world.target = null;
    this.objective?.start(this.world);
    this.world.active = true;
    this.doneTimer = 0;
    this.failTimer = 0;
    this.failure = null;
    this.crash = null;
    this.paused = false;
    this.mode = 'play';
    this.publish();
  }

  step(dt: number) {
    if (this.paused) return;
    this.world.step(dt);
    if (this.mode === 'play') this.objective?.tick?.(this.world, dt);
    if (this.doneTimer > 0 && this.mode === 'play') {
      this.doneTimer -= dt;
      if (this.doneTimer <= 0) { this.mode = 'done'; this.world.active = false; this.publish(); }
    }
    if (this.failTimer > 0 && this.mode === 'play') {
      this.failTimer -= dt;
      if (this.failTimer <= 0) { this.mode = 'over'; this.world.active = false; this.publish(); }
    }
    if (this.mode === 'crashed') {
      this.overTimer -= dt;
      if (this.overTimer <= 0) { this.mode = 'over'; this.publish(); }
    }
  }
}
