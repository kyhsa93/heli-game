import * as THREE from 'three';
import type { GameAudio } from '../audio/game';
import { clamp } from '../core/math';
import { BLADES, EYE, ROTOR_HZ } from '../sim/heli/airframe';
import { agl as aglOf, airspeed } from '../sim/heli/state';
import type { FlightSession } from '../sim/session';
import { STEP } from '../sim/world';
import type { FlightInput } from '../input/input';
import { Instruments } from './cockpit/instruments';
import { applyLoadout, buildHeli, type HeliModel } from './heliModel';
import { assets } from '../assets/loader';
import { UNITS_GROUP } from '../assets/manifest';
import { Effects, fallbackAtlas } from './effects';
import { UnitRenderer } from './unitRenderer';
import { drawIhadss } from './ihadss';
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
  private unitAssetsRequested = false;
  private offEvents: () => void;

  constructor(private opts: RendererOptions) {
    const { mount, overlay, session } = opts;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(this.renderer.domElement);

    this.scene = buildWorld(session.world.terrain);
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
    this.offEvents = session.world.events.onAny(e => {
      this.effects.onEvent(e, session.world);
      if (this.audio) this.audio.onEvent(e, this.camera.getWorldPosition(this.listener));
    });

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
      const vib = h.rpm * (0.0012 + speed * 0.00003) * (h.landed ? 0.5 : 1);
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
    (scn.sky.material as THREE.ShaderMaterial).uniforms.time.value = now * 0.001;

    if (world.units.length && !this.unitAssetsRequested) this.loadUnitModels();
    this.units.update(world);
    this.effects.update(steps * STEP, world);
    this.instruments.draw(world, this.frame++ % 3);
    this.renderer.render(scn.scene, camera);

    const og = this.overlayCtx;
    og.clearRect(0, 0, overlay.width, overlay.height);
    if (cockpit && this.hud && h.alive && session.mode !== 'brief') drawIhadss(og, mount.clientWidth, mount.clientHeight, world, camera);

    this.audio?.update({
      rpm: h.alive ? h.rpm : 0, collective: h.collective, airspeed: speed,
      warn: h.alive && session.mode === 'play' && ((h.rpm < 0.85 && !h.landed) || h.fuel < 10),
    });

    this.opts.onFrame?.({ simDt: steps * STEP, cockpit, agl });
    this.raf = requestAnimationFrame(this.tick);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.offEvents();
    this.effects.dispose();
    this.units.dispose();
    window.removeEventListener('resize', this.resize);
    this.scene.dispose();
    this.instruments.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
