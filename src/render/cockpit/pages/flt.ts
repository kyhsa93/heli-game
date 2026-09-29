import { clamp } from '../../../core/math';
import { M_TO_FT, MS_TO_FPM, MS_TO_KT } from '../../../core/units';
import { agl as aglOf, airspeed } from '../../../sim/heli/state';
import type { World } from '../../../sim/world';
import { AMBER, bearingDeg, bezel, box, DIM, GREEN, headingDeg, hoverVector, screenClip, tape } from './common';

export function drawFlt(g: CanvasRenderingContext2D, world: World, labels: readonly string[], selected: number) {
  const h = world.player;
  bezel(g, labels, selected);
  screenClip(g, () => {
    const cx = 256, cy = 250;
    g.save();
    g.translate(cx, cy); g.rotate(-h.roll);
    const ppd = 5;
    const off = h.pitch * 180 / Math.PI * ppd;
    g.strokeStyle = GREEN; g.fillStyle = GREEN; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(-170, off); g.lineTo(-40, off); g.moveTo(40, off); g.lineTo(170, off); g.stroke();
    g.font = 'bold 15px "B612 Mono", monospace'; g.textAlign = 'left'; g.lineWidth = 2;
    for (let d = -30; d <= 30; d += 10) {
      if (!d) continue;
      const y = off - d * ppd;
      if (Math.abs(y) > 140) continue;
      g.setLineDash(d < 0 ? [8, 6] : []);
      g.beginPath(); g.moveTo(-70, y); g.lineTo(-30, y); g.moveTo(30, y); g.lineTo(70, y); g.stroke();
      g.setLineDash([]);
      g.fillText(`${Math.abs(d)}`, 76, y + 5);
    }
    g.restore();

    g.strokeStyle = GREEN; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - 34, cy); g.lineTo(cx - 12, cy); g.lineTo(cx, cy + 10); g.lineTo(cx + 12, cy); g.lineTo(cx + 34, cy); g.stroke();

    const hv = hoverVector(world);
    const vs = 6;
    g.strokeStyle = GREEN; g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, 60, 0, Math.PI * 2); g.globalAlpha = 0.35; g.stroke(); g.globalAlpha = 1;
    const vx = clamp(hv.right * vs, -60, 60), vy = clamp(-hv.fwd * vs, -60, 60);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + vx, cy + vy); g.stroke();
    g.beginPath(); g.arc(cx + vx, cy + vy, 4, 0, Math.PI * 2); g.fill();

    tape(g, headingDeg(h.yaw), bearingDeg(world), 256, 86, 300);

    const kt = airspeed(world.player, world.wind) * MS_TO_KT;
    box(g, 88, 250, `${Math.round(kt)}`);
    g.font = '13px "B612 Mono", monospace'; g.fillStyle = DIM; g.textAlign = 'center'; g.fillText('KTS', 88, 282);
    const agl = Math.max(0, aglOf(world.player, world.terrain)) * M_TO_FT;
    box(g, 424, 250, agl > 1428 ? '---' : `${Math.round(agl)}`);
    g.font = '13px "B612 Mono", monospace'; g.fillStyle = DIM; g.fillText('R ALT', 424, 282);
    g.fillStyle = GREEN; g.font = 'bold 16px "B612 Mono", monospace';
    g.fillText(`${Math.round(h.pos.y * M_TO_FT)}`, 424, 215);

    g.strokeStyle = DIM; g.lineWidth = 2;
    g.beginPath(); g.moveTo(452, 140); g.lineTo(452, 360); g.stroke();
    const bar = clamp(agl / 200, 0, 1) * 220;
    g.fillStyle = GREEN; g.fillRect(447, 360 - bar, 10, bar);
    const fpm = h.vel.y * MS_TO_FPM;
    const vsy = 250 - clamp(fpm / 1000, -1, 1) * 100;
    g.beginPath(); g.moveTo(462, vsy); g.lineTo(474, vsy - 7); g.lineTo(474, vsy + 7); g.fill();

    g.textAlign = 'left'; g.font = 'bold 20px "B612 Mono", monospace'; g.fillStyle = GREEN;
    g.fillText(`${Math.round(h.collective * h.rpm * 100)}%`, 72, 400);
    g.font = '13px "B612 Mono", monospace'; g.fillStyle = DIM; g.fillText('TQ', 72, 418);
    g.textAlign = 'right'; g.font = 'bold 20px "B612 Mono", monospace'; g.fillStyle = h.rpm < 0.9 ? AMBER : GREEN;
    g.fillText(`${Math.round(h.rpm * 101)}%`, 440, 400);
    g.font = '13px "B612 Mono", monospace'; g.fillStyle = DIM; g.fillText('NR', 440, 418);
    g.textAlign = 'center'; g.font = 'bold 16px "B612 Mono", monospace'; g.fillStyle = GREEN;
    g.fillText(`${Math.round(fpm / 10) * 10} FPM`, 256, 418);
  });
}
