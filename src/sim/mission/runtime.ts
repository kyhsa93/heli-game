import { Vector3 } from 'three';
import type { SimEvent } from '../events';
import { AIRCRAFT, GEAR_Y } from '../heli/airframe';
import { hoverCollective } from '../heli/loadout';
import { updateQ } from '../heli/state';
import type { Objective, ObjectiveState } from '../objective';
import { FlightSession } from '../session';
import type { TerrainOptions } from '../terrain';
import type { Unit } from '../units';
import type { World } from '../world';
import type { LoadoutDef } from '../heli/loadout';
import type { SystemId } from '../heli/damage';
import type { Action, Condition, MissionDef, ObjectiveDef, RadioFrom, UnitRef } from './schema';

export interface MissionStats {
  kills: Record<string, number>;
  shots: Record<string, number>;
  hits: Record<string, number>;
  friendly: number;
  civilian: number;
  hitsTaken: number;
  damaged: Partial<Record<SystemId, 'damaged' | 'destroyed'>>;
}

export function emptyStats(): MissionStats {
  return { kills: {}, shots: {}, hits: {}, friendly: 0, civilian: 0, hitsTaken: 0, damaged: {} };
}

export const TRIGGER_HZ = 1;
export const RADIO_SECONDS = 4;
export const FAIL_DELAY = 10;
export const FARP_RADIUS = 25;
export const KT = 0.514444;

export type MissionObjectiveState = 'pending' | 'active' | 'done' | 'failed';

export interface RuntimeObjective { def: ObjectiveDef; state: MissionObjectiveState; since: number }
export interface RadioLine { from: RadioFrom; text: string }

export class MissionRuntime implements Objective {
  readonly id: string;
  state: ObjectiveState = 'active';
  result: Record<string, number> = {};
  failure?: string;
  failureText?: string;
  objectives: RuntimeObjective[] = [];
  readonly unitIds = new Map<string, number>();
  readonly startedGroups = new Set<string>();
  readonly smokes: { pos: Vector3; color: 'red' | 'green' | 'white'; until: number }[] = [];
  radioQueue: RadioLine[] = [];
  radioNow: (RadioLine & { left: number }) | null = null;
  elapsed = 0;
  private fired = new Set<string>();
  private triggerClock = 0;
  private failIn: number | null = null;
  private flown = false;
  private world: World | null = null;

  stats: MissionStats = emptyStats();

  constructor(readonly mission: MissionDef, private loadout: LoadoutDef | null = null) {
    this.id = mission.id;
  }

  start(world: World) {
    this.world = world;
    const m = this.mission;
    this.state = 'active';
    this.result = {};
    this.failure = this.failureText = undefined;
    this.unitIds.clear();
    this.startedGroups.clear();
    this.smokes.length = 0;
    this.radioQueue = [];
    this.radioNow = null;
    this.elapsed = 0;
    this.fired.clear();
    this.triggerClock = 0;
    this.failIn = null;
    this.flown = false;
    world.applyLoadout(this.loadout ?? m.briefing.recommendedLoadout);
    world.player.fuelBurnScale = AIRCRAFT.fuel.campaignBurnScale;
    this.stats = emptyStats();
    world.conditions = { ...world.conditions, night: m.environment.time === 'night', fog: m.environment.fog };
    world.cm.chaffUnlocked = !!m.unlocks?.includes('chaff') || world.cm.chaffUnlocked;
    for (const g of m.groups) {
      const route = g.route ? (world.terrain.roads.length ? world.roads.route(g.route) : g.route.map(p => [p[0], p[1]] as [number, number])) : [];
      world.groups.set(g.id, { id: g.id, behavior: g.behavior, path: route, loop: !!g.loop, speedScale: g.speedScale ?? 1, started: !g.startTrigger, members: [] });
    }
    for (const u of m.units) if (!u.hidden) this.spawn(u.id);
    const initial = m.initialObjectives ? new Set(m.initialObjectives) : null;
    this.objectives = m.objectives.map(def => ({ def, state: !initial || initial.has(def.id) ? 'active' : 'pending', since: 0 }));
    this.placePlayer(world);
    this.updateNavTarget();
  }

  private placePlayer(world: World) {
    const s = this.mission.start, h = world.player;
    const [x, z] = s.position;
    const ground = world.terrain.surfaceAt(x, z);
    h.yaw = -s.headingDeg * Math.PI / 180;
    h.pitch = h.roll = h.pRate = h.rRate = h.yRate = 0;
    if (s.kind === 'air') {
      h.pos.set(x, ground - GEAR_Y + (s.altitudeAgl ?? 60), z);
      const v = (s.speedKt ?? 0) * KT;
      h.vel.set(-Math.sin(h.yaw) * v, 0, -Math.cos(h.yaw) * v);
      h.landed = false; h.engineOn = true; h.rpm = 1;
      world.controls.collective = hoverCollective(world.grossWeight);
    } else {
      h.pos.set(x, ground - GEAR_Y, z);
      h.vel.set(0, 0, 0);
      h.landed = true;
      h.engineOn = s.kind === 'farp_hot';
      h.rpm = s.kind === 'farp_hot' ? 1 : 0;
    }
    updateQ(h);
  }

  spawn(missionUnitId: string): Unit | null {
    const w = this.world;
    if (!w || this.unitIds.has(missionUnitId)) return null;
    const s = this.mission.units.find(u => u.id === missionUnitId);
    if (!s) return null;
    const u = w.spawnUnit(s.type, s.position[0], s.position[1], -(s.headingDeg ?? 0) * Math.PI / 180, { missionId: s.id, group: s.group, skill: s.skill });
    this.unitIds.set(s.id, u.id);
    if (s.group) w.groups.get(s.group)?.members.push({ unit: u.id, leg: 0, dir: 1, arrived: false });
    return u;
  }

  unit(missionUnitId: string): Unit | undefined {
    const id = this.unitIds.get(missionUnitId);
    return id === undefined ? undefined : this.world?.unit(id);
  }

  private refUnits(ref: UnitRef): string[] {
    return Array.isArray(ref) ? ref : this.mission.units.filter(u => u.group === ref.group).map(u => u.id);
  }

  private destroyed(id: string) {
    const u = this.unit(id);
    return !!u && !u.alive;
  }

  private objective(id: string) {
    return this.objectives.find(o => o.def.id === id);
  }

  private setObjective(o: RuntimeObjective, state: MissionObjectiveState) {
    if (o.state === state) return;
    o.state = state;
    o.since = this.elapsed;
    this.world?.emit({ t: 'missionObjective', id: o.def.id, state: state === 'pending' ? 'active' : state, primary: o.def.primary });
    if (state === 'failed' && o.def.primary && this.failIn === null) this.failIn = FAIL_DELAY;
    this.updateNavTarget();
  }

  private updateNavTarget() {
    const w = this.world;
    if (!w) return;
    const next = this.objectives.find(o => o.state === 'active' && (o.def.kind === 'reach' || o.def.kind === 'land'));
    const at = next?.def.kind === 'reach' ? this.mission.waypoints.find(p => p.id === (next.def as { waypoint: string }).waypoint)
      : next?.def.kind === 'land' ? this.mission.farps.find(f => f.id === (next.def as { farp: string }).farp) : undefined;
    if (!at) return;
    const [x, z] = at.position;
    w.target = { x, y: w.terrain.surfaceAt(x, z), z, name: 'name' in at ? at.name : at.id.toUpperCase().replace('_', ' '), area: true, raw: true };
  }

  private landedAtFarp(id?: string) {
    const w = this.world!;
    if (!w.player.landed) return false;
    return this.mission.farps.some(f => (!id || f.id === id) && Math.hypot(f.position[0] - w.player.pos.x, f.position[1] - w.player.pos.z) <= FARP_RADIUS);
  }

  private evaluateObjective(o: RuntimeObjective) {
    if (o.state !== 'active') return;
    const w = this.world!, h = w.player, d = o.def;
    switch (d.kind) {
      case 'destroy': {
        const ids = this.refUnits(d.units);
        const dead = ids.filter(id => this.destroyed(id)).length;
        if (dead >= (d.count ?? ids.length)) this.setObjective(o, 'done');
        break;
      }
      case 'protect': {
        const ids = this.refUnits(d.units);
        const alive = ids.filter(id => !this.destroyed(id)).length;
        if (alive < d.minSurvive) this.setObjective(o, 'failed');
        else if (this.fired.has(d.untilTrigger)) this.setObjective(o, 'done');
        break;
      }
      case 'reach': {
        const wp = this.mission.waypoints.find(p => p.id === d.waypoint)!;
        if (Math.hypot(wp.position[0] - h.pos.x, wp.position[1] - h.pos.z) <= d.radius) this.setObjective(o, 'done');
        break;
      }
      case 'survive':
        if (this.elapsed - o.since + 1e-6 >= d.seconds) this.setObjective(o, 'done');
        break;
      case 'land':
        if (this.flown && this.landedAtFarp(d.farp)) this.setObjective(o, 'done');
        break;
      case 'identify':
        if (d.units.every(id => { const u = this.unit(id); return !!u && (u.identified || !u.alive); })) this.setObjective(o, 'done');
        break;
    }
  }

  condition(c: Condition): boolean {
    const w = this.world!, h = w.player;
    switch (c.kind) {
      case 'time': return this.elapsed + 1e-6 >= c.afterSec;
      case 'playerInZone': return Math.hypot(c.center[0] - h.pos.x, c.center[1] - h.pos.z) <= c.radius;
      case 'unitDestroyed': return c.units.filter(id => this.destroyed(id)).length >= (c.count ?? c.units.length);
      case 'objectiveDone': return this.objective(c.objective)?.state === 'done';
      case 'playerDetected': return w.units.some(u => u.alive && u.ai.detected && (!c.byGroup || u.group === c.byGroup));
      case 'all': return c.of.every(x => this.condition(x));
      case 'any': return c.of.some(x => this.condition(x));
    }
  }

  act(a: Action) {
    const w = this.world!;
    switch (a.kind) {
      case 'radio': this.radioQueue.push({ from: a.from, text: a.text }); break;
      case 'spawn': for (const id of a.units) this.spawn(id); break;
      case 'startGroup': {
        this.startedGroups.add(a.group);
        const g = w.groups.get(a.group);
        if (g) g.started = true;
        break;
      }
      case 'remoteLaser': { const u = this.unit(a.unit); if (u) w.remoteLaser(u.id, a.seconds); break; }
      case 'smoke': {
        const pos = new Vector3(a.position[0], w.terrain.surfaceAt(a.position[0], a.position[1]), a.position[1]);
        this.smokes.push({ pos, color: a.color, until: this.elapsed + 90 });
        w.emit({ t: 'smoke', pos: pos.clone(), color: a.color });
        break;
      }
      case 'objectiveAdd': { const o = this.objective(a.objective); if (o && o.state === 'pending') this.setObjective(o, 'active'); break; }
      case 'missionEnd': this.finish(a.result === 'success', a.reason); break;
    }
  }

  endNow() {
    const primaries = this.objectives.filter(o => o.def.primary);
    this.finish(primaries.length > 0 && primaries.every(o => o.state === 'done' || (o.def.kind === 'land' && o.state === 'active')), 'aborted');
  }

  private finish(success: boolean, reason?: string) {
    const w = this.world!;
    if (this.state !== 'active') return;
    if (success) {
      this.state = 'done';
      this.result = {
        timeSec: this.elapsed,
        primaryDone: this.objectives.filter(o => o.def.primary && o.state === 'done').length,
        secondaryDone: this.objectives.filter(o => !o.def.primary && o.state === 'done').length,
        landed: this.landedAtFarp() ? 1 : 0,
      };
      w.emit({ t: 'objective', id: this.id, state: 'done' });
    } else {
      this.state = 'failed';
      this.failure = 'mission';
      this.failureText = reason;
      w.emit({ t: 'objective', id: this.id, state: 'failed', reason: 'mission' });
    }
  }

  private stepRadio(dt: number) {
    if (this.radioNow) {
      this.radioNow.left -= dt;
      if (this.radioNow.left > 0) return;
      this.radioNow = null;
    }
    const next = this.radioQueue.shift();
    if (!next) return;
    this.radioNow = { ...next, left: RADIO_SECONDS };
    this.world!.emit({ t: 'radio', from: next.from, text: next.text });
  }

  private evaluateTriggers() {
    for (const t of this.mission.triggers) {
      if (t.once && this.fired.has(t.id)) continue;
      if (!this.condition(t.when)) continue;
      this.fired.add(t.id);
      for (const a of t.then) this.act(a);
      for (const g of this.world!.groups.values()) if (!g.started && this.mission.groups.find(d => d.id === g.id)?.startTrigger === t.id) g.started = true;
      for (const g of this.world!.groups.values()) if (!g.started && this.mission.groups.find(d => d.id === g.id)?.startTrigger === t.id) g.started = true;
    }
  }

  tick(world: World, dt: number) {
    if (this.state !== 'active') return;
    this.world = world;
    this.elapsed += dt;
    if (!world.player.landed) this.flown = true;
    this.triggerClock += dt;
    if (this.triggerClock >= 1 / TRIGGER_HZ - 1e-9) {
      this.triggerClock -= 1 / TRIGGER_HZ;
      this.evaluateTriggers();
      for (const o of this.objectives) this.evaluateObjective(o);
    }
    this.stepRadio(dt);
    for (let i = this.smokes.length - 1; i >= 0; i--) if (this.smokes[i].until <= this.elapsed) this.smokes.splice(i, 1);
    if (this.failIn !== null) {
      this.failIn -= dt;
      if (this.failIn <= 0) this.finish(false, undefined);
      return;
    }
    const primaries = this.objectives.filter(o => o.def.primary);
    if (primaries.length && primaries.every(o => o.state === 'done') && (!this.mission.farps.length || this.landedAtFarp())) this.finish(true);
  }

  private record(e: SimEvent, world: World) {
    const st = this.stats;
    if (e.t === 'fire' && e.owner === 0) st.shots[e.weapon] = (st.shots[e.weapon] ?? 0) + 1;
    else if (e.t === 'impact' && e.unit !== undefined && (e.weapon === 'gun30' || e.weapon === 'hydra70' || e.weapon === 'agm114k' || e.weapon === 'agm114l')) {
      const u = world.unit(e.unit);
      if (u && u.side !== 'coalition') st.hits[e.weapon] = (st.hits[e.weapon] ?? 0) + 1;
    } else if (e.t === 'unitDestroyed' && e.byPlayer) {
      if (e.side === 'veros') st.kills[e.defId] = (st.kills[e.defId] ?? 0) + 1;
      else if (e.side === 'coalition') st.friendly++;
      else st.civilian++;
    } else if (e.t === 'systemDamaged') st.damaged[e.system] = e.level;
    else if (e.t === 'playerHit' || (e.t === 'missileEnd' && e.hit)) st.hitsTaken++;
  }

  onEvent(e: SimEvent, world: World) {
    this.world = world;
    if (this.state !== 'active') return;
    this.record(e, world);
    if (e.t === 'landed' || e.t === 'unitDestroyed' || e.t === 'identified') for (const o of this.objectives) this.evaluateObjective(o);
  }

  hasFired(id: string) { return this.fired.has(id); }
}

export function missionTerrain(m: MissionDef): TerrainOptions {
  return {
    size: m.terrain.size,
    features: m.terrain.features,
    roads: m.terrain.roads,
    pads: m.farps.map(f => ({ x: f.position[0], z: f.position[1], name: f.id.replace(/^farp_/, '').toUpperCase(), base: true })),
  };
}

export function missionSession(m: MissionDef, loadout: LoadoutDef | null = null) {
  return new FlightSession(m.environment.seed, new MissionRuntime(m, loadout), missionTerrain(m));
}
