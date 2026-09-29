import { clamp } from '../core/math';
import { count } from '../sim/heli/loadout';
import { TADS_FOV_NAMES, tadsFovDeg } from '../sim/sensors/tads';
import { gunInLimits } from '../sim/weapons/arms';
import type { World } from '../sim/world';
import { headingDeg } from './cockpit/instruments';

const WHITE = '#f4f4f4';
const pad3 = (n: number) => `${n < 0 ? '-' : ''}${String(Math.abs(Math.round(n))).padStart(3, '0')}`;

export function tadsWeaponStatus(world: World) {
  const a = world.arms;
  if (a.selected === 'hydra70') {
    const n = count(world.loadout, 'hydra70');
    return n > 0 ? `RKT ${n} x${a.salvo}` : 'RKT EMPTY';
  }
  if (a.gunAmmo <= 0) return 'GUN EMPTY';
  return `GUN ${a.gunAmmo}${gunInLimits(world.commands.aim) ? '' : ' LIMIT'}`;
}

export function drawTads(g: CanvasRenderingContext2D, w: number, h: number, world: World) {
  const t = world.tads;
  const u = clamp(Math.min(w, h) / 700, 0.6, 1.4);
  const cx = w / 2, cy = h / 2, m = 24 * u, top = m + 34 * u;
  g.save();
  g.strokeStyle = WHITE; g.fillStyle = WHITE; g.lineWidth = 2 * u;
  g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 3;
  g.font = `bold ${Math.round(17 * u)}px "B612 Mono", ui-monospace, Menlo, Consolas, monospace`;

  g.textAlign = 'left';
  g.fillText(`${t.sensor === 'flir' ? 'FLIR' : 'TV'}   ${TADS_FOV_NAMES[t.fov]} ${tadsFovDeg(t)}°`, m, top);
  g.textAlign = 'right';
  g.fillText(`AZ ${pad3(-t.az * 180 / Math.PI)}  EL ${pad3(t.el * 180 / Math.PI)}`, w - m, top);
  g.textAlign = 'center';
  g.fillText(`HDG ${String(Math.round(headingDeg(world.player.yaw)) % 360).padStart(3, '0')}`, cx, top);

  const gap = 10 * u, arm = 34 * u;
  g.beginPath();
  g.moveTo(cx - arm, cy); g.lineTo(cx - gap, cy); g.moveTo(cx + gap, cy); g.lineTo(cx + arm, cy);
  g.moveTo(cx, cy - arm); g.lineTo(cx, cy - gap); g.moveTo(cx, cy + gap); g.lineTo(cx, cy + arm);
  g.stroke();
  const bw = Math.min(w, h) * 0.3, bh = bw * 0.62, c = 16 * u;
  g.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = cx + sx * bw, y = cy + sy * bh;
    g.moveTo(x - sx * c, y); g.lineTo(x, y); g.lineTo(x, y - sy * c);
  }
  g.stroke();

  const azx = cx + (-t.az / (120 * Math.PI / 180)) * 90 * u, base = h - m - 60 * u;
  g.beginPath(); g.moveTo(cx - 90 * u, base); g.lineTo(cx + 90 * u, base); g.stroke();
  g.beginPath(); g.moveTo(cx, base - 5 * u); g.lineTo(cx, base + 5 * u); g.stroke();
  g.beginPath(); g.moveTo(azx, base - 9 * u); g.lineTo(azx - 5 * u, base - 17 * u); g.lineTo(azx + 5 * u, base - 17 * u); g.closePath(); g.fill();

  g.textAlign = 'left';
  g.fillText('RNG ----', m, h - m - 30 * u);
  g.fillText(world.hold ? 'HOLD' : '', m, h - m - 6 * u);
  g.textAlign = 'right';
  g.fillText(tadsWeaponStatus(world), w - m, h - m - 30 * u);
  g.restore();
}
