import { clamp } from '../../../core/math';
import type { World } from '../../../sim/world';

export const GREEN = '#46ff7a';
export const DIM = '#1f8a3e';
export const AMBER = '#ffb000';
export const FUEL_LB = 2500;
export const MONO = '"B612 Mono", "Karda Sans", monospace';

export function headingDeg(yaw: number) {
  return ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
}

export function bearingDeg(world: World): number | null {
  const tp = world.target, h = world.player;
  if (!tp) return null;
  return ((Math.atan2(tp.x - h.pos.x, -(tp.z - h.pos.z)) * 180 / Math.PI) + 360) % 360;
}

export function hoverVector(world: World) {
  const h = world.player;
  const fx = -Math.sin(h.yaw), fz = -Math.cos(h.yaw), rx = Math.cos(h.yaw), rz = -Math.sin(h.yaw);
  return { fwd: h.vel.x * fx + h.vel.z * fz, right: h.vel.x * rx + h.vel.z * rz };
}

export function bezel(g: CanvasRenderingContext2D, labels: readonly string[], selected: number) {
  g.fillStyle = '#1b1d20'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#26292d'; g.fillRect(6, 6, 500, 500);
  g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
  for (let i = 0; i < 6; i++) {
    const x = 86 + i * 68;
    for (const y of [10, 480]) {
      g.fillStyle = '#3a3e44'; g.fillRect(x - 22, y, 44, 22);
      g.fillStyle = '#c9ced4'; g.fillText(y < 100 ? `T${i + 1}` : `B${i + 1}`, x, y + 16);
    }
    for (const x2 of [10, 480]) {
      const y = 86 + i * 68;
      g.fillStyle = '#3a3e44'; g.fillRect(x2, y - 22, 22, 44);
    }
  }
  g.fillStyle = '#010a03'; g.fillRect(44, 44, 424, 424);
  g.font = 'bold 15px "B612 Mono", monospace';
  labels.forEach((l, i) => {
    const x = 86 + i * 68;
    g.fillStyle = i === selected ? '#010a03' : GREEN;
    if (i === selected) { g.fillStyle = GREEN; g.fillRect(x - 24, 448, 48, 18); g.fillStyle = '#010a03'; }
    g.fillText(l, x, 462);
  });
}

export function screenClip(g: CanvasRenderingContext2D, draw: () => void) {
  g.save();
  g.beginPath(); g.rect(44, 44, 424, 400); g.clip();
  g.shadowColor = GREEN; g.shadowBlur = 4;
  draw();
  g.restore();
}

export function box(g: CanvasRenderingContext2D, x: number, y: number, text: string) {
  g.strokeStyle = GREEN; g.lineWidth = 2;
  g.strokeRect(x - 38, y - 18, 76, 34);
  g.fillStyle = GREEN; g.font = 'bold 22px "B612 Mono", monospace'; g.textAlign = 'center';
  g.fillText(text, x, y + 8);
}

export function tape(g: CanvasRenderingContext2D, hdg: number, brg: number | null, cx: number, y: number, width: number) {
  const ppd = width / 60;
  g.strokeStyle = GREEN; g.fillStyle = GREEN; g.lineWidth = 2; g.textAlign = 'center';
  g.font = 'bold 14px "B612 Mono", monospace';
  for (let d = Math.ceil((hdg - 30) / 5) * 5; d <= hdg + 30; d += 5) {
    const x = cx + (d - hdg) * ppd, n = ((d % 360) + 360) % 360;
    const big = n % 10 === 0;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - (big ? 12 : 6)); g.stroke();
    if (n % 30 === 0) g.fillText(n % 90 === 0 ? 'NESW'[n / 90] : `${n / 10}`, x, y - 16);
  }
  g.strokeRect(cx - 26, y + 4, 52, 22);
  g.font = 'bold 16px "B612 Mono", monospace'; g.fillText(String(Math.round(hdg) % 360).padStart(3, '0'), cx, y + 21);
  if (brg === null) return;
  let db = brg - hdg; while (db > 180) db -= 360; while (db < -180) db += 360;
  const bx = cx + clamp(db, -30, 30) * ppd;
  g.fillStyle = AMBER;
  g.beginPath(); g.moveTo(bx, y + 2); g.lineTo(bx - 7, y + 14); g.lineTo(bx + 7, y + 14); g.fill();
}
