import { clamp } from '../core/math';
import type { World } from '../sim/world';
import { FLIGHT_KEYS, GAMEPAD_BUTTONS, KEY_COMMANDS, type Command } from './bindings';

export interface TouchSticks { lx: number; ly: number; rx: number; ry: number }

const DEAD = 0.12;
const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export class FlightInput {
  readonly keys = new Set<string>();
  readonly touch: TouchSticks = { lx: 0, ly: 0, rx: 0, ry: 0 };
  headYaw = 0;
  headPitch = -0.1;
  private cx = 0;
  private cy = 0;
  private padButtons: boolean[] = [];
  touchFire = false;

  held(cmd: Command) {
    for (const k of this.keys) if (KEY_COMMANDS[k] === cmd) return true;
    return false;
  }
  onCommand?: (cmd: Command) => void;

  private heldKeys(keys: readonly string[]) {
    return keys.some(k => this.keys.has(k));
  }

  update(world: World, dt: number) {
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

    let padFire = false;
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && Array.from(pads).find(p => p && p.connected);
    if (gp) {
      pedal += dz(gp.axes[0] ?? 0);
      collRate += -dz(gp.axes[1] ?? 0) * 0.5;
      cyclicX += dz(gp.axes[2] ?? 0);
      cyclicY += -dz(gp.axes[3] ?? 0);
      const pressed = gp.buttons.map(b => b.pressed);
      pressed.forEach((on, i) => {
        const cmd = GAMEPAD_BUTTONS[i];
        if (cmd && on && !this.padButtons[i]) this.onCommand?.(cmd);
      });
      this.padButtons = pressed;
      padFire = pressed[7] ?? false;
    }

    c.cyclicX = clamp(cyclicX, -1, 1);
    c.cyclicY = clamp(cyclicY, -1, 1);
    c.pedal = clamp(pedal, -1, 1);
    c.collective = clamp(c.collective + collRate * dt, 0, 1);
    world.commands.fire = this.held('fire') || this.touchFire || padFire;
    world.commands.aim.yaw = this.headYaw;
    world.commands.aim.pitch = this.headPitch;
  }

  look(dx: number, dy: number) {
    this.headYaw = clamp(this.headYaw - dx * 0.005, -2.2, 2.2);
    this.headPitch = clamp(this.headPitch - dy * 0.005, -1.1, 0.7);
  }

  centerView() { this.headYaw = 0; this.headPitch = -0.1; }
}
