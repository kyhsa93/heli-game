import type { FcrClass } from '../sim/sensors/fcr';

export const FCR_CLASS_TEXT: Record<FcrClass, string> = { airDefense: 'ADU', tracked: 'TRK', wheeled: 'WHL', heli: 'HEL' };

export function drawFcrSymbol(g: CanvasRenderingContext2D, cls: FcrClass, x: number, y: number, r: number) {
  g.beginPath();
  if (cls === 'airDefense') { g.moveTo(x, y - r); g.lineTo(x + r, y + r * 0.8); g.lineTo(x - r, y + r * 0.8); g.closePath(); }
  else if (cls === 'tracked') g.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
  else if (cls === 'heli') { g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); }
  else g.arc(x, y, r * 0.8, 0, Math.PI * 2);
  g.stroke();
}

export function drawSelectBrackets(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const k = r * 0.5;
  g.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.moveTo(x + sx * r, y + sy * (r - k)); g.lineTo(x + sx * r, y + sy * r); g.lineTo(x + sx * (r - k), y + sy * r);
  }
  g.stroke();
}
