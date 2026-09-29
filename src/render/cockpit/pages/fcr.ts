import { FCR_GROUND_HALF, FCR_RANGE, FCR_SCAN_SECONDS, isStale, type FcrTarget } from '../../../sim/sensors/fcr';
import type { World } from '../../../sim/world';
import { drawFcrSymbol, drawSelectBrackets, FCR_CLASS_TEXT } from '../../fcrSymbol';
import { AMBER, bezel, DIM, GREEN, MONO, screenClip } from './common';

export function fcrPlot(world: World, t: FcrTarget, cx: number, cy: number, R: number) {
  const h = world.player;
  const dx = t.pos.x - h.pos.x, dz = t.pos.z - h.pos.z;
  const fwd = -dx * Math.sin(h.yaw) - dz * Math.cos(h.yaw), right = dx * Math.cos(h.yaw) - dz * Math.sin(h.yaw);
  const k = R / FCR_RANGE;
  return { x: cx + right * k, y: cy - fwd * k };
}

export function fcrStatus(world: World) {
  const f = world.fcr;
  if (!f.unlocked) return 'FCR --';
  if (f.scanning) return `SCAN ${Math.round(f.scanT / FCR_SCAN_SECONDS * 100)}%`;
  return `TGT ${f.targets.length}`;
}

export function drawFcr(g: CanvasRenderingContext2D, world: World, labels: readonly string[], selected: number) {
  bezel(g, labels, selected);
  screenClip(g, () => {
    const f = world.fcr, air = f.mode === 'air';
    const cx = 256, cy = air ? 250 : 420, R = air ? 180 : 330;
    g.strokeStyle = DIM; g.lineWidth = 2; g.fillStyle = DIM;
    g.font = `bold 13px ${MONO}`; g.textAlign = 'center';
    const from = air ? 0 : -Math.PI / 2 - FCR_GROUND_HALF, to = air ? Math.PI * 2 : -Math.PI / 2 + FCR_GROUND_HALF;
    for (const k of [1, 0.5]) {
      g.beginPath();
      if (!air) g.moveTo(cx, cy);
      g.arc(cx, cy, R * k, from, to);
      if (!air) g.closePath();
      g.stroke();
    }
    g.textAlign = 'center';
    g.fillText('4', cx, cy - R * 0.5 + 18);
    g.fillText('8 KM', cx, cy - R + 18);
    g.fillStyle = GREEN;
    g.beginPath(); g.moveTo(cx, cy - 12); g.lineTo(cx - 8, cy + 10); g.lineTo(cx, cy + 5); g.lineTo(cx + 8, cy + 10); g.fill();
    if (f.scanning) {
      const p = f.scanT / FCR_SCAN_SECONDS;
      const a = air ? p * Math.PI * 2 - Math.PI / 2 : from + (to - from) * (Math.floor(p * 6) % 2 ? 1 - (p * 6 % 1) : p * 6 % 1);
      g.strokeStyle = GREEN; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
    }
    g.lineWidth = 2; g.font = `bold 12px ${MONO}`; g.textAlign = 'left';
    f.targets.forEach((t, i) => {
      const p = fcrPlot(world, t, cx, cy, R);
      const stale = isStale(t, world.time);
      g.strokeStyle = g.fillStyle = stale ? DIM : i === f.selected ? AMBER : GREEN;
      drawFcrSymbol(g, t.cls, p.x, p.y, 8);
      g.fillText(String(i + 1), p.x + 10, p.y - 6);
      if (i === f.selected) drawSelectBrackets(g, p.x, p.y, 14);
    });
    g.font = `bold 16px ${MONO}`; g.textAlign = 'left';
    g.fillStyle = f.unlocked ? GREEN : DIM;
    g.fillText(`FCR ${air ? 'AIR' : 'GND'}`, 64, 70);
    g.textAlign = 'right';
    g.fillStyle = f.scanning ? AMBER : GREEN;
    g.fillText(fcrStatus(world), 448, 70);
    const sel = f.targets[f.selected];
    if (sel) {
      const range = Math.hypot(sel.pos.x - world.player.pos.x, sel.pos.z - world.player.pos.z);
      g.textAlign = 'left'; g.fillStyle = isStale(sel, world.time) ? DIM : AMBER;
      g.fillText(`${f.selected + 1} ${FCR_CLASS_TEXT[sel.cls]} ${(range / 1000).toFixed(1)}K${sel.moving ? ' MOV' : ''}`, 64, 440 - 16);
    }
  });
}
