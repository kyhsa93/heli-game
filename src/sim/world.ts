import { Vector3 } from 'three';
import { EventBus } from '../core/events';
import { rng } from '../core/math';
import type { SimEvent } from './events';
import { BASE_REFUEL_RATE, GEAR_Y } from './heli/airframe';
import { clampToArea, collide, stepFlight } from './heli/flight';
import { createLoadout, grossWeight, STANDARD_LOADOUT, thrustScale, type Loadout, type LoadoutDef } from './heli/loadout';
import { createHeli, type Controls, type HeliState } from './heli/state';
import { toggleEngine } from './heli/systems';
import { PAD_R, Terrain, type Pad3 } from './terrain';
import { UNIT_DEFS, type Unit } from './units';
import { aimDirection, createArms, GUN_INTERVAL, gunInLimits, muzzlePosition, SALVOS, type Aim, type Arms, type WeaponId } from './weapons/arms';
import { explode, explodeWeapon, hitUnit, WEAPONS } from './weapons/damage';
import { integrate, PLAYER_OWNER, segmentHitsTerrain, segmentHitsUnit, type Projectile } from './weapons/projectile';
import { boresight, HYDRA, nextPod, podMuzzle, rocketPods, rocketProjectile, SALVO_INTERVAL } from './weapons/rockets';

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
  units: Unit[] = [];
  projectiles: Projectile[] = [];
  arms: Arms = createArms();
  loadoutDef: LoadoutDef = STANDARD_LOADOUT;
  loadout: Loadout = createLoadout(STANDARD_LOADOUT);
  commands = { fire: false, aim: { yaw: 0, pitch: 0 } as Aim };
  private nextUnitId = 1;
  private nextProjectileId = 1;
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
    this.applyLoadout(this.loadoutDef);
    this.commands = { fire: false, aim: { yaw: 0, pitch: 0 } };
  }

  applyLoadout(def: LoadoutDef) {
    this.loadoutDef = def;
    this.loadout = createLoadout(def);
    this.arms = createArms(def.gunRounds);
    this.player.fuel = def.fuel;
    this.updateWeight();
  }

  get grossWeight() {
    return grossWeight(this.loadout, this.player.fuel, this.arms.gunAmmo);
  }

  updateWeight() {
    this.player.thrustScale = thrustScale(this.grossWeight);
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

  spawnUnit(defId: string, x: number, z: number, yaw = 0, opts: { missionId?: string; group?: string } = {}): Unit {
    const def = UNIT_DEFS[defId];
    if (!def) throw new Error(`unknown unit ${defId}`);
    const y = def.move?.air ? this.terrain.surfaceAt(x, z) + 60 : this.terrain.surfaceAt(x, z);
    const u: Unit = {
      id: this.nextUnitId++, defId, def, side: def.side, missionId: opts.missionId, group: opts.group,
      pos: new Vector3(x, y, z), yaw, vel: new Vector3(), hp: def.hp, alive: true,
      ai: { awareness: 0, state: 'idle' }, weaponCooldown: 0, identified: false,
    };
    this.units.push(u);
    return u;
  }

  availableWeapons(): WeaponId[] {
    const list: WeaponId[] = ['gun30'];
    if (rocketPods(this.loadout).length) list.push('hydra70');
    return list;
  }

  selectWeapon(slot: 1 | 2 | 3 | 4) {
    const a = this.arms;
    if (slot === 1) this.setWeapon('gun30');
    else if (slot === 2 && this.availableWeapons().includes('hydra70')) {
      if (a.selected === 'hydra70') a.salvo = SALVOS[(SALVOS.indexOf(a.salvo) + 1) % SALVOS.length];
      else this.setWeapon('hydra70');
    }
  }

  nextWeapon() {
    const list = this.availableWeapons();
    this.setWeapon(list[(list.indexOf(this.arms.selected) + 1) % list.length]);
  }

  private setWeapon(id: WeaponId) {
    if (this.arms.selected === id) return;
    this.arms.selected = id;
    this.arms.salvoLeft = 0;
  }

  clearCombat() {
    this.units = [];
    this.projectiles = [];
  }

  unit(id: number) {
    return this.units.find(u => u.id === id);
  }

  damageUnit(u: Unit, amount: number, byPlayer: boolean) {
    if (!u.alive || u.def.indestructible || amount <= 0) return;
    u.hp = Math.max(0, u.hp - amount);
    if (u.hp === 0) {
      u.alive = false;
      u.vel.set(0, 0, 0);
      this.emit({ t: 'unitDestroyed', id: u.id, defId: u.defId, side: u.side, byPlayer });
      const sec = u.def.secondaryExplosion;
      if (sec) {
        explode(this, u.pos.clone().setY(u.pos.y + u.def.size[1] / 2), sec.damage, sec.radius, WEAPONS.secondary.penetration, byPlayer, u);
        if (sec.chain) {
          for (const o of this.units) {
            if (o.alive && o.def.secondaryExplosion?.chain && o.pos.distanceTo(u.pos) <= sec.radius) this.damageUnit(o, o.hp, byPlayer);
          }
        }
      }
    }
  }

  step(dt: number) {
    this.time += dt;
    const wa = this.time * 0.013;
    const ws = 4 + 2.5 * Math.sin(this.time * 0.05) + 1.5 * Math.sin(this.time * 0.37);
    this.wind.set(Math.cos(wa) * ws, 0, Math.sin(wa) * ws);

    const h = this.player;
    if (this.active && h.alive) {
      this.updateWeight();
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
      this.stepGun(dt);
      this.stepRockets(dt);
    }
    this.stepProjectiles(dt);
    this.events.flush();
  }

  private stepGun(dt: number) {
    const a = this.arms, h = this.player;
    a.gunTimer = Math.max(0, a.gunTimer - dt);
    if (!this.commands.fire || a.selected !== 'gun30' || !h.alive) return;
    if (!gunInLimits(this.commands.aim)) return;
    const w = WEAPONS.gun30;
    while (a.gunTimer <= 0 && a.gunAmmo > 0) {
      const dir = aimDirection(h, this.commands.aim);
      this.disperse(dir, w.dispersionMrad ?? 0);
      const pos = muzzlePosition(h);
      const tracer = a.shots % 5 === 0;
      this.projectiles.push({
        id: this.nextProjectileId++, weapon: 'gun30', pos, origin: pos.clone(), vel: dir.clone().multiplyScalar(w.speed).add(h.vel),
        owner: PLAYER_OWNER, life: (w.maxRange / w.speed) * 3, drag: w.drag ?? 0, tracer,
      });
      this.emit({ t: 'fire', weapon: 'gun30', pos: pos.clone(), dir: dir.clone(), owner: PLAYER_OWNER, tracer });
      a.gunAmmo--;
      a.shots++;
      a.gunTimer += GUN_INTERVAL;
    }
  }

  private disperse(dir: Vector3, mrad: number) {
    const h = this.player;
    const spread = mrad / 1000 * (Math.hypot(h.vel.x, h.vel.z) > 10.3 ? 1.5 : 1);
    const ang = this.rng() * Math.PI * 2, rad = Math.sqrt(this.rng()) * spread;
    const side = new Vector3(0, 1, 0).cross(dir).normalize();
    const up = dir.clone().cross(side).normalize();
    return dir.addScaledVector(side, Math.cos(ang) * rad).addScaledVector(up, Math.sin(ang) * rad).normalize();
  }

  private stepRockets(dt: number) {
    const a = this.arms, h = this.player;
    const pressed = this.commands.fire && !a.trigger;
    a.trigger = this.commands.fire;
    a.rocketTimer = Math.max(0, a.rocketTimer - dt);
    if (a.selected !== 'hydra70' || !h.alive) { a.salvoLeft = 0; return; }
    if (pressed && a.salvoLeft === 0) a.salvoLeft = a.salvo;
    while (a.salvoLeft > 0 && a.rocketTimer <= 1e-9) {
      const pod = nextPod(this.loadout, a.rocketsFired);
      if (!pod) { a.salvoLeft = 0; break; }
      const dir = this.disperse(boresight(h), HYDRA.dispersionMrad ?? 0);
      const pos = podMuzzle(h, pod);
      this.projectiles.push({ id: this.nextProjectileId++, owner: PLAYER_OWNER, ...rocketProjectile(h, pos, dir) });
      this.emit({ t: 'fire', weapon: 'hydra70', pos: pos.clone(), dir: dir.clone(), owner: PLAYER_OWNER, tracer: true });
      this.loadout.rounds[pod]--;
      a.rocketsFired++;
      a.salvoLeft--;
      a.rocketTimer += SALVO_INTERVAL;
    }
  }

  private stepProjectiles(dt: number) {
    const list = this.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      const a = integrate(p, dt).clone();
      const b = p.pos;
      let bestT = Infinity, bestUnit: Unit | null = null;
      for (const u of this.units) {
        if (!u.alive) continue;
        const t = segmentHitsUnit(a, b, u);
        if (t !== null && t < bestT) { bestT = t; bestUnit = u; }
      }
      const tg = segmentHitsTerrain(a, b, this.terrain);
      let done = p.life <= 0;
      if (bestUnit && (tg === null || bestT <= tg)) {
        const at = a.clone().lerp(b, bestT);
        const w = WEAPONS[p.weapon];
        const byPlayer = p.owner === PLAYER_OWNER;
        if (at.distanceTo(p.origin) >= w.minRange) {
          hitUnit(this, bestUnit, w, byPlayer);
          explodeWeapon(this, at, w, byPlayer, bestUnit);
        }
        this.emit({ t: 'impact', weapon: p.weapon, pos: at, unit: bestUnit.id, ground: false });
        done = true;
      } else if (tg !== null) {
        const at = a.clone().lerp(b, tg);
        const w = WEAPONS[p.weapon];
        if (at.distanceTo(p.origin) >= w.minRange) explodeWeapon(this, at, w, p.owner === PLAYER_OWNER);
        this.emit({ t: 'impact', weapon: p.weapon, pos: at, ground: true });
        done = true;
      }
      if (done) { list[i] = list[list.length - 1]; list.pop(); }
    }
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
