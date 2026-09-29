import { Vector3 } from 'three';
import { M_TO_FT } from '../../core/units';
import type { CoachTip, SimEvent } from '../events';
import { AIRCRAFT, GEAR_Y } from '../heli/airframe';
import { hoverCollective } from '../heli/loadout';
import { agl, updateQ } from '../heli/state';
import type { Objective, ObjectiveState, RingMarker } from '../objective';
import { FlightSession } from '../session';
import type { TerrainOptions } from '../terrain';
import type { Unit } from '../units';
import type { World } from '../world';
import type { LoadoutDef } from '../heli/loadout';
import type { SystemId } from '../heli/damage';
import { createWingman, formationPoint, WINGMAN_ID, WINGMAN_TYPE } from '../ai/wingman';
import type { Action, Condition, MissionDef, ObjectiveDef, RadioFrom, UnitRef, UnlockId } from './schema';
import { FRIENDLY_FAIL, scoreMission, type Score } from './scoring';

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
export const STEP_HZ = 10;
export const STEP_FLASH = 1.2;
export const HOVER_SPEED = 2;
export const HOVER_MIN_AGL = 1.5;
export const TOO_HIGH_EVERY = 4;

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
  private lastHardLanding = -1;
  private laserBroken = false;
  step?: string;
  stepIndex = 0;
  stepFlash = 0;
  private stepClock = 0;
  private hoverTime = 0;
  private ringsPassed = new Map<string, number>();
  private lastTooHigh = -Infinity;
  private world: World | null = null;

  stats: MissionStats = emptyStats();

  private coached = new Set<string>();

  constructor(readonly mission: MissionDef, private loadout: LoadoutDef | null = null, private unlocked: ReadonlySet<UnlockId> = new Set(), private coach: ReadonlySet<string> | null = null) {
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
    this.laserBroken = false;
    this.step = undefined;
    this.stepIndex = 0;
    this.stepFlash = 0;
    this.stepClock = 0;
    this.hoverTime = 0;
    this.ringsPassed.clear();
    this.lastTooHigh = -Infinity;
    world.applyLoadout(this.loadout ?? m.briefing.recommendedLoadout);
    world.player.fuelBurnScale = AIRCRAFT.fuel.campaignBurnScale;
    this.stats = emptyStats();
    this.score = null;
    world.conditions = { ...world.conditions, night: m.environment.time === 'night', fog: m.environment.fog, time: m.environment.time };
    const unlocked = new Set([...this.unlocked, ...(m.unlocks ?? [])]);
    world.cm.chaffUnlocked = unlocked.has('chaff');
    world.fcr.unlocked = unlocked.has('fcr');
    for (const g of m.groups) {
      const route = g.route ? (world.terrain.roads.length ? world.roads.route(g.route) : g.route.map(p => [p[0], p[1]] as [number, number])) : [];
      world.groups.set(g.id, { id: g.id, behavior: g.behavior, path: route, loop: !!g.loop, speedScale: g.speedScale ?? 1, started: !g.startTrigger, members: [] });
    }
    for (const u of m.units) if (!u.hidden) this.spawn(u.id);
    const initial = m.initialObjectives ? new Set(m.initialObjectives) : null;
    this.objectives = m.objectives.map(def => ({ def, state: !initial || initial.has(def.id) ? 'active' : 'pending', since: 0 }));
    this.placePlayer(world);
    world.wingmanMenu = unlocked.has('wingmanMenu');
    if (m.wingman) this.spawnWingman(world);
    this.updateNavTarget();
    this.coached.clear();
    if (world.fcr.unlocked) this.tip('fcr');
    if (m.environment.time === 'night') this.tip('night');
    if (m.wingman) this.tip(world.wingmanMenu ? 'wingmanMenu' : 'wingman');
  }

  private tip(tip: CoachTip) {
    if (!this.coach || this.coach.has(tip) || this.coached.has(tip)) return;
    this.coached.add(tip);
    this.world?.emit({ t: 'coach', tip });
  }

  private coachOn(e: SimEvent, world: World) {
    if (!this.coach) return;
    if (e.t === 'radarTrack' && e.on) this.tip('rwr');
    else if (e.t === 'missileWarning') this.tip('missile');
    else if (e.t === 'detected' && world.unit(e.id)?.def.move?.air) this.tip('airThreat');
    const h = world.player, lo = world.loadout;
    if (h.fuel < 35 || (Object.values(lo.def.pylons).some(p => p !== 'empty') && Object.values(lo.rounds).every(n => n <= 0))) this.tip('farp');
  }

  private spawnWingman(world: World) {
    const at = formationPoint(world);
    const u = world.spawnUnit(WINGMAN_TYPE, at.x, at.z, world.player.yaw, { missionId: WINGMAN_ID });
    u.pos.y = at.y;
    u.vel.copy(world.player.vel);
    this.unitIds.set(WINGMAN_ID, u.id);
    const farp = this.mission.farps[0];
    world.wingman = createWingman(u.id, farp ? new Vector3(farp.position[0], 0, farp.position[1]) : null);
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
    const u = w.spawnUnit(s.type, s.position[0], s.position[1], -(s.headingDeg ?? 0) * Math.PI / 180, { missionId: s.id, group: s.group, skill: s.skill, passive: s.passive, aam: s.aam });
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
    const next = this.objectives.find(o => o.state === 'active' && (o.def.kind === 'reach' || o.def.kind === 'land' || o.def.kind === 'rings'));
    if (next?.def.kind === 'rings') {
      const i = Math.min(this.ringsPassed.get(next.def.id) ?? 0, next.def.rings.length - 1), [x, z] = next.def.rings[i];
      w.target = { x, y: w.terrain.surfaceAt(x, z) + next.def.maxAgl / 2, z, name: `RING ${i + 1}`, raw: true };
      return;
    }
    const at = next?.def.kind === 'reach' ? this.mission.waypoints.find(p => p.id === (next.def as { waypoint: string }).waypoint)
      : next?.def.kind === 'land' ? this.mission.farps.find(f => f.id === (next.def as { farp: string }).farp)
        : this.mission.waypoints.find(p => !/^BP/i.test(p.name));
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
      case 'rings':
        if ((this.ringsPassed.get(d.id) ?? 0) >= d.rings.length) this.setObjective(o, 'done');
        break;
      case 'survive':
        if (this.elapsed - o.since + 1e-6 >= d.seconds) this.setObjective(o, 'done');
        break;
      case 'land':
        if (this.flown && this.landedAtFarp(d.farp)) {
          const fpm = w.player.touchdownDescent * 196.85;
          if (d.maxFpm !== undefined && fpm > d.maxFpm) { if (this.lastHardLanding !== w.time) { this.lastHardLanding = w.time; w.emit({ t: 'advice', code: 'landingTooHard', value: fpm }); } }
          else this.setObjective(o, 'done');
        }
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
      case 'playerHits': return this.stats.hitsTaken >= c.count;
      case 'laserBroken': return this.laserBroken;
      case 'tadsActive': return w.tads.active;
      case 'unitsIdentified': return c.units.filter(id => this.unit(id)?.identified).length >= (c.count ?? c.units.length);
      case 'groupArrived': { const g = w.groups.get(c.group); return !!g && g.members.length > 0 && g.members.filter(m => m.arrived).length >= (c.count ?? g.members.length); }
      case 'engineReady': return h.engineOn && h.rpm >= 0.97;
      case 'playerAgl': { const a = agl(h, w.terrain); return (c.above === undefined || a > c.above) && (c.below === undefined || a < c.below); }
      case 'hover': return this.hoverTime + 1e-6 >= c.seconds;
      case 'ringsPassed': return (this.ringsPassed.get(c.objective) ?? 0) >= c.count;
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
      case 'hint': this.step = a.text; break;
    }
  }

  computeScore(success: boolean): Score {
    const s = this.stats;
    return scoreMission({
      success,
      primaryDone: this.objectives.filter(o => o.def.primary && o.state === 'done').length,
      primaryTotal: this.objectives.filter(o => o.def.primary).length,
      secondaryDone: this.objectives.filter(o => !o.def.primary && o.state === 'done').length,
      kills: s.kills, shots: s.shots, hits: s.hits, hitsTaken: s.hitsTaken,
      damagedSystems: Object.keys(s.damaged).length,
      landed: !!this.world && this.flown && this.landedAtFarp(),
      timeSec: this.elapsed, parTimeSec: this.mission.parTimeSec,
      friendly: s.friendly, civilian: s.civilian,
    }, this.mission.par);
  }

  endNow() {
    const primaries = this.objectives.filter(o => o.def.primary);
    this.finish(primaries.length > 0 && primaries.every(o => o.state === 'done' || (o.def.kind === 'land' && o.state === 'active')), 'aborted');
  }

  score: Score | null = null;

  private finish(success: boolean, reason?: string, code = 'mission') {
    const w = this.world!;
    if (this.state !== 'active') return;
    this.score = this.computeScore(success);
    if (success) {
      const steps = this.mission.steps;
      while (steps && this.stepIndex < steps.length && this.condition(steps[this.stepIndex].done)) {
        this.stepIndex++;
        w.emit({ t: 'step', index: this.stepIndex, total: steps.length });
      }
      this.state = 'done';
      this.result = {
        timeSec: this.elapsed,
        primaryDone: this.objectives.filter(o => o.def.primary && o.state === 'done').length,
        secondaryDone: this.objectives.filter(o => !o.def.primary && o.state === 'done').length,
        landed: this.flown && this.landedAtFarp() ? 1 : 0,
      };
      w.emit({ t: 'objective', id: this.id, state: 'done' });
    } else {
      this.state = 'failed';
      this.failure = code;
      this.failureText = reason;
      w.emit({ t: 'objective', id: this.id, state: 'failed', reason: code });
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
    this.stepFlight(world, dt);
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
    if (primaries.length && primaries.every(o => o.state === 'done') && (this.mission.kind === 'training' || this.mission.kind === 'instant' || !this.mission.farps.length || this.landedAtFarp())) this.finish(true);
  }

  get steps() {
    return this.mission.steps;
  }

  get rings(): RingMarker[] {
    const w = this.world, out: RingMarker[] = [];
    if (!w) return out;
    for (const o of this.objectives) {
      if (o.def.kind !== 'rings' || o.state === 'pending') continue;
      const d = o.def, passed = this.ringsPassed.get(d.id) ?? 0;
      d.rings.forEach(([x, z], i) => {
        const [nx, nz] = d.rings[Math.min(i + 1, d.rings.length - 1)], [px, pz] = d.rings[Math.max(i - 1, 0)];
        out.push({ x, z, y: w.terrain.surfaceAt(x, z) + d.maxAgl / 2, radius: d.radius, size: d.maxAgl / 2, state: i < passed ? 'done' : i === passed && o.state === 'active' ? 'next' : 'ahead', heading: Math.atan2(-(nx - px), -(nz - pz)) });
      });
    }
    return out;
  }

  private stepFlight(world: World, dt: number) {
    const h = world.player, a = agl(h, world.terrain);
    this.hoverTime = !h.landed && h.alive && a > HOVER_MIN_AGL && Math.hypot(h.vel.x, h.vel.z) < HOVER_SPEED ? this.hoverTime + dt : 0;
    for (const o of this.objectives) {
      if (o.def.kind !== 'rings' || o.state !== 'active') continue;
      const d = o.def, i = this.ringsPassed.get(d.id) ?? 0;
      if (a > d.maxAgl && this.elapsed - this.lastTooHigh >= TOO_HIGH_EVERY) {
        this.lastTooHigh = this.elapsed;
        world.emit({ t: 'advice', code: 'tooHigh', value: Math.round(a * M_TO_FT) });
      }
      if (i >= d.rings.length) continue;
      const [x, z] = d.rings[i];
      if (Math.hypot(x - h.pos.x, z - h.pos.z) <= d.radius && a <= d.maxAgl) {
        this.ringsPassed.set(d.id, i + 1);
        world.emit({ t: 'ring', index: i + 1, total: d.rings.length });
        if (i + 1 >= d.rings.length) this.setObjective(o, 'done');
        else this.updateNavTarget();
      }
    }
    this.stepFlash = Math.max(0, this.stepFlash - dt);
    const steps = this.mission.steps;
    this.stepClock += dt;
    if (!steps || this.stepIndex >= steps.length || this.stepClock < 1 / STEP_HZ - 1e-9) return;
    this.stepClock = 0;
    if (!this.condition(steps[this.stepIndex].done)) return;
    this.stepIndex++;
    this.stepFlash = STEP_FLASH;
    world.emit({ t: 'step', index: this.stepIndex, total: steps.length });
  }

  private record(e: SimEvent, world: World) {
    const st = this.stats;
    if (e.t === 'fire' && e.owner === 0) st.shots[e.weapon] = (st.shots[e.weapon] ?? 0) + 1;
    else if (e.t === 'impact' && e.unit !== undefined && (e.weapon === 'gun30' || e.weapon === 'hydra70' || e.weapon === 'agm114k' || e.weapon === 'agm114l')) {
      const u = world.unit(e.unit);
      if (u && u.side !== 'coalition') st.hits[e.weapon] = (st.hits[e.weapon] ?? 0) + 1;
    } else if (e.t === 'unitDestroyed' && e.byPlayer) {
      if (e.side === 'veros') st.kills[e.defId] = (st.kills[e.defId] ?? 0) + 1;
      else if (e.side === 'coalition') { st.friendly++; if (st.friendly >= FRIENDLY_FAIL) this.finish(false, undefined, 'friendlyFire'); }
      else st.civilian++;
    } else if (e.t === 'systemDamaged') st.damaged[e.system] = e.level;
    else if (e.t === 'missileLost' && e.owner === 0 && e.reason === 'spotLost') this.laserBroken = true;
    else if (e.t === 'playerHit' || (e.t === 'missileEnd' && e.hit)) st.hitsTaken++;
  }

  onEvent(e: SimEvent, world: World) {
    this.world = world;
    if (this.state !== 'active') return;
    this.record(e, world);
    this.coachOn(e, world);
    if (e.t === 'landed' || e.t === 'unitDestroyed' || e.t === 'identified') for (const o of this.objectives) this.evaluateObjective(o);
  }

  hasFired(id: string) { return this.fired.has(id); }
}

export function missionTerrain(m: MissionDef): TerrainOptions {
  return {
    size: m.terrain.size,
    features: m.terrain.features,
    roads: m.terrain.roads,
    pads: m.farps.map(f => ({ x: f.position[0], z: f.position[1], name: f.id.replace(/^(farp|pad)_/, '').toUpperCase(), base: f.services.includes('fuel') })),
  };
}

export function missionSession(m: MissionDef, loadout: LoadoutDef | null = null, unlocked: ReadonlySet<UnlockId> = new Set(), coach: ReadonlySet<string> | null = null) {
  return new FlightSession(m.environment.seed, new MissionRuntime(m, loadout, unlocked, coach), missionTerrain(m));
}
