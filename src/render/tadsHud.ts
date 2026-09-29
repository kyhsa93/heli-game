import { t as tr } from '../content/strings';
import { clamp } from '../core/math';
import { count } from '../sim/heli/loadout';
import { TADS_FOV_NAMES, tadsFovDeg, tadsLocal } from '../sim/sensors/tads';
import { gunInLimits } from '../sim/weapons/arms';
import { hellfireSolution, type HellfireStatus } from '../sim/weapons/hellfire';
import type { World } from '../sim/world';
import { headingDeg } from './cockpit/instruments';

const WHITE = '#f4f4f4';
const pad3 = (n: number) => `${n < 0 ? '-' : ''}${String(Math.abs(Math.round(n))).padStart(3, '0')}`;

const HF_TEXT: Record<HellfireStatus, string> = { lobl: 'LOBL', loal: 'LOAL', range: 'RNG', align: 'ALN', empty: '', noTarget: '' };

export function missileTof(world: World) {
  let best: number | null = null;
  for (const m of world.missiles) {
    if (m.owner !== 0 || m.phase === 'lost') continue;
    const tof = m.pos.distanceTo(m.aim) / Math.max(1, m.vel.length());
    best = best === null ? tof : Math.min(best, tof);
  }
  return best;
}

export function tadsWeaponStatus(world: World) {
  const a = world.arms;
  if (a.selected === 'agm114k') {
    const n = count(world.loadout, 'agm114k');
    if (n <= 0) return 'MSL EMPTY';
    const tof = missileTof(world);
    return `MSL K ${n} ${HF_TEXT[hellfireSolution(world).status]}${tof !== null ? `  TOF ${Math.ceil(tof)}` : ''}`.trimEnd();
  }
  if (a.selected === 'hydra70') {
    const n = count(world.loadout, 'hydra70');
    return n > 0 ? `RKT ${n} x${a.salvo}` : 'RKT EMPTY';
  }
  if (a.gunAmmo <= 0) return 'GUN EMPTY';
  return `GUN ${a.gunAmmo}${gunInLimits(world.commands.aim) ? '' : ' LIMIT'}`;
}

export function drawTads(g: CanvasRenderingContext2D, w: number, h: number, world: World) {
  const t = world.tads, look = tadsLocal(world.player, t);
  const u = clamp(Math.min(w, h) / 700, 0.6, 1.4);
  const cx = w / 2, cy = h / 2, m = 24 * u, top = m + 34 * u;
  g.save();
  g.strokeStyle = WHITE; g.fillStyle = WHITE; g.lineWidth = 2 * u;
  g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 3;
  g.font = `bold ${Math.round(17 * u)}px "B612 Mono", "Karda Sans", ui-monospace, Menlo, Consolas, monospace`;

  g.textAlign = 'left';
  g.fillText(`${t.sensor === 'flir' ? 'FLIR' : 'TV'}   ${TADS_FOV_NAMES[t.fov]} ${tadsFovDeg(t)}°`, m, top);
  g.textAlign = 'right';
  g.fillText(`AZ ${pad3(-look.az * 180 / Math.PI)}  EL ${pad3(look.el * 180 / Math.PI)}`, w - m, top);
  g.textAlign = 'center';
  g.fillText(`HDG ${String(Math.round(headingDeg(world.player.yaw)) % 360).padStart(3, '0')}`, cx, top);

  const gap = 10 * u, arm = 34 * u;
  const lasing = world.laser.on;
  g.globalAlpha = lasing && Math.sin(world.time * 20) < 0 ? 0.35 : 1;
  g.beginPath();
  g.moveTo(cx - arm, cy); g.lineTo(cx - gap, cy); g.moveTo(cx + gap, cy); g.lineTo(cx + arm, cy);
  g.moveTo(cx, cy - arm); g.lineTo(cx, cy - gap); g.moveTo(cx, cy + gap); g.lineTo(cx, cy + arm);
  g.stroke();
  g.globalAlpha = 1;
  const bw = Math.min(w, h) * 0.3, bh = bw * 0.62, c = 16 * u;
  g.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = cx + sx * bw, y = cy + sy * bh;
    g.moveTo(x - sx * c, y); g.lineTo(x, y); g.lineTo(x, y - sy * c);
  }
  g.stroke();

  const azx = cx + (-look.az / (120 * Math.PI / 180)) * 90 * u, base = h - m - 60 * u;
  g.beginPath(); g.moveTo(cx - 90 * u, base); g.lineTo(cx + 90 * u, base); g.stroke();
  g.beginPath(); g.moveTo(cx, base - 5 * u); g.lineTo(cx, base + 5 * u); g.stroke();
  g.beginPath(); g.moveTo(azx, base - 9 * u); g.lineTo(azx - 5 * u, base - 17 * u); g.lineTo(azx + 5 * u, base - 17 * u); g.closePath(); g.fill();

  g.textAlign = 'left';
  const l = world.laser;
  g.fillText(`RNG ${l.range !== null ? Math.round(l.range).toLocaleString('en-US') : '----'}${lasing ? '  L' : ''}`, m, h - m - 54 * u);
  const idOf = world.identify.unitId ?? world.laser.unitId;
  const id = idOf !== null ? world.unit(idOf) : null;
  if (id) g.fillText(id.identified ? tr('tads.target', { name: tr(`units.${id.defId}`), side: tr(`sides.${id.side}`) }) : tr('tads.unknown'), m, h - m - 30 * u);
  g.fillText(world.hold ? 'HOLD' : '', m, h - m - 6 * u);
  g.textAlign = 'right';
  g.fillText(tadsWeaponStatus(world), w - m, h - m - 30 * u);
  g.restore();
}
