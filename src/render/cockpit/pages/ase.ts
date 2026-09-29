import { aseThreats, type Threat } from '../../../sim/sensors/ase';
import type { World } from '../../../sim/world';
import { AMBER, bezel, DIM, GREEN, MONO, screenClip } from './common';

export const ASE_RANGE = 10000;

export function drawThreatSymbol(g: CanvasRenderingContext2D, t: Threat, x: number, y: number, size: number, blink: boolean) {
  const loud = t.state !== 'search';
  if (loud && !blink && t.state !== 'missile') return;
  g.fillStyle = t.state === 'search' ? DIM : t.state === 'track' ? GREEN : AMBER;
  g.strokeStyle = g.fillStyle;
  g.font = `bold ${Math.round(size * (loud ? 1.3 : 1))}px ${MONO}`;
  g.textAlign = 'center';
  g.fillText(t.symbol, x, y + size * 0.4);
  if (t.state === 'launch' || t.state === 'missile') {
    g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, size * 0.95, 0, Math.PI * 2); g.stroke();
  }
}

export function drawAse(g: CanvasRenderingContext2D, world: World, labels: readonly string[], selected: number) {
  bezel(g, labels, selected);
  screenClip(g, () => {
    const cx = 256, cy = 250, R = 170;
    g.strokeStyle = DIM; g.lineWidth = 2;
    for (const f of [1, 0.5]) { g.beginPath(); g.arc(cx, cy, R * f, 0, Math.PI * 2); g.stroke(); }
    g.font = `bold 13px ${MONO}`; g.fillStyle = DIM; g.textAlign = 'center';
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      g.beginPath(); g.moveTo(cx + Math.sin(a) * (R - 8), cy - Math.cos(a) * (R - 8)); g.lineTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R); g.stroke();
    }
    g.fillStyle = GREEN;
    g.beginPath(); g.moveTo(cx, cy - 12); g.lineTo(cx - 8, cy + 10); g.lineTo(cx, cy + 5); g.lineTo(cx + 8, cy + 10); g.fill();
    const blink = Math.sin(world.time * 10) > 0;
    for (const t of aseThreats(world)) {
      const r = Math.min(1, t.range / ASE_RANGE) * R;
      drawThreatSymbol(g, t, cx - Math.sin(t.bearing) * r, cy - Math.cos(t.bearing) * r, 18, blink);
    }
    const cm = world.cm;
    g.textAlign = 'left'; g.font = `bold 16px ${MONO}`; g.fillStyle = cm.flares ? GREEN : AMBER;
    g.fillText(`FLR ${cm.flares}`, 64, 440 - 16);
    g.fillStyle = !cm.chaffUnlocked ? DIM : cm.chaff ? GREEN : AMBER;
    g.fillText(`CHF ${cm.chaffUnlocked ? cm.chaff : '--'}`, 164, 440 - 16);
    g.textAlign = 'right'; g.fillStyle = world.assists.autoCountermeasures ? GREEN : DIM;
    g.fillText(world.assists.autoCountermeasures ? 'AUTO' : 'MAN', 448, 424);
    g.fillStyle = DIM; g.font = `13px ${MONO}`;
    g.fillText('10 KM', 448, 70);
  });
}
