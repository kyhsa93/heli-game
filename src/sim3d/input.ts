import { clamp } from '../core/math';
import type { World } from '../sim/world';

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
  onEngine?: () => void;
  onView?: () => void;

  update(world: World, dt: number) {
    const k = this.keys, c = world.controls;
    const tx = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    const ty = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
    const ramp = Math.min(1, dt * 4);
    this.cx += (tx - this.cx) * ramp;
    this.cy += (ty - this.cy) * ramp;

    let cyclicX = this.cx + this.touch.rx, cyclicY = this.cy - this.touch.ry;
    let pedal = (k.has('KeyD') || k.has('KeyE') ? 1 : 0) - (k.has('KeyA') || k.has('KeyQ') ? 1 : 0) + this.touch.lx;
    const fine = k.has('ShiftLeft') || k.has('ShiftRight') ? 0.3 : 1;
    let collRate = ((k.has('KeyW') || k.has('PageUp') ? 1 : 0) - (k.has('KeyS') || k.has('PageDown') ? 1 : 0)) * 0.45 * fine;
    collRate += -this.touch.ly * 0.5;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && Array.from(pads).find(p => p && p.connected);
    if (gp) {
      pedal += dz(gp.axes[0] ?? 0);
      collRate += -dz(gp.axes[1] ?? 0) * 0.5;
      cyclicX += dz(gp.axes[2] ?? 0);
      cyclicY += -dz(gp.axes[3] ?? 0);
      const pressed = gp.buttons.map(b => b.pressed);
      if (pressed[0] && !this.padButtons[0]) this.onEngine?.();
      if (pressed[3] && !this.padButtons[3]) this.onView?.();
      this.padButtons = pressed;
    }

    c.cyclicX = clamp(cyclicX, -1, 1);
    c.cyclicY = clamp(cyclicY, -1, 1);
    c.pedal = clamp(pedal, -1, 1);
    c.collective = clamp(c.collective + collRate * dt, 0, 1);
  }

  look(dx: number, dy: number) {
    this.headYaw = clamp(this.headYaw - dx * 0.005, -2.2, 2.2);
    this.headPitch = clamp(this.headPitch - dy * 0.005, -1.1, 0.7);
  }

  centerView() { this.headYaw = 0; this.headPitch = -0.1; }
}
