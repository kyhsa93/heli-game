import { MS_TO_KT } from '../../../core/units';
import { HALF, SIZE } from '../../../sim/terrain';
import type { World } from '../../../sim/world';
import { AMBER, bearingDeg, bezel, DIM, FUEL_LB, GREEN, headingDeg, screenClip, tape } from './common';

export function drawTsd(g: CanvasRenderingContext2D, world: World, relief: HTMLCanvasElement, labels: readonly string[], selected: number) {
  const h = world.player;
  bezel(g, labels, selected);
  const range = 2000, scale = 380 / range;
  const tp = world.target;
  screenClip(g, () => {
    const cx = 256, cy = 330;
    g.save();
    g.translate(cx, cy); g.rotate(h.yaw);
    g.globalAlpha = 0.55;
    g.drawImage(relief, (-HALF - h.pos.x) * scale, (-HALF - h.pos.z) * scale, SIZE * scale, SIZE * scale);
    g.globalAlpha = 1;
    const blink = Math.sin(world.time * 6) > 0;
    if (tp) {
      g.setLineDash([10, 8]); g.strokeStyle = AMBER; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo((tp.x - h.pos.x) * scale, (tp.z - h.pos.z) * scale); g.stroke();
      g.setLineDash([]);
    }
    for (const p of world.pads) {
      const x = (p.x - h.pos.x) * scale, y = (p.z - h.pos.z) * scale;
      const target = !!tp && Math.hypot(p.x - tp.x, p.z - tp.z) < 1;
      g.save(); g.translate(x, y); g.rotate(-h.yaw);
      g.strokeStyle = target ? AMBER : GREEN; g.fillStyle = g.strokeStyle; g.lineWidth = 2.5;
      if (p.base) { g.strokeRect(-9, -9, 18, 18); g.font = 'bold 13px "B612 Mono", monospace'; g.textAlign = 'center'; g.fillText('H', 0, 5); }
      else { g.beginPath(); g.arc(0, 0, target && blink ? 11 : 8, 0, Math.PI * 2); g.stroke(); }
      g.font = 'bold 15px "B612 Mono", monospace'; g.textAlign = 'left'; g.fillText(p.name, 13, -8);
      g.restore();
    }
    g.restore();

    g.strokeStyle = DIM; g.lineWidth = 1.5; g.setLineDash([4, 6]);
    g.beginPath(); g.arc(cx, cy, 1000 * scale, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.fillStyle = GREEN;
    g.beginPath(); g.moveTo(cx, cy - 16); g.lineTo(cx - 10, cy + 12); g.lineTo(cx, cy + 6); g.lineTo(cx + 10, cy + 12); g.fill();

    tape(g, headingDeg(h.yaw), bearingDeg(world), 256, 86, 300);
    g.font = 'bold 16px "B612 Mono", monospace'; g.textAlign = 'left'; g.fillStyle = AMBER;
    if (tp) {
      const d = Math.hypot(tp.x - h.pos.x, tp.z - h.pos.z);
      const gs = Math.hypot(h.vel.x, h.vel.z);
      const ete = gs > 2 ? `${Math.floor(d / gs / 60)}:${String(Math.round(d / gs % 60)).padStart(2, '0')}` : '--:--';
      g.fillText(`WPT ${tp.name}`, 72, 130);
      g.fillStyle = GREEN;
      g.fillText(`${(d / 1000).toFixed(2)} KM  ETE ${ete}`, 72, 152);
    } else g.fillText('NO WPT', 72, 130);
    g.textAlign = 'right'; g.fillStyle = DIM; g.font = '13px "B612 Mono", monospace';
    g.fillText('2 KM', 440, 130);
    g.textAlign = 'left'; g.font = 'bold 15px "B612 Mono", monospace'; g.fillStyle = h.fuel < 20 ? AMBER : GREEN;
    g.fillText(`FUEL ${Math.round(h.fuel / 100 * FUEL_LB)} LB`, 72, 424);
    g.textAlign = 'right'; g.fillStyle = GREEN;
    g.fillText(`WIND ${Math.round(world.wind.length() * MS_TO_KT)} KT`, 440, 424);
  });
}
