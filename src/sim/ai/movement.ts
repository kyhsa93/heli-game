import type { Terrain, Vec2 } from '../terrain';
import type { Unit } from '../units';
import type { World } from '../world';

export const MERGE_DISTANCE = 2;
export const CONVOY_SPACING = 25;
export const MAX_SLOPE_COS = Math.cos(20 * Math.PI / 180);
export const AIR_ALTITUDE = 60;
export const ARRIVE = 6;
export const DIRECT_ROUTE = 150;
export const ROAD_JOIN = 10;
export const ROAD_LEAVE = 30;
export const ROAD_LEAVE_BEFORE = 0.9;

export interface RoadNode { x: number; z: number; edges: { to: number; len: number }[] }

export class RoadGraph {
  readonly nodes: RoadNode[] = [];

  constructor(roads: readonly Vec2[][]) {
    for (const road of roads) {
      let prev = -1;
      for (const [x, z] of road) {
        const id = this.node(x, z);
        if (prev >= 0 && prev !== id) this.link(prev, id);
        prev = id;
      }
    }
  }

  private node(x: number, z: number) {
    const found = this.nodes.findIndex(n => Math.hypot(n.x - x, n.z - z) <= MERGE_DISTANCE);
    if (found >= 0) return found;
    this.nodes.push({ x, z, edges: [] });
    return this.nodes.length - 1;
  }

  private link(a: number, b: number) {
    const len = Math.hypot(this.nodes[a].x - this.nodes[b].x, this.nodes[a].z - this.nodes[b].z);
    if (!this.nodes[a].edges.some(e => e.to === b)) this.nodes[a].edges.push({ to: b, len });
    if (!this.nodes[b].edges.some(e => e.to === a)) this.nodes[b].edges.push({ to: a, len });
  }

  nearest(x: number, z: number) {
    let best = -1, bestD = Infinity;
    this.nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.z - z); if (d < bestD) { bestD = d; best = i; } });
    return best;
  }

  path(from: number, to: number): number[] | null {
    if (from < 0 || to < 0) return null;
    const g = new Map<number, number>([[from, 0]]), came = new Map<number, number>();
    const h = (i: number) => Math.hypot(this.nodes[i].x - this.nodes[to].x, this.nodes[i].z - this.nodes[to].z);
    const open = new Set<number>([from]);
    const f = new Map<number, number>([[from, h(from)]]);
    while (open.size) {
      let cur = -1, best = Infinity;
      for (const i of open) if ((f.get(i) ?? Infinity) < best) { best = f.get(i)!; cur = i; }
      if (cur === to) {
        const out = [cur];
        while (came.has(out[0])) out.unshift(came.get(out[0])!);
        return out;
      }
      open.delete(cur);
      for (const e of this.nodes[cur].edges) {
        const cand = g.get(cur)! + e.len;
        if (cand < (g.get(e.to) ?? Infinity)) {
          came.set(e.to, cur); g.set(e.to, cand); f.set(e.to, cand + h(e.to)); open.add(e.to);
        }
      }
    }
    return null;
  }

  pathLength(path: number[]) {
    let len = 0;
    for (let i = 1; i < path.length; i++) len += Math.hypot(this.nodes[path[i]].x - this.nodes[path[i - 1]].x, this.nodes[path[i]].z - this.nodes[path[i - 1]].z);
    return len;
  }

  route(points: readonly Vec2[]): Vec2[] {
    const out: Vec2[] = [];
    for (let k = 0; k + 1 < points.length; k++) {
      const p = this.path(this.nearest(...points[k]), this.nearest(...points[k + 1]));
      const seg: Vec2[] = p ? p.map(i => [this.nodes[i].x, this.nodes[i].z]) : [points[k], points[k + 1]];
      for (const q of seg) if (!out.length || Math.hypot(out[out.length - 1][0] - q[0], out[out.length - 1][1] - q[1]) > 0.5) out.push(q);
    }
    return out;
  }
}

export type Behavior = 'hold' | 'patrol' | 'advance' | 'convoy' | 'defend';

export interface GroupState {
  id: string;
  behavior: Behavior;
  path: Vec2[];
  loop: boolean;
  speedScale: number;
  started: boolean;
  members: { unit: number; leg: number; dir: 1 | -1; arrived: boolean }[];
}

export function unitSpeed(u: Unit, onRoad: boolean, scale: number) {
  const m = u.def.move;
  if (!m) return 0;
  return (onRoad || m.air ? m.speed : (m.offroadSpeed ?? m.speed * 0.6)) * scale;
}

export function remaining(g: GroupState, u: Unit, member: GroupState['members'][number]) {
  let d = 0, px = u.pos.x, pz = u.pos.z;
  for (let k = member.leg; k < g.path.length; k++) { d += Math.hypot(g.path[k][0] - px, g.path[k][1] - pz); px = g.path[k][0]; pz = g.path[k][1]; }
  return d;
}

export const INFANTRY_SLOPE_COS = Math.cos(35 * Math.PI / 180);
export const TRACKED_SLOPE_COS = Math.cos(30 * Math.PI / 180);

function passable(t: Terrain, x: number, z: number, slopeCos = MAX_SLOPE_COS) {
  return t.normalAt(x, z).y >= slopeCos && (t.heightAt(x, z) > 0.5 || t.onBridge(x, z) !== null);
}

function climb(u: Unit) {
  if (u.def.category === 'infantry') return INFANTRY_SLOPE_COS;
  if (u.def.category === 'tracked') return TRACKED_SLOPE_COS;
  return MAX_SLOPE_COS;
}

function stepToward(world: World, u: Unit, tx: number, tz: number, speed: number, dt: number, road: boolean) {
  const dx = tx - u.pos.x, dz = tz - u.pos.z, d = Math.hypot(dx, dz);
  if (d < 1e-6) return 0;
  let step = Math.min(d, speed * dt), hx = dx / d, hz = dz / d;
  const t = world.terrain, air = !!u.def.move?.air;
  if (!road && !air) {
    const slope = climb(u);
    const ok = (ax: number, az: number) => passable(t, u.pos.x + ax * Math.max(step, 3), u.pos.z + az * Math.max(step, 3), slope);
    if (!ok(hx, hz)) {
      let found = false;
      for (const a of [0.5, -0.5, 1, -1, 1.5, -1.5]) {
        const c = Math.cos(a), s = Math.sin(a), rx = hx * c - hz * s, rz = hx * s + hz * c;
        if (ok(rx, rz)) { hx = rx; hz = rz; found = true; break; }
      }
      if (!found) { u.vel.set(0, 0, 0); return 0; }
    }
  }
  u.pos.x += hx * step; u.pos.z += hz * step;
  const ground = air ? t.surfaceAt(u.pos.x, u.pos.z) : t.driveHeightAt(u.pos.x, u.pos.z);
  u.pos.y = air ? Math.max(u.pos.y + (ground + AIR_ALTITUDE - u.pos.y) * Math.min(1, dt * 0.8), ground + 10) : ground;
  u.vel.set(hx * speed, 0, hz * speed);
  u.yaw = Math.atan2(-hx, -hz);
  return step;
}

export function setGroupRoute(world: World, id: string, units: number[], dest: Vec2, speedScale = 1) {
  const lead = world.unit(units[0]);
  const start: Vec2 = lead ? [lead.pos.x, lead.pos.z] : dest;
  const graph = world.roads;
  const direct = Math.hypot(dest[0] - start[0], dest[1] - start[1]) < DIRECT_ROUTE || !graph.nodes.length;
  const path: Vec2[] = direct ? [dest] : [...graph.route([start, dest]), dest];
  const on = (p: Vec2, a: Vec2, b: Vec2, near: number) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2 : 1;
    return { t, off: Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t)) <= near };
  };
  while (path.length >= 3) { const r = on(start, path[0], path[1], ROAD_JOIN); if (r.t > 0 && r.t < 1 && r.off) path.shift(); else break; }
  while (path.length >= 3) { const r = on(dest, path[path.length - 3], path[path.length - 2], ROAD_LEAVE); if (r.t > 0 && r.t < ROAD_LEAVE_BEFORE && r.off) path.splice(path.length - 2, 1); else break; }
  const g: GroupState = { id, behavior: 'advance', path, loop: false, speedScale, started: true, members: units.map(unit => ({ unit, leg: 0, dir: 1, arrived: false })) };
  world.groups.set(id, g);
  return g;
}

export function stepGroups(world: World, groups: Iterable<GroupState>, dt: number) {
  for (const g of groups) {
    if (!g.started || g.behavior === 'hold' || g.behavior === 'defend' || g.path.length < 1) continue;
    let ahead: { u: Unit; left: number } | null = null;
    for (const m of g.members) {
      const u = world.unit(m.unit);
      if (!u || !u.alive || !u.def.move) continue;
      if (m.arrived) { u.vel.set(0, 0, 0); if (g.behavior === 'convoy') ahead = { u, left: remaining(g, u, m) }; continue; }
      if (g.behavior !== 'convoy' && (u.ai.state === 'engage' || (u.def.category === 'infantry' && u.battle?.target && u.battle.aim <= 0))) { u.vel.set(0, 0, 0); continue; }
      const road = !u.def.move.offroad || world.terrain.roads.length > 0 && world.terrain.nearRoad(u.pos.x, u.pos.z, 12);
      let speed = unitSpeed(u, road, g.speedScale);
      const left = remaining(g, u, m);
      if (g.behavior === 'convoy' && ahead) {
        const gap = left - ahead.left;
        if (gap < CONVOY_SPACING) speed *= Math.max(0, (gap - CONVOY_SPACING * 0.6) / (CONVOY_SPACING * 0.4));
      }
      const target = g.path[Math.min(m.leg, g.path.length - 1)];
      stepToward(world, u, target[0], target[1], speed, dt, road);
      if (Math.hypot(target[0] - u.pos.x, target[1] - u.pos.z) <= ARRIVE) {
        const next = m.leg + m.dir;
        if (next >= 0 && next < g.path.length) m.leg = next;
        else if (g.behavior === 'patrol') {
          if (g.loop) m.leg = 0;
          else { m.dir = m.dir === 1 ? -1 : 1; m.leg += m.dir; }
        } else { m.arrived = true; u.vel.set(0, 0, 0); }
      }
      if (g.behavior === 'convoy') ahead = { u, left };
    }
  }
}
