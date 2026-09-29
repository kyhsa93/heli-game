import * as THREE from 'three';
import type { GameAudio } from '../audio/game';
import { clamp } from '../core/math';
import { BLADES, EYE, ROTOR_HZ } from '../sim/heli/airframe';
import { DAMAGED } from '../sim/heli/damage';
import { drawCanopyCracks } from './canopy';
import { agl as aglOf, airspeed } from '../sim/heli/state';
import type { FlightSession } from '../sim/session';
import { STEP } from '../sim/world';
import type { FlightInput } from '../input/input';
import { Instruments } from './cockpit/instruments';
import { applyLoadout, buildHeli, type HeliModel } from './heliModel';
import { assets } from '../assets/loader';
import { FARP_GROUP, UNITS_GROUP } from '../assets/manifest';
import { FarpProps } from './farp';
import { Effects, fallbackAtlas } from './effects';
import { UnitRenderer } from './unitRenderer';
import { RingGates } from './rings';
import { drawIhadss } from './ihadss';
import { hellfireSolution, longbowSolution } from '../sim/weapons/hellfire';
import { aseThreats } from '../sim/sensors/ase';
import { rwrLevel } from '../audio/rwr';
import { M_TO_FT, MS_TO_FPM } from '../core/units';
import { TadsView } from './tadsView';
import { bezelHitAt, type MpdSide } from './cockpit/mpd';

const MPD_TADS = 256;
const MPD_TADS_MS = 200;
import { drawTads } from './tadsHud';
import { buildWorld, type WorldScene } from './scene';

export type View = 'cockpit' | 'chase';

export interface FrameInfo { simDt: number; cockpit: boolean; agl: number }

export interface RendererOptions {
  mount: HTMLElement;
  overlay: HTMLCanvasElement;
  session: FlightSession;
  input: FlightInput;
  onFrame?: (info: FrameInfo) => void;
}

export class FlightRenderer {
  view: View = 'cockpit';
  debugCamera: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  hud = true;
  audio: GameAudio | null = null;
  private listener = new THREE.Vector3();
  readonly model: HeliModel;
  readonly scene: WorldScene;
  readonly camera = new THREE.PerspectiveCamera(72, 1, 0.05, 7000);
  private renderer: THREE.WebGLRenderer;
  private instruments: Instruments;
  private overlayCtx: CanvasRenderingContext2D;
  private raf = 0;
  private last = performance.now();
  private acc = 0;
  private frame = 0;
  private rotorAngle = 0;
  private tailAngle = 0;
  private chasePos = new THREE.Vector3();
  private chaseInit = false;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  readonly effects: Effects;
  readonly units = new UnitRenderer();
  private rings = new RingGates();
  readonly farp: FarpProps;
  readonly tads = new TadsView();
  private mpdTads = new TadsView();
  private mpdTarget = new THREE.WebGLRenderTarget(MPD_TADS, MPD_TADS);
  private mpdPixels = new Uint8Array(MPD_TADS * MPD_TADS * 4);
  private mpdCanvas: HTMLCanvasElement | null = null;
  mpdVideo = true;
  private mpdVideoAt = -Infinity;
  private raycaster = new THREE.Raycaster();
  private flirFog = new THREE.Color(0x151515);
  private black = new THREE.Color(0x000000);
  private unitAssetsRequested = false;
  private offEvents: () => void;

  constructor(private opts: RendererOptions) {
    const { mount, overlay, session } = opts;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(this.renderer.domElement);

    this.scene = buildWorld(session.world.terrain, assets.get<THREE.Texture>('tex.ground_detail') ?? null);
    this.model = buildHeli();
    this.scene.scene.add(this.model.root);
    this.instruments = new Instruments(session.world);
    const tex = this.instruments.textures();
    for (const key of Object.keys(tex) as (keyof typeof tex)[]) {
      const mat = this.model.screens[key].material as THREE.MeshBasicMaterial;
      mat.map = tex[key];
      mat.needsUpdate = true;
    }
    this.overlayCtx = overlay.getContext('2d')!;
    this.model.head.add(this.camera);
    this.effects = new Effects(assets.get<THREE.Texture>('tex.particles') ?? fallbackAtlas());
    this.scene.scene.add(this.effects.group);
    this.scene.scene.add(this.units.group);
    this.farp = new FarpProps(session.world.pads);
    this.scene.scene.add(this.rings.group);
    this.scene.scene.add(this.farp.group);
    void assets.loadGroup(FARP_GROUP).then(report => {
      const models: Record<string, THREE.Object3D> = {};
      for (const id of report.loaded) { const g = assets.get<{ scene: THREE.Object3D }>(id); if (g) models[id.replace('model.prop_', '')] = g.scene; }
      this.farp.setModels(models);
    });
    this.offEvents = session.world.events.onAny(e => {
      this.effects.onEvent(e, session.world);
      if (this.audio) this.audio.onEvent(e, this.camera.getWorldPosition(this.listener));
    });

    this.mpdTads.setSize(MPD_TADS * 2, MPD_TADS * 2);
    this.resize();
    window.addEventListener('resize', this.resize);
    this.raf = requestAnimationFrame(this.tick);
  }

  private loadUnitModels() {
    this.unitAssetsRequested = true;
    void assets.loadGroup(UNITS_GROUP).then(report => {
      for (const id of report.loaded) {
        const gltf = assets.get<{ scene: THREE.Object3D }>(id);
        if (gltf) this.units.setModel(id.replace('model.', ''), gltf.scene);
      }
    });
  }

  toggleView() {
    this.view = this.view === 'cockpit' ? 'chase' : 'cockpit';
  }

  private resize = () => {
    const { mount, overlay } = this.opts;
    const w = mount.clientWidth, h = mount.clientHeight;
    this.renderer.setSize(w, h);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    overlay.width = w * dpr; overlay.height = h * dpr;
    this.overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.aspect = w / h;
    this.camera.fov = w >= h ? 72 : Math.min(100, 2 * Math.atan(Math.tan(37 * Math.PI / 180) * h / w) * 180 / Math.PI);
    this.camera.updateProjectionMatrix();
    this.effects?.setScale(h, this.camera.fov);
    this.tads.setSize(w * dpr, h * dpr);
  };

  private tick = (now: number) => {
    const { session, input, mount, overlay } = this.opts;
    const world = session.world;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    input.update(world, dt);
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP) { session.step(STEP); this.acc -= STEP; steps++; }
    const h = world.player, c = world.controls, model = this.model, scn = this.scene, camera = this.camera;

    model.root.position.copy(h.pos);
    model.root.quaternion.copy(h.q);
    model.root.visible = h.alive || session.mode === 'brief';

    this.rotorAngle += h.rpm * Math.PI * 2 * ROTOR_HZ * dt;
    this.tailAngle += h.rpm * Math.PI * 2 * 23 * dt;
    model.rotor.rotation.y = this.rotorAngle;
    model.tailRotor.rotation.x = this.tailAngle;
    const blur = clamp((h.rpm - 0.25) / 0.5, 0, 1);
    for (const b of model.blades) (b.material as THREE.MeshLambertMaterial).opacity = 1 - blur * 0.85;
    (model.disc.material as THREE.MeshBasicMaterial).opacity = blur * 0.16;

    applyLoadout(model, world.loadout);
    model.cyclic.rotation.set(-c.cyclicY * 0.25, 0, -c.cyclicX * 0.25);
    model.collective.rotation.x = h.collective * 0.45;
    model.pedalL.position.z = -3.18 + c.pedal * 0.05;
    model.pedalR.position.z = -3.18 - c.pedal * 0.05;

    const cockpit = this.view === 'cockpit' && !this.debugCamera;
    const speed = airspeed(h, world.wind);
    model.shell.visible = !cockpit;
    if (this.debugCamera) {
      if (camera.parent !== scn.scene) scn.scene.add(camera);
      camera.position.copy(this.debugCamera.pos);
      camera.lookAt(this.debugCamera.look);
    } else if (cockpit) {
      if (camera.parent !== model.head) { model.head.add(camera); camera.position.set(0, 0, 0); }
      const vib = h.rpm * (0.0012 + speed * 0.00003) * (h.landed ? 0.5 : 1) * (h.damage.rotor <= DAMAGED ? 4 : 1);
      model.head.position.set(
        EYE.x + (Math.random() - 0.5) * vib,
        EYE.y + Math.sin(now * 0.001 * Math.PI * 2 * ROTOR_HZ * BLADES * h.rpm) * vib + (Math.random() - 0.5) * vib,
        EYE.z,
      );
      camera.rotation.set(input.headPitch, input.headYaw, 0, 'YXZ');
      this.chaseInit = false;
    } else {
      if (camera.parent !== scn.scene) scn.scene.add(camera);
      const yawDir = this.tmp.set(-Math.sin(h.yaw), 0, -Math.cos(h.yaw));
      const want = this.tmp2.copy(h.pos).addScaledVector(yawDir, -30);
      want.y += 9;
      want.y = Math.max(want.y, world.terrain.surfaceAt(want.x, want.z) + 2);
      if (!this.chaseInit) { this.chasePos.copy(want); this.chaseInit = true; }
      this.chasePos.lerp(want, Math.min(1, dt * 3));
      camera.position.copy(this.chasePos);
      camera.lookAt(h.pos.x, h.pos.y + 1, h.pos.z);
    }

    const tp = world.target;
    scn.beam.visible = !!tp;
    if (tp) scn.beam.position.set(tp.x, tp.y + 250, tp.z);
    const blink = Math.sin(now * 0.008) > 0;
    world.pads.forEach((p, i) => {
      const pv = scn.pads[i];
      const target = !!tp && Math.hypot(p.x - tp.x, p.z - tp.z) < 1;
      for (const l of pv.lights) {
        (l.material as THREE.MeshBasicMaterial).color.set(target ? (blink ? 0x06d6a0 : 0x222222) : p.base ? 0x4cc9f0 : 0x886633);
      }
      const ws = world.wind.length();
      pv.sock.rotation.set(0, Math.atan2(-world.wind.z, world.wind.x), -(1 - Math.min(1, ws / 8)) * 0.9);
    });

    const agl = aglOf(h, world.terrain);
    const sy = world.terrain.surfaceAt(h.pos.x, h.pos.z);
    scn.shadow.visible = h.alive && agl < 90;
    scn.shadow.position.set(h.pos.x, sy + 0.12, h.pos.z);
    scn.shadow.scale.setScalar(5.5 + Math.max(0, agl) * 0.03);
    (scn.shadow.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - clamp(agl / 90, 0, 1));

    camera.getWorldPosition(this.tmp);
    scn.sky.position.copy(this.tmp);
    scn.terrain.update(this.tmp);
    (scn.sky.material as THREE.ShaderMaterial).uniforms.time.value = now * 0.001;

    if (world.units.length && !this.unitAssetsRequested) this.loadUnitModels();
    const tads = world.tads.active && h.alive && !this.debugCamera;
    const flir = tads && world.tads.sensor === 'flir';
    this.units.update(world, flir);
    this.rings.update(session.objective?.rings ?? []);
    this.effects.update(steps * STEP, world);
    if (!tads && this.mpdVideo && this.instruments.shows('TADS') && now - this.mpdVideoAt >= MPD_TADS_MS && h.alive) {
      this.mpdVideoAt = now;
      this.renderMpdTads(now, world.tads.sensor === 'flir');
    }
    this.instruments.draw(world, this.frame++ % 3);
    if (tads) this.renderTads(now, flir);
    else this.renderer.render(scn.scene, camera);

    const og = this.overlayCtx;
    og.clearRect(0, 0, overlay.width, overlay.height);
    if (tads) drawTads(og, mount.clientWidth, mount.clientHeight, world);
    else if (cockpit && this.hud && h.alive && session.mode !== 'brief') drawIhadss(og, mount.clientWidth, mount.clientHeight, world, camera);
    if (cockpit && !tads && h.damage.cockpit <= DAMAGED) drawCanopyCracks(og, mount.clientWidth, mount.clientHeight, 1 - h.damage.cockpit / DAMAGED);

    this.audio?.update({
      rpm: h.alive ? h.rpm : 0, collective: h.collective, airspeed: speed,
      warn: h.alive && session.mode === 'play' && ((h.rpm < 0.85 && !h.landed) || h.fuel < 10),
      lock: h.alive && ((world.arms.selected === 'agm114k' && hellfireSolution(world).status === 'lobl') || (world.arms.selected === 'agm114l' && longbowSolution(world).status === 'rf')),
      ir: h.alive && world.arms.selected === 'stinger' ? (world.stinger.locked ? 'lock' : world.stinger.unitId !== null ? 'seek' : 'none') : 'none',
      rwr: h.alive && session.mode === 'play' ? rwrLevel(aseThreats(world)) : 'none',
      fuel: h.fuel, aglFt: agl * M_TO_FT, vsFpm: h.vel.y * MS_TO_FPM, flying: h.alive && !h.landed && session.mode === 'play',
    });

    this.opts.onFrame?.({ simDt: steps * STEP, cockpit, agl });
    this.raf = requestAnimationFrame(this.tick);
  };

  get mpd() { return this.instruments.mpd; }

  clickAt(clientX: number, clientY: number): boolean {
    if (this.view !== 'cockpit' || this.debugCamera || this.opts.session.world.tads.active) return false;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const screens = this.model.screens;
    const hit = this.raycaster.intersectObjects([screens.mpdL, screens.mpdR], false)[0];
    if (!hit?.uv) return false;
    const side: MpdSide = hit.object === screens.mpdL ? 'left' : 'right';
    return this.instruments.mpd.press(side, bezelHitAt(hit.uv.x, hit.uv.y));
  }

  private renderMpdTads(now: number, flir: boolean) {
    const world = this.opts.session.world;
    this.units.update(world, flir);
    this.renderTadsInto(this.mpdTads, now, flir, this.mpdTarget);
    this.units.update(world, false);
    this.renderer.readRenderTargetPixels(this.mpdTarget, 0, 0, MPD_TADS, MPD_TADS, this.mpdPixels);
    if (!this.mpdCanvas) { this.mpdCanvas = document.createElement('canvas'); this.mpdCanvas.width = this.mpdCanvas.height = MPD_TADS; }
    const g = this.mpdCanvas.getContext('2d')!;
    const img = g.createImageData(MPD_TADS, MPD_TADS);
    const row = MPD_TADS * 4;
    for (let y = 0; y < MPD_TADS; y++) img.data.set(this.mpdPixels.subarray((MPD_TADS - 1 - y) * row, (MPD_TADS - y) * row), y * row);
    g.putImageData(img, 0, 0);
    this.instruments.tadsImage = this.mpdCanvas;
  }

  private renderTads(now: number, flir: boolean) {
    this.renderTadsInto(this.tads, now, flir, null);
  }

  private renderTadsInto(view: TadsView, now: number, flir: boolean, output: THREE.WebGLRenderTarget | null) {
    const { scene, sky, beam } = this.scene, world = this.opts.session.world;
    const fog = scene.fog as THREE.Fog, bg = scene.background;
    const saved = { near: fog.near, far: fog.far, color: fog.color.clone(), root: this.model.root.visible, beam: beam.visible, sky: sky.visible, shadow: this.scene.shadow.visible };
    this.model.root.visible = false;
    beam.visible = false;
    this.scene.shadow.visible = false;
    fog.near = 2500; fog.far = 9000;
    if (flir) { sky.visible = false; scene.background = this.black; fog.color.copy(this.flirFog); }
    view.aim(world.player, world.tads);
    sky.position.copy(view.camera.position);
    view.render(this.renderer, scene, world.tads, now * 0.001, output, world.player.damage.sensors <= DAMAGED ? 0.3 : 0.07);
    fog.near = saved.near; fog.far = saved.far; fog.color.copy(saved.color);
    scene.background = bg;
    this.model.root.visible = saved.root; beam.visible = saved.beam; sky.visible = saved.sky; this.scene.shadow.visible = saved.shadow;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.tads.dispose();
    this.mpdTads.dispose();
    this.mpdTarget.dispose();
    this.offEvents();
    this.effects.dispose();
    this.units.dispose();
    this.rings.dispose();
    window.removeEventListener('resize', this.resize);
    this.scene.dispose();
    this.instruments.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
