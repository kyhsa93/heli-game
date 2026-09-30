import { Vector3 } from 'three';
import { eyeOf } from '../ai/awareness';
import { EYE } from '../heli/airframe';
import { toWorld } from '../heli/state';
import { pairKey } from '../los';
import { aimDirection } from '../weapons/arms';
import type { Unit } from '../units';
import type { World } from '../world';

export const DWELL_DEG = 3;
export const DWELL_SECONDS = 0.5;
export const DWELL_HOLD = 8;
export const IDENTIFY_HOLD = 20;
export const SPOT_RANGE = 4000;
export const MAX_MARKERS = 24;
export const PLAYER_KEY = 0;

export class PlayerSpotting {
  readonly spotted = new Map<number, number>();
  private dwell = new Map<number, number>();
  private eye = new Vector3();
  private dir = new Vector3();
  private at = new Vector3();
  private to = new Vector3();

  identified(unitId: number, time: number) {
    this.spotted.set(unitId, Math.max(this.spotted.get(unitId) ?? 0, time + IDENTIFY_HOLD));
  }

  step = (world: World, dt: number) => {
    const time = world.time;
    for (const [id, until] of this.spotted) if (until <= time || !world.unit(id)?.alive) this.spotted.delete(id);
    const body = world.playerBody();
    if (!body.alive) { this.dwell.clear(); return; }
    const h = world.player;
    toWorld(h, EYE, this.eye);
    aimDirection(h, world.commands.aim, this.dir);
    const cos = Math.cos((DWELL_DEG * Math.PI) / 180);
    const seen = new Set<number>();
    for (const u of world.units) {
      if (!u.alive || !world.huntsPlayer(u)) continue;
      eyeOf(u, this.at);
      this.to.copy(this.at).sub(this.eye);
      const d = this.to.length();
      if (d > SPOT_RANGE || this.to.dot(this.dir) / d < cos) continue;
      if (!this.visible(world, u)) continue;
      seen.add(u.id);
      const t = (this.dwell.get(u.id) ?? 0) + dt;
      this.dwell.set(u.id, t);
      if (t >= DWELL_SECONDS) this.spotted.set(u.id, Math.max(this.spotted.get(u.id) ?? 0, time + DWELL_HOLD));
    }
    for (const id of this.dwell.keys()) if (!seen.has(id)) this.dwell.delete(id);
  };

  visible(world: World, u: Unit) {
    toWorld(world.player, EYE, this.eye);
    eyeOf(u, this.at);
    return world.los.visual(pairKey(PLAYER_KEY, u.id), this.eye, this.at, world.time).clear;
  }

  markers(world: World): Unit[] {
    if (!world.playerBody().alive) return [];
    const out: Unit[] = [];
    for (const id of this.spotted.keys()) {
      const u = world.unit(id);
      if (u && u.alive && this.visible(world, u)) out.push(u);
      if (out.length >= MAX_MARKERS) break;
    }
    return out;
  }
}
