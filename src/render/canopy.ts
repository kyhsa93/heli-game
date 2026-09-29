const CRACKS: [number, number, number][] = [
  [0.18, 0.3, 7], [0.82, 0.22, 6], [0.3, 0.78, 5], [0.7, 0.7, 6], [0.5, 0.15, 4],
];

function rand(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export function drawCanopyCracks(g: CanvasRenderingContext2D, w: number, h: number, severity: number) {
  const n = Math.max(1, Math.ceil(CRACKS.length * Math.min(1, severity + 0.2)));
  g.save();
  g.strokeStyle = 'rgba(235, 245, 255, 0.55)';
  g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 2;
  const scale = Math.min(w, h);
  for (let i = 0; i < n; i++) {
    const [cx, cy, arms] = CRACKS[i];
    const r = rand(1234 + i * 97);
    const x0 = cx * w, y0 = cy * h;
    for (let a = 0; a < arms; a++) {
      let x = x0, y = y0, ang = (a / arms) * Math.PI * 2 + r() * 0.6;
      g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x, y);
      const len = scale * (0.05 + r() * 0.12) * (0.6 + severity);
      for (let s = 0; s < 6; s++) {
        ang += (r() - 0.5) * 0.7;
        x += Math.cos(ang) * len / 6; y += Math.sin(ang) * len / 6;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.lineWidth = 1;
    g.beginPath(); g.arc(x0, y0, scale * 0.012, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}
