import type { CrashReason } from './events';
import type { Objective } from './objective';
import { World } from './world';

export type Mode = 'brief' | 'play' | 'crashed' | 'over' | 'done';

export interface Crash { reason: CrashReason; value?: number }

export interface SessionSnapshot { mode: Mode; crash: Crash | null; result: Record<string, number> | null }

export class FlightSession {
  readonly world: World;
  mode: Mode = 'brief';
  crash: Crash | null = null;
  paused = false;
  private overTimer = 0;
  private listeners = new Set<() => void>();
  private snapshot: SessionSnapshot = { mode: 'brief', crash: null, result: null };
  private doneTimer = 0;

  constructor(seed: number, readonly objective: Objective | null = null) {
    this.world = new World({ seed });
    if (objective) this.world.events.onAny(e => objective.onEvent(e, this.world));
    this.world.events.on('objective', e => {
      if (e.state === 'done' && this.mode === 'play') { this.doneTimer = 1.5; }
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
    this.snapshot = { mode: this.mode, crash: this.crash, result: this.mode === 'done' ? this.objective?.result ?? null : null };
    for (const fn of this.listeners) fn();
  }

  start() {
    this.world.resetPlayer();
    this.world.target = null;
    this.objective?.start(this.world);
    this.world.active = true;
    this.doneTimer = 0;
    this.crash = null;
    this.paused = false;
    this.mode = 'play';
    this.publish();
  }

  step(dt: number) {
    if (this.paused) return;
    this.world.step(dt);
    if (this.doneTimer > 0 && this.mode === 'play') {
      this.doneTimer -= dt;
      if (this.doneTimer <= 0) { this.mode = 'done'; this.world.active = false; this.publish(); }
    }
    if (this.mode === 'crashed') {
      this.overTimer -= dt;
      if (this.overTimer <= 0) { this.mode = 'over'; this.publish(); }
    }
  }
}
