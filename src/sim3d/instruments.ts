import * as THREE from 'three';
import { clamp } from './math';
import { M_TO_FT, MS_TO_FPM, MS_TO_KT, type Sim } from './sim';
import { HALF, N, SIZE } from './terrain';

const GREEN = '#46ff7a';
const DIM = '#1f8a3e';
const AMBER = '#ffb000';
const FUEL_LB = 2500;

interface Surface { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture }

function surface(w: number, h: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { canvas, ctx: canvas.getContext('2d')!, texture };
}

export function headingDeg(yaw: number) {
  return ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
}

export function bearingDeg(sim: Sim) {
  const tp = sim.targetPad(), h = sim.heli;
  return ((Math.atan2(tp.x - h.pos.x, -(tp.z - h.pos.z)) * 180 / Math.PI) + 360) % 360;
}

export function hoverVector(sim: Sim) {
  const h = sim.heli;
  const fx = -Math.sin(h.yaw), fz = -Math.cos(h.yaw), rx = Math.cos(h.yaw), rz = -Math.sin(h.yaw);
  return { fwd: h.vel.x * fx + h.vel.z * fz, right: h.vel.x * rx + h.vel.z * rz };
}

export class Instruments {
  readonly mpdL = surface(512, 512);
  readonly mpdR = surface(512, 512);
  readonly eufd = surface(512, 288);
  readonly standby = surface(384, 504);
  private relief: HTMLCanvasElement;

  constructor(sim: Sim) {
    this.relief = reliefMap(sim);
  }

  textures() {
    return { mpdL: this.mpdL.texture, mpdR: this.mpdR.texture, eufd: this.eufd.texture, standby: this.standby.texture };
  }

  dispose() {
    for (const s of [this.mpdL, this.mpdR, this.eufd, this.standby]) s.texture.dispose();
  }

  draw(sim: Sim, part: number) {
    if (part === 0) { this.flt(sim); this.mpdL.texture.needsUpdate = true; }
    if (part === 1) { this.tsd(sim); this.mpdR.texture.needsUpdate = true; }
    if (part === 2) {
      this.drawEufd(sim); this.eufd.texture.needsUpdate = true;
      this.drawStandby(sim); this.standby.texture.needsUpdate = true;
    }
  }

  private flt(sim: Sim) {
    const g = this.mpdL.ctx, h = sim.heli;
    bezel(g, ['FLT', 'FUEL', 'ENG', 'WPN', 'TSD', 'COM'], 0);
    screenClip(g, () => {
      const cx = 256, cy = 250;
      g.save();
      g.translate(cx, cy); g.rotate(-h.roll);
      const ppd = 5;
      const off = h.pitch * 180 / Math.PI * ppd;
      g.strokeStyle = GREEN; g.fillStyle = GREEN; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(-170, off); g.lineTo(-40, off); g.moveTo(40, off); g.lineTo(170, off); g.stroke();
      g.font = 'bold 15px monospace'; g.textAlign = 'left'; g.lineWidth = 2;
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

      const hv = hoverVector(sim);
      const vs = 6;
      g.strokeStyle = GREEN; g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy, 60, 0, Math.PI * 2); g.globalAlpha = 0.35; g.stroke(); g.globalAlpha = 1;
      const vx = clamp(hv.right * vs, -60, 60), vy = clamp(-hv.fwd * vs, -60, 60);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + vx, cy + vy); g.stroke();
      g.beginPath(); g.arc(cx + vx, cy + vy, 4, 0, Math.PI * 2); g.fill();

      tape(g, headingDeg(h.yaw), bearingDeg(sim), 256, 86, 300);

      const kt = sim.airspeed() * MS_TO_KT;
      box(g, 88, 250, `${Math.round(kt)}`);
      g.font = '13px monospace'; g.fillStyle = DIM; g.textAlign = 'center'; g.fillText('KTS', 88, 282);
      const agl = Math.max(0, sim.agl()) * M_TO_FT;
      box(g, 424, 250, agl > 1428 ? '---' : `${Math.round(agl)}`);
      g.font = '13px monospace'; g.fillStyle = DIM; g.fillText('R ALT', 424, 282);
      g.fillStyle = GREEN; g.font = 'bold 16px monospace';
      g.fillText(`${Math.round(h.pos.y * M_TO_FT)}`, 424, 215);

      g.strokeStyle = DIM; g.lineWidth = 2;
      g.beginPath(); g.moveTo(452, 140); g.lineTo(452, 360); g.stroke();
      const bar = clamp(agl / 200, 0, 1) * 220;
      g.fillStyle = GREEN; g.fillRect(447, 360 - bar, 10, bar);
      const fpm = h.vel.y * MS_TO_FPM;
      const vsy = 250 - clamp(fpm / 1000, -1, 1) * 100;
      g.beginPath(); g.moveTo(462, vsy); g.lineTo(474, vsy - 7); g.lineTo(474, vsy + 7); g.fill();

      g.textAlign = 'left'; g.font = 'bold 20px monospace'; g.fillStyle = GREEN;
      g.fillText(`${Math.round(h.collective * h.rpm * 100)}%`, 72, 400);
      g.font = '13px monospace'; g.fillStyle = DIM; g.fillText('TQ', 72, 418);
      g.textAlign = 'right'; g.font = 'bold 20px monospace'; g.fillStyle = h.rpm < 0.9 ? AMBER : GREEN;
      g.fillText(`${Math.round(h.rpm * 101)}%`, 440, 400);
      g.font = '13px monospace'; g.fillStyle = DIM; g.fillText('NR', 440, 418);
      g.textAlign = 'center'; g.font = 'bold 16px monospace'; g.fillStyle = GREEN;
      g.fillText(`${Math.round(fpm / 10) * 10} FPM`, 256, 418);
    });
  }

  private tsd(sim: Sim) {
    const g = this.mpdR.ctx, h = sim.heli;
    bezel(g, ['TSD', 'MAP', 'PAN', 'RTE', 'FLT', 'ENG'], 0);
    const range = 2000, scale = 380 / range;
    const tp = sim.targetPad();
    screenClip(g, () => {
      const cx = 256, cy = 330;
      g.save();
      g.translate(cx, cy); g.rotate(h.yaw);
      g.globalAlpha = 0.55;
      g.drawImage(this.relief, (-HALF - h.pos.x) * scale, (-HALF - h.pos.z) * scale, SIZE * scale, SIZE * scale);
      g.globalAlpha = 1;
      const blink = Math.sin(sim.time * 6) > 0;
      g.setLineDash([10, 8]); g.strokeStyle = AMBER; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo((tp.x - h.pos.x) * scale, (tp.z - h.pos.z) * scale); g.stroke();
      g.setLineDash([]);
      for (const p of sim.pads) {
        const x = (p.x - h.pos.x) * scale, y = (p.z - h.pos.z) * scale;
        const target = p === tp;
        g.save(); g.translate(x, y); g.rotate(-h.yaw);
        g.strokeStyle = target ? AMBER : GREEN; g.fillStyle = g.strokeStyle; g.lineWidth = 2.5;
        if (p.base) { g.strokeRect(-9, -9, 18, 18); g.font = 'bold 13px monospace'; g.textAlign = 'center'; g.fillText('H', 0, 5); }
        else { g.beginPath(); g.arc(0, 0, target && blink ? 11 : 8, 0, Math.PI * 2); g.stroke(); }
        g.font = 'bold 15px monospace'; g.textAlign = 'left'; g.fillText(p.name, 13, -8);
        g.restore();
      }
      g.restore();

      g.strokeStyle = DIM; g.lineWidth = 1.5; g.setLineDash([4, 6]);
      g.beginPath(); g.arc(cx, cy, 1000 * scale, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.fillStyle = GREEN;
      g.beginPath(); g.moveTo(cx, cy - 16); g.lineTo(cx - 10, cy + 12); g.lineTo(cx, cy + 6); g.lineTo(cx + 10, cy + 12); g.fill();

      tape(g, headingDeg(h.yaw), bearingDeg(sim), 256, 86, 300);
      const d = Math.hypot(tp.x - h.pos.x, tp.z - h.pos.z);
      const gs = Math.hypot(h.vel.x, h.vel.z);
      const ete = gs > 2 ? `${Math.floor(d / gs / 60)}:${String(Math.round(d / gs % 60)).padStart(2, '0')}` : '--:--';
      g.font = 'bold 16px monospace'; g.textAlign = 'left'; g.fillStyle = AMBER;
      g.fillText(`${sim.mission.stage === 'pickup' ? 'PICKUP' : 'DELIVER'} ${tp.name}`, 72, 130);
      g.fillStyle = GREEN;
      g.fillText(`${(d / 1000).toFixed(2)} KM  ETE ${ete}`, 72, 152);
      g.textAlign = 'right'; g.fillStyle = DIM; g.font = '13px monospace';
      g.fillText('2 KM', 440, 130);
      g.textAlign = 'left'; g.font = 'bold 15px monospace'; g.fillStyle = h.fuel < 20 ? AMBER : GREEN;
      g.fillText(`FUEL ${Math.round(h.fuel / 100 * FUEL_LB)} LB`, 72, 424);
      g.textAlign = 'right'; g.fillStyle = GREEN;
      g.fillText(`WIND ${Math.round(sim.wind.length() * MS_TO_KT)} KT`, 440, 424);
    });
  }

  private drawEufd(sim: Sim) {
    const g = this.eufd.ctx, h = sim.heli, W = 512, H = 288;
    g.fillStyle = '#050403'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#3a2a00'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(250, 12); g.lineTo(250, H - 12); g.stroke();
    g.font = 'bold 26px monospace'; g.textAlign = 'left';
    const warn: string[] = [];
    if (!h.engineOn && sim.mode === 'play' && h.alive) warn.push('ENGINE OUT');
    if (h.rpm < 0.9 && !h.landed) warn.push('LOW ROTOR RPM');
    if (h.fuel < 20) warn.push('FUEL LOW');
    if (sim.mission.stage === 'deliver') warn.push('CARGO LOADED');
    if (sim.mission.timer > 0) warn.push(sim.mission.stage === 'pickup' ? 'LOADING' : 'UNLOADING');
    const blink = Math.sin(sim.time * 7) > 0;
    warn.slice(0, 6).forEach((w, i) => {
      const caution = w === 'ENGINE OUT' || w === 'LOW ROTOR RPM';
      g.fillStyle = caution && blink ? '#ff5a3a' : AMBER;
      g.fillText(w, 16, 40 + i * 40);
    });
    if (!warn.length) { g.fillStyle = '#6b4a00'; g.fillText('NO FAULTS', 16, 40); }
    g.fillStyle = AMBER;
    const t = new Date(sim.time * 1000);
    g.fillText(`FUEL ${Math.round(h.fuel / 100 * FUEL_LB)}`, 266, 40);
    g.fillText(`NR   ${Math.round(h.rpm * 101)}%`, 266, 80);
    g.fillText(`TQ   ${Math.round(h.collective * h.rpm * 100)}%`, 266, 120);
    g.fillText(`VHF 127.000`, 266, 190);
    g.fillText(`T+ ${String(t.getUTCMinutes()).padStart(2, '0')}:${String(t.getUTCSeconds()).padStart(2, '0')}`, 266, 240);
  }

  private drawStandby(sim: Sim) {
    const g = this.standby.ctx, h = sim.heli;
    g.fillStyle = '#16181b'; g.fillRect(0, 0, 384, 504);
    const r = 70;
    const kt = sim.airspeed() * MS_TO_KT;
    smallDial(g, 96, 96, r, 'KTS', kt / 200 * Math.PI * 1.6 - Math.PI * 0.8, [0, 40, 80, 120, 160, 200]);
    smallDial(g, 288, 96, r, 'ALT', (h.pos.y * M_TO_FT / 1000) * Math.PI * 2, [0, 2, 4, 6, 8], true);
    const cx = 192, cy = 300, R = 110;
    g.fillStyle = '#0a0a0a'; g.beginPath(); g.arc(cx, cy, R + 8, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
    g.translate(cx, cy); g.rotate(-h.roll);
    const off = h.pitch * 180 / Math.PI * 3.5;
    g.fillStyle = '#2f6fb0'; g.fillRect(-R * 2, -R * 2 + off, R * 4, R * 2);
    g.fillStyle = '#5a3a1e'; g.fillRect(-R * 2, off, R * 4, R * 2);
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(-R * 2, off); g.lineTo(R * 2, off); g.stroke();
    g.lineWidth = 2;
    for (const d of [-20, -10, 10, 20]) { const y = off - d * 3.5, w = Math.abs(d) === 10 ? 22 : 36; g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.stroke(); }
    g.restore();
    g.strokeStyle = '#ffb000'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(cx - 60, cy); g.lineTo(cx - 18, cy); g.moveTo(cx + 18, cy); g.lineTo(cx + 60, cy); g.stroke();
    g.fillStyle = '#ffb000'; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8a9099'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.fillText('STBY ATT', cx, 480);
  }
}

function bezel(g: CanvasRenderingContext2D, labels: string[], selected: number) {
  g.fillStyle = '#1b1d20'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#26292d'; g.fillRect(6, 6, 500, 500);
  g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
  for (let i = 0; i < 6; i++) {
    const x = 86 + i * 68;
    for (const y of [10, 480]) {
      g.fillStyle = '#3a3e44'; g.fillRect(x - 22, y, 44, 22);
      g.fillStyle = '#c9ced4'; g.fillText(y < 100 ? `T${i + 1}` : `B${i + 1}`, x, y + 16);
    }
    for (const x2 of [10, 480]) {
      const y = 86 + i * 68;
      g.fillStyle = '#3a3e44'; g.fillRect(x2, y - 22, 22, 44);
    }
  }
  g.fillStyle = '#010a03'; g.fillRect(44, 44, 424, 424);
  g.font = 'bold 15px monospace';
  labels.forEach((l, i) => {
    const x = 86 + i * 68;
    g.fillStyle = i === selected ? '#010a03' : GREEN;
    if (i === selected) { g.fillStyle = GREEN; g.fillRect(x - 24, 448, 48, 18); g.fillStyle = '#010a03'; }
    g.fillText(l, x, 462);
  });
}

function screenClip(g: CanvasRenderingContext2D, draw: () => void) {
  g.save();
  g.beginPath(); g.rect(44, 44, 424, 400); g.clip();
  g.shadowColor = GREEN; g.shadowBlur = 4;
  draw();
  g.restore();
}

function box(g: CanvasRenderingContext2D, x: number, y: number, text: string) {
  g.strokeStyle = GREEN; g.lineWidth = 2;
  g.strokeRect(x - 38, y - 18, 76, 34);
  g.fillStyle = GREEN; g.font = 'bold 22px monospace'; g.textAlign = 'center';
  g.fillText(text, x, y + 8);
}

function tape(g: CanvasRenderingContext2D, hdg: number, brg: number, cx: number, y: number, width: number) {
  const ppd = width / 60;
  g.strokeStyle = GREEN; g.fillStyle = GREEN; g.lineWidth = 2; g.textAlign = 'center';
  g.font = 'bold 14px monospace';
  for (let d = Math.ceil((hdg - 30) / 5) * 5; d <= hdg + 30; d += 5) {
    const x = cx + (d - hdg) * ppd, n = ((d % 360) + 360) % 360;
    const big = n % 10 === 0;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - (big ? 12 : 6)); g.stroke();
    if (n % 30 === 0) g.fillText(n % 90 === 0 ? 'NESW'[n / 90] : `${n / 10}`, x, y - 16);
  }
  g.strokeRect(cx - 26, y + 4, 52, 22);
  g.font = 'bold 16px monospace'; g.fillText(String(Math.round(hdg) % 360).padStart(3, '0'), cx, y + 21);
  let db = brg - hdg; while (db > 180) db -= 360; while (db < -180) db += 360;
  const bx = cx + clamp(db, -30, 30) * ppd;
  g.fillStyle = AMBER;
  g.beginPath(); g.moveTo(bx, y + 2); g.lineTo(bx - 7, y + 14); g.lineTo(bx + 7, y + 14); g.fill();
}

function smallDial(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, label: string, ang: number, marks: number[], full = false) {
  g.fillStyle = '#0a0a0a'; g.beginPath(); g.arc(cx, cy, r + 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#141618'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ddd'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center';
  marks.forEach((m, i) => {
    const a = full ? i / marks.length * Math.PI * 2 - Math.PI / 2 : -Math.PI * 0.8 + i / (marks.length - 1) * Math.PI * 1.6 - Math.PI / 2;
    g.fillText(`${m}`, cx + Math.cos(a) * (r - 20), cy + Math.sin(a) * (r - 20) + 6);
  });
  g.fillStyle = '#8a9099'; g.font = '13px sans-serif'; g.fillText(label, cx, cy + 30);
  g.save(); g.translate(cx, cy); g.rotate(ang);
  g.fillStyle = '#f1f1f1'; g.beginPath(); g.moveTo(-4, 8); g.lineTo(0, -r + 10); g.lineTo(4, 8); g.fill();
  g.restore();
}

function reliefMap(sim: Sim) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(N, N);
  const t = sim.terrain;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const hgt = t.heights[j * (N + 1) + i], k = (j * N + i) * 4;
      const band = hgt < 0 ? 0 : Math.floor(hgt / 60);
      const s = hgt < 0 ? 0.15 : 0.3 + clamp(hgt / 500, 0, 1) * 0.7;
      const edge = hgt > 0 && Math.floor(t.heights[j * (N + 1) + Math.min(N, i + 1)] / 60) !== band;
      img.data[k] = 10; img.data[k + 1] = edge ? 200 : 40 + s * 90; img.data[k + 2] = hgt < 0 ? 60 : 20;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}
