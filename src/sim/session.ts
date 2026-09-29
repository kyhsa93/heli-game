import type { CrashReason } from './events';
import { World } from './world';

export type Mode = 'brief' | 'play' | 'crashed' | 'over';

export interface Crash { reason: CrashReason; value?: number }

export interface SessionSnapshot { mode: Mode; crash: Crash | null }

export class FlightSession {
  readonly world: World;
  mode: Mode = 'brief';
  crash: Crash | null = null;
  paused = false;
  private overTimer = 0;
  private listeners = new Set<() => void>();
  private snapshot: SessionSnapshot = { mode: 'brief', crash: null };

  constructor(seed: number) {
    this.world = new World({ seed });
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
    this.snapshot = { mode: this.mode, crash: this.crash };
    for (const fn of this.listeners) fn();
  }

  start() {
    this.world.resetPlayer();
    this.world.active = true;
    this.crash = null;
    this.paused = false;
    this.mode = 'play';
    this.publish();
  }

  step(dt: number) {
    if (this.paused) return;
    this.world.step(dt);
    if (this.mode === 'crashed') {
      this.overTimer -= dt;
      if (this.overTimer <= 0) { this.mode = 'over'; this.publish(); }
    }
  }
}
