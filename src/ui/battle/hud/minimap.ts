import type { Terrain } from '../../../sim/terrain';

export const SHADE_SIZE = 256;

export function shadeTerrain(t: Terrain, size = SHADE_SIZE) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const cell = t.size / size;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = -t.half + (i + 0.5) * cell, z = -t.half + (j + 0.5) * cell;
    const h = t.heightAt(x, z), k = (j * size + i) * 4;
    let r: number, gr: number, b: number;
    if (h < 0.5) { r = 40; gr = 72; b = 110; }
    else {
      const n = t.normalAt(x, z);
      const s = Math.max(0.35, Math.min(1, 0.55 + 0.6 * (n.x * -0.5 + n.y * 0.7 + n.z * -0.5)));
      const forest = t.forest(x, z) >= 0.5;
      r = (forest ? 52 : 110) * s; gr = (forest ? 80 : 118) * s; b = (forest ? 48 : 84) * s;
    }
    img.data[k] = r; img.data[k + 1] = gr; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(210, 185, 130, .8)';
  g.lineWidth = 1;
  for (const road of t.roads) {
    g.beginPath();
    road.forEach(([x, z], i) => { const px = (x + t.half) / cell, pz = (z + t.half) / cell; if (i) g.lineTo(px, pz); else g.moveTo(px, pz); });
    g.stroke();
  }
  return c;
}
