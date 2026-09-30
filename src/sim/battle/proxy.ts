import type { Unit } from '../units';
import type { World } from '../world';
import type { ControlPoint } from './conquest';
import type { BattleRuntime } from './runtime';
import type { BattleSide } from './schema';

export const PROXY_STANDOFF = 1800;
export const PROXY_SPEED = 60;
export const PROXY_HOLD = 40;
export const PROXY_MIN_STANDOFF = 700;
export const PROXY_SEARCH = 10;
export const PROXY_ALTITUDE = 90;

export class ProxyPilot {
  unit: Unit | null = null;
  kills = 0;
  deaths = 0;
  private respawnAt = 0;
  private listening = false;
  private standoff = PROXY_STANDOFF;
  private bearing = 0;
  private idle = 0;
  private aimed: string | null = null;

  constructor(readonly runtime: BattleRuntime, readonly side: BattleSide) {}

  step(world: World, dt: number) {
    if (!this.listening) {
      this.listening = true;
      world.events.on('unitDestroyed', e => {
        const t = this.unit?.battle?.target;
        if (this.unit && e.id === this.unit.id) this.died(world);
        else if (t?.kind === 'unit' && t.id === e.id) this.kills++;
      });
    }
    if (this.runtime.conquest.winner) return;
    if (!this.unit) {
      if (world.time < this.respawnAt || this.runtime.conquest.tickets[this.side] <= 0) return;
      const base = this.runtime.map.bases.find(b => b.side === this.side)!.position;
      this.unit = world.spawnUnit(this.side === 'coalition' ? 'c_apache' : 'heli_attack', base[0], base[1]);
      return;
    }
    const u = this.unit;
    const point = this.target();
    if (this.aimed !== point.id) { this.aimed = point.id; this.standoff = PROXY_STANDOFF; this.bearing = 0; this.idle = 0; }
    if (u.battle?.target) this.idle = 0;
    else if ((this.idle += dt) >= PROXY_SEARCH) {
      this.idle = 0;
      this.standoff = Math.max(PROXY_MIN_STANDOFF, this.standoff - 250);
      this.bearing = this.bearing > 0 ? -this.bearing : -this.bearing + 0.5;
      if (this.standoff === PROXY_MIN_STANDOFF && Math.abs(this.bearing) > 1.5) { this.standoff = PROXY_STANDOFF; this.bearing = 0; }
    }
    const goal = this.goal(world, point);
    const dx = goal[0] - u.pos.x, dz = goal[1] - u.pos.z, d = Math.hypot(dx, dz);
    if (d > PROXY_HOLD) {
      const step = Math.min(d, PROXY_SPEED * dt);
      u.pos.x += (dx / d) * step; u.pos.z += (dz / d) * step;
      u.vel.set((dx / d) * PROXY_SPEED, 0, (dz / d) * PROXY_SPEED);
      u.yaw = Math.atan2(-dx, -dz);
    } else u.vel.set(0, 0, 0);
    const ground = world.terrain.surfaceAt(u.pos.x, u.pos.z);
    u.pos.y += (ground + PROXY_ALTITUDE - u.pos.y) * Math.min(1, dt * 0.8);
    u.pos.y = Math.max(u.pos.y, ground + 10);
  }

  private died(world: World) {
    this.deaths++;
    this.unit = null;
    this.respawnAt = world.time + this.runtime.rules.playerRespawnSec;
    this.runtime.conquest.playerDied(this.side, null);
  }

  private target(): ControlPoint {
    const c = this.runtime.conquest;
    const base = this.runtime.map.bases.find(b => b.side === this.side)!.position;
    const enemy = this.side === 'coalition' ? 'veros' : 'coalition';
    const ranked = [...c.points].sort((a, b) => {
      const pa = a.owner === this.side ? (a.strength[enemy] > 0 ? 1 : 3) : 0, pb = b.owner === this.side ? (b.strength[enemy] > 0 ? 1 : 3) : 0;
      return pa - pb || Math.hypot(a.x - base[0], a.z - base[1]) - Math.hypot(b.x - base[0], b.z - base[1]);
    });
    return ranked[0];
  }

  private goal(world: World, p: ControlPoint): [number, number] {
    const base = this.runtime.map.bases.find(b => b.side === this.side)!.position;
    void world;
    const a = Math.atan2(base[0] - p.x, base[1] - p.z) + this.bearing;
    return [p.x + Math.sin(a) * this.standoff, p.z + Math.cos(a) * this.standoff];
  }
}
