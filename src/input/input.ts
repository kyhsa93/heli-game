import { clamp } from '../core/math';
import { slewTads, type Tads } from '../sim/sensors/tads';
import type { World } from '../sim/world';
import { FLIGHT_KEYS, GAMEPAD_BUTTONS, KEY_COMMANDS, PAD_HEAD_LOOK, PAD_HEAD_RATE, type Command } from './bindings';
import { SOLDIER_KEYS } from './roles';

export interface PadLike { connected: boolean; axes: readonly number[]; buttons: readonly { pressed: boolean }[] }

export interface TouchSticks { lx: number; ly: number; rx: number; ry: number }

const DEAD = 0.12;
export const REST_PITCH = -0.05;
const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export class FlightInput {
  readonly keys = new Set<string>();
  readonly touch: TouchSticks = { lx: 0, ly: 0, rx: 0, ry: 0 };
  lookScale = 1;
  tadsScale = 1;
  invertY = false;
  headYaw = 0;
  headPitch = -0.1;
  private cx = 0;
  private cy = 0;
  private padButtons: boolean[] = [];
  touchFire = false;
  touchLaser = false;
  private tads: Tads | null = null;
  headLook = false;
  gamepads: () => readonly (PadLike | null)[] = () => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []);

  held(cmd: Command) {
    for (const k of this.keys) if (KEY_COMMANDS[k] === cmd) return true;
    return false;
  }
  onCommand?: (cmd: Command) => void;

  private heldKeys(keys: readonly string[]) {
    return keys.some(k => this.keys.has(k));
  }

  mouseFire = false;
  mouseAds = false;
  soldierYaw = 0;
  soldierPitch = 0;
  private role: 'heli' | 'soldier' | 'none' = 'heli';

  update(world: World, dt: number) {
    const kind = world.avatar.kind;
    if (kind === 'soldier') {
      if (this.role !== 'soldier' && world.soldier) { this.soldierYaw = world.soldier.yaw; this.soldierPitch = REST_PITCH; }
      this.role = 'soldier';
      this.updateSoldier(world);
      return;
    }
    this.role = kind === 'heli' ? 'heli' : 'none';
    const c = world.controls, K = FLIGHT_KEYS;
    const tx = (this.heldKeys(K.cyclicRight) ? 1 : 0) - (this.heldKeys(K.cyclicLeft) ? 1 : 0);
    const ty = (this.heldKeys(K.cyclicForward) ? 1 : 0) - (this.heldKeys(K.cyclicBack) ? 1 : 0);
    const ramp = Math.min(1, dt * 4);
    this.cx += (tx - this.cx) * ramp;
    this.cy += (ty - this.cy) * ramp;

    let cyclicX = this.cx + this.touch.rx, cyclicY = this.cy - this.touch.ry;
    let pedal = (this.heldKeys(K.pedalRight) ? 1 : 0) - (this.heldKeys(K.pedalLeft) ? 1 : 0) + this.touch.lx;
    const fine = this.heldKeys(K.fine) ? 0.3 : 1;
    let collRate = ((this.heldKeys(K.collectiveUp) ? 1 : 0) - (this.heldKeys(K.collectiveDown) ? 1 : 0)) * 0.45 * fine;
    collRate += -this.touch.ly * 0.5;

    let padFire = false, padLaser = false;
    const gp = Array.from(this.gamepads() ?? []).find(p => p && p.connected);
    if (gp) {
      pedal += dz(gp.axes[0] ?? 0);
      collRate += -dz(gp.axes[1] ?? 0) * 0.5;
      const pressed = gp.buttons.map(b => b.pressed);
      this.headLook = pressed[PAD_HEAD_LOOK] ?? false;
      const rx = dz(gp.axes[2] ?? 0), ry = dz(gp.axes[3] ?? 0);
      if (this.headLook) {
        const k = PAD_HEAD_RATE * dt * (this.tads?.active ? this.tadsScale * 0.6 : this.lookScale);
        const sy = this.invertY ? -ry : ry;
        if (this.tads?.active) slewTads(this.tads, -rx * k, -sy * k);
        else { this.headYaw = clamp(this.headYaw - rx * k, -2.2, 2.2); this.headPitch = clamp(this.headPitch - sy * k, -1.1, 0.7); }
      } else {
        cyclicX += rx;
        cyclicY += -ry;
      }
      pressed.forEach((on, i) => {
        const cmd = GAMEPAD_BUTTONS[i];
        if (cmd && on && !this.padButtons[i]) this.onCommand?.(cmd);
      });
      this.padButtons = pressed;
      padFire = pressed[7] ?? false;
      padLaser = pressed[6] ?? false;
    }

    c.cyclicX = clamp(cyclicX, -1, 1);
    c.cyclicY = clamp(cyclicY, -1, 1);
    c.pedal = clamp(pedal, -1, 1);
    c.collective = clamp(c.collective + collRate * dt, 0, 1);
    world.commands.fire = this.held('fire') || this.touchFire || padFire;
    world.commands.laser = this.held('laser') || this.touchLaser || padLaser;
    this.tads = world.tads;
    if (!world.tads.active) {
      world.commands.aim.yaw = this.headYaw;
      world.commands.aim.pitch = this.headPitch;
    }
  }

  private updateSoldier(world: World) {
    const k = SOLDIER_KEYS, c = world.soldierCommands;
    c.forward = clamp((this.heldKeys(k.forward) ? 1 : 0) - (this.heldKeys(k.back) ? 1 : 0) - this.touch.ly, -1, 1);
    c.right = clamp((this.heldKeys(k.right) ? 1 : 0) - (this.heldKeys(k.left) ? 1 : 0) + this.touch.lx, -1, 1);
    c.sprint = this.heldKeys(k.sprint) || Math.hypot(this.touch.lx, this.touch.ly) > 0.95;
    c.jump = this.heldKeys(k.jump);
    c.fire = this.mouseFire || this.touchFire;
    c.ads = this.mouseAds;
    c.yaw = this.soldierYaw;
    c.pitch = this.soldierPitch;
  }

  look(dx: number, dy: number) {
    const sy = this.invertY ? -dy : dy;
    if (this.role === 'soldier') {
      this.soldierYaw -= dx * 0.0035 * this.lookScale;
      this.soldierPitch = clamp(this.soldierPitch - sy * 0.0035 * this.lookScale, -1.4, 1.4);
      return;
    }
    if (this.tads?.active) { slewTads(this.tads, -dx * 0.004 * this.tadsScale, -sy * 0.004 * this.tadsScale); return; }
    this.headYaw = clamp(this.headYaw - dx * 0.005 * this.lookScale, -2.2, 2.2);
    this.headPitch = clamp(this.headPitch - sy * 0.005 * this.lookScale, -1.1, 0.7);
  }

  centerView() { this.headYaw = 0; this.headPitch = -0.1; }
}
