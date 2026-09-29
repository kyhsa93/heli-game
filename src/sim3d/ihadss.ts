import * as THREE from 'three';
import { clamp } from './math';
import { bearingDeg, headingDeg, hoverVector } from './instruments';
import { M_TO_FT, MS_TO_FPM, MS_TO_KT, type Sim } from './sim';

const GREEN = '#5dff6e';
const tmp = new THREE.Vector3();
const camPos = new THREE.Vector3();
const camDir = new THREE.Vector3();

function project(camera: THREE.Camera, p: THREE.Vector3, w: number, h: number) {
  tmp.copy(p).project(camera);
  if (tmp.z > 1 || tmp.z < -1) return null;
  return { x: (tmp.x + 1) / 2 * w, y: (1 - tmp.y) / 2 * h };
}

export function drawIhadss(g: CanvasRenderingContext2D, w: number, h: number, sim: Sim, camera: THREE.Camera) {
  const u = clamp(Math.min(w, h) / 700, 0.6, 1.4);
  const cx = w / 2, cy = h / 2;
  const heli = sim.heli;
  g.save();
  g.strokeStyle = GREEN; g.fillStyle = GREEN; g.lineWidth = 2 * u;
  g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 3;
  g.font = `bold ${Math.round(16 * u)}px ui-monospace, Menlo, Consolas, monospace`;
  g.textAlign = 'center';

  camera.getWorldPosition(camPos);
  camera.getWorldDirection(camDir);
  const az = Math.atan2(camDir.x, camDir.z);
  for (const e of [-20, -10, 0, 10, 20]) {
    const er = e * Math.PI / 180, span = (e === 0 ? 14 : 5) * Math.PI / 180;
    const pts = [az - span, az + span].map(a => project(camera, tmp.set(Math.sin(a) * Math.cos(er), Math.sin(er), Math.cos(a) * Math.cos(er)).multiplyScalar(1000).add(camPos).clone(), w, h));
    const [a, b] = pts;
    if (!a || !b) continue;
    g.setLineDash(e < 0 ? [8 * u, 6 * u] : []);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    if (e !== 0) g.fillText(`${Math.abs(e)}`, b.x + 16 * u, b.y + 5 * u);
  }
  g.setLineDash([]);

  g.beginPath();
  g.moveTo(cx - 14 * u, cy); g.lineTo(cx - 5 * u, cy); g.moveTo(cx + 5 * u, cy); g.lineTo(cx + 14 * u, cy);
  g.moveTo(cx, cy - 14 * u); g.lineTo(cx, cy - 5 * u); g.moveTo(cx, cy + 5 * u); g.lineTo(cx, cy + 14 * u);
  g.stroke();

  const hv = hoverVector(sim);
  const R = 70 * u, s = R / 5;
  g.globalAlpha = 0.45; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
  const vx = clamp(hv.right * s, -R, R), vy = clamp(-hv.fwd * s, -R, R);
  g.lineWidth = 3 * u;
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + vx, cy + vy); g.stroke();
  g.lineWidth = 2 * u;
  g.beginPath(); g.arc(cx + vx, cy + vy, 4 * u, 0, Math.PI * 2); g.fill();

  const hdg = headingDeg(heli.yaw), brg = bearingDeg(sim);
  const tw = 260 * u, ty = 40 * u, ppd = tw / 60;
  for (let d = Math.ceil((hdg - 30) / 5) * 5; d <= hdg + 30; d += 5) {
    const x = cx + (d - hdg) * ppd, n = ((d % 360) + 360) % 360;
    g.beginPath(); g.moveTo(x, ty); g.lineTo(x, ty - (n % 10 === 0 ? 10 : 5) * u); g.stroke();
    if (n % 30 === 0) g.fillText(n % 90 === 0 ? 'NESW'[n / 90] : `${n / 10}`, x, ty - 14 * u);
  }
  g.strokeRect(cx - 24 * u, ty + 4 * u, 48 * u, 22 * u);
  g.fillText(String(Math.round(hdg) % 360).padStart(3, '0'), cx, ty + 21 * u);
  let db = brg - hdg; while (db > 180) db -= 360; while (db < -180) db += 360;
  const bx = cx + clamp(db, -30, 30) * ppd;
  g.beginPath(); g.moveTo(bx, ty + 30 * u); g.lineTo(bx - 7 * u, ty + 42 * u); g.lineTo(bx + 7 * u, ty + 42 * u); g.closePath(); g.stroke();

  const kt = sim.airspeed() * MS_TO_KT;
  g.textAlign = 'right';
  g.fillText(`${Math.round(kt)}`, cx - 150 * u, cy + 6 * u);
  const agl = Math.max(0, sim.agl()) * M_TO_FT;
  g.textAlign = 'left';
  g.fillText(agl > 1428 ? '' : `${Math.round(agl)}`, cx + 150 * u, cy + 6 * u);
  g.fillText(`${Math.round(heli.pos.y * M_TO_FT)}`, cx + 150 * u, cy - 70 * u);
  const barX = cx + 132 * u, top = cy - 60 * u, bot = cy + 60 * u;
  g.beginPath(); g.moveTo(barX, top); g.lineTo(barX, bot); g.stroke();
  for (let i = 0; i <= 4; i++) { const y = bot - (bot - top) * i / 4; g.beginPath(); g.moveTo(barX, y); g.lineTo(barX + 5 * u, y); g.stroke(); }
  if (agl < 200) g.fillRect(barX - 5 * u, bot - (bot - top) * agl / 200, 5 * u, (bot - top) * agl / 200);
  const fpm = heli.vel.y * MS_TO_FPM;
  const vsy = cy - clamp(fpm / 1000, -1, 1) * 60 * u;
  g.beginPath(); g.moveTo(barX - 8 * u, vsy); g.lineTo(barX - 18 * u, vsy - 6 * u); g.lineTo(barX - 18 * u, vsy + 6 * u); g.closePath(); g.fill();

  g.textAlign = 'left';
  g.fillText(`${Math.round(heli.collective * heli.rpm * 100)}%`, cx - 190 * u, cy + 110 * u);
  g.textAlign = 'right';
  if (heli.rpm < 0.95) g.fillText(`NR ${Math.round(heli.rpm * 101)}%`, cx + 190 * u, cy + 110 * u);

  const tp = sim.targetPad();
  const sp = project(camera, tmp.set(tp.x, tp.y + 1, tp.z), w, h);
  if (sp && sp.x > 0 && sp.x < w && sp.y > 0 && sp.y < h) {
    const d = Math.hypot(tp.x - heli.pos.x, tp.z - heli.pos.z);
    const r = 10 * u;
    g.beginPath(); g.moveTo(sp.x, sp.y - r); g.lineTo(sp.x + r, sp.y); g.lineTo(sp.x, sp.y + r); g.lineTo(sp.x - r, sp.y); g.closePath(); g.stroke();
    g.textAlign = 'center';
    g.fillText(`${tp.name} ${d > 999 ? (d / 1000).toFixed(1) + 'K' : Math.round(d)}`, sp.x, sp.y - r - 6 * u);
  }

  g.textAlign = 'center';
  const warns: string[] = [];
  if (!heli.engineOn && heli.alive && sim.mode === 'play' && !heli.landed) warns.push('ENGINE OUT');
  if (heli.rpm < 0.85 && !heli.landed) warns.push('LOW ROTOR RPM');
  if (heli.fuel < 10) warns.push('FUEL LOW');
  if (warns.length && Math.sin(sim.time * 8) > 0) g.fillText(warns.join('  '), cx, cy + 150 * u);
  g.restore();
}
