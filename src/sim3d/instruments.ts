import * as THREE from 'three';
import { clamp } from '../game/math';
import { M_TO_FT, MS_TO_FPM, MS_TO_KT, type Sim } from './sim';
import { HALF, N, SIZE } from './terrain';

const W = 1024, H = 320, R = 60;
const MAP = { x: 432, y: 14, w: 160, h: 196, range: 1600 };

export class Instruments {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private relief: HTMLCanvasElement;

  constructor(sim: Sim) {
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.relief = reliefMap(sim);
  }

  draw(sim: Sim) {
    const g = this.ctx, h = sim.heli;
    g.fillStyle = '#26292e'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1d1f23'; g.fillRect(8, 8, W - 16, H - 16);

    const kt = sim.airspeed() * MS_TO_KT;
    dial(g, 76, 82, 'KNOTS', 0, 140, 10, 20, kt);
    attitude(g, 220, 82, h.pitch, h.roll);
    altimeter(g, 364, 82, h.pos.y * M_TO_FT);
    this.map(sim);
    vsi(g, 664, 82, h.vel.y * MS_TO_FPM);
    heading(g, 808, 82, sim);
    tach(g, 948, 82, h.rpm, h.collective * h.rpm);

    const agl = Math.max(0, sim.agl()) * M_TO_FT;
    readout(g, 76, 222, 'RAD ALT', agl > 2500 ? '----' : `${Math.round(agl)}`, 'ft');
    readout(g, 220, 222, 'COLL', `${Math.round(h.collective * 100)}`, '%');
    fuelGauge(g, 364, 222, h.fuel);

    const blink = Math.sin(sim.time * 8) > 0;
    const m = sim.mission;
    const lights: [string, boolean, string][] = [
      ['ENG OUT', !h.engineOn && h.alive && sim.mode === 'play', '#ef233c'],
      ['LOW RPM', h.rpm < 0.85 && !h.landed, '#ef233c'],
      ['LOW FUEL', h.fuel < 20, '#f4a100'],
      ['CARGO', m.stage === 'deliver', '#06d6a0'],
      ['LOADING', m.timer > 0, '#4cc9f0'],
      ['WIND', true, '#7a8290'],
    ];
    lights.forEach(([label, on, color], i) => {
      const x = 432 + (i % 3) * 56, y = 222 + Math.floor(i / 3) * 42;
      const lit = on && (label !== 'LOW RPM' || blink);
      g.fillStyle = lit ? color : '#2e3137';
      g.fillRect(x, y, 50, 34);
      g.fillStyle = lit ? '#111' : '#5b616b';
      g.font = 'bold 11px sans-serif'; g.textAlign = 'center';
      g.fillText(label === 'WIND' ? `${Math.round(sim.wind.length() * MS_TO_KT)}KT` : label, x + 25, y + 21);
    });

    readout(g, 664, 222, 'DIST', this.distText(sim), '');
    readout(g, 808, 222, 'OAT', `${Math.round(15 - h.pos.y * 0.0065)}`, '°C');
    readout(g, 948, 222, 'N2', `${Math.round(h.rpm * 100)}`, '%');

    this.texture.needsUpdate = true;
  }

  private distText(sim: Sim) {
    const p = sim.targetPad(), h = sim.heli;
    const d = Math.hypot(p.x - h.pos.x, p.z - h.pos.z);
    return d > 999 ? `${(d / 1000).toFixed(1)}k` : `${Math.round(d)}`;
  }

  private map(sim: Sim) {
    const g = this.ctx, h = sim.heli, { x, y, w, h: mh, range } = MAP;
    g.save();
    g.beginPath(); g.rect(x, y, w, mh); g.clip();
    g.fillStyle = '#0c1a24'; g.fillRect(x, y, w, mh);
    const cx = x + w / 2, cy = y + mh * 0.62, scale = w / range;
    g.translate(cx, cy);
    g.rotate(h.yaw);
    const img = this.relief, px = SIZE * scale;
    g.globalAlpha = 0.85;
    g.drawImage(img, (-HALF - h.pos.x) * scale, (-HALF - h.pos.z) * scale, px, px);
    g.globalAlpha = 1;
    const tp = sim.targetPad();
    sim.pads.forEach(p => {
      const target = p === tp;
      g.fillStyle = target ? (sim.mission.stage === 'pickup' ? '#ffd166' : '#06d6a0') : p.base ? '#4cc9f0' : '#e8eef7';
      const sx = (p.x - h.pos.x) * scale, sy = (p.z - h.pos.z) * scale;
      g.beginPath(); g.arc(sx, sy, target ? 5 : 3.5, 0, Math.PI * 2); g.fill();
      g.save(); g.translate(sx, sy); g.rotate(-h.yaw);
      g.font = 'bold 11px sans-serif'; g.textAlign = 'left'; g.fillText(p.name, 6, 4);
      g.restore();
      if (target) {
        g.strokeStyle = g.fillStyle; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, 0); g.lineTo(sx, sy); g.stroke(); g.setLineDash([]);
      }
    });
    g.restore();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx - 6, cy + 6); g.lineTo(cx + 6, cy + 6); g.fill();
    g.strokeStyle = '#3b4048'; g.lineWidth = 3; g.strokeRect(x, y, w, mh);
    g.fillStyle = '#8fa0b5'; g.font = '10px sans-serif'; g.textAlign = 'left';
    g.fillText('GPS  1.6km', x + 5, y + 13);
  }
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
      if (hgt < 0) { img.data[k] = 30; img.data[k + 1] = 70; img.data[k + 2] = 110; }
      else {
        const s = clamp(hgt / 500, 0, 1);
        img.data[k] = 40 + s * 120; img.data[k + 1] = 70 + s * 80; img.data[k + 2] = 40 + s * 70;
      }
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

function bezel(g: CanvasRenderingContext2D, cx: number, cy: number) {
  g.fillStyle = '#0a0b0d';
  g.beginPath(); g.arc(cx, cy, R + 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#15171a';
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
}

function needle(g: CanvasRenderingContext2D, cx: number, cy: number, ang: number, len: number, width: number, color = '#f1f1f1') {
  g.save(); g.translate(cx, cy); g.rotate(ang);
  g.fillStyle = color;
  g.beginPath(); g.moveTo(-width, 8); g.lineTo(0, -len); g.lineTo(width, 8); g.fill();
  g.restore();
  g.fillStyle = '#333'; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
}

function ticks(g: CanvasRenderingContext2D, cx: number, cy: number, from: number, to: number, n: number, major: number, labels?: (i: number) => string) {
  g.strokeStyle = '#ddd'; g.fillStyle = '#ddd'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
  for (let i = 0; i <= n; i++) {
    const a = from + (to - from) * i / n - Math.PI / 2;
    const big = i % major === 0;
    g.lineWidth = big ? 2.5 : 1.2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (R - (big ? 11 : 6)), cy + Math.sin(a) * (R - (big ? 11 : 6)));
    g.lineTo(cx + Math.cos(a) * (R - 1), cy + Math.sin(a) * (R - 1)); g.stroke();
    if (big && labels) g.fillText(labels(i), cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22) + 4);
  }
}

function dial(g: CanvasRenderingContext2D, cx: number, cy: number, label: string, min: number, max: number, minor: number, majorEvery: number, value: number) {
  bezel(g, cx, cy);
  const from = -Math.PI * 0.8, to = Math.PI * 0.8;
  const n = (max - min) / minor;
  ticks(g, cx, cy, from, to, n, majorEvery / minor, i => `${min + i * minor}`);
  g.fillStyle = '#8fa0b5'; g.font = '10px sans-serif'; g.fillText(label, cx, cy + 26);
  needle(g, cx, cy, from + (to - from) * clamp((value - min) / (max - min), 0, 1), R - 10, 3);
}

function attitude(g: CanvasRenderingContext2D, cx: number, cy: number, pitch: number, roll: number) {
  bezel(g, cx, cy);
  g.save();
  g.beginPath(); g.arc(cx, cy, R - 2, 0, Math.PI * 2); g.clip();
  g.translate(cx, cy); g.rotate(-roll);
  const off = pitch * 180 / Math.PI * 2.2;
  g.fillStyle = '#3b82c4'; g.fillRect(-R * 2, -R * 2 + off, R * 4, R * 2);
  g.fillStyle = '#7a4f2a'; g.fillRect(-R * 2, off, R * 4, R * 2);
  g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-R * 2, off); g.lineTo(R * 2, off); g.stroke();
  g.lineWidth = 1.5; g.font = '9px sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'left';
  for (const d of [-20, -10, 10, 20]) {
    const y = off - d * 2.2, w = Math.abs(d) === 10 ? 14 : 22;
    g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.stroke();
    g.fillText(`${Math.abs(d)}`, w + 3, y + 3);
  }
  g.restore();
  g.strokeStyle = '#ffd166'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx - 30, cy); g.lineTo(cx - 10, cy); g.lineTo(cx - 5, cy + 6); g.moveTo(cx + 30, cy); g.lineTo(cx + 10, cy); g.lineTo(cx + 5, cy + 6); g.stroke();
  g.fillStyle = '#ffd166'; g.beginPath(); g.arc(cx, cy, 2.5, 0, Math.PI * 2); g.fill();
  g.save(); g.translate(cx, cy); g.rotate(-roll);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -R + 3); g.lineTo(-5, -R + 12); g.lineTo(5, -R + 12); g.fill();
  g.restore();
}

function altimeter(g: CanvasRenderingContext2D, cx: number, cy: number, ft: number) {
  bezel(g, cx, cy);
  ticks(g, cx, cy, 0, Math.PI * 2, 50, 5, i => (i < 50 ? `${i / 5}` : ''));
  g.fillStyle = '#000'; g.fillRect(cx - 24, cy + 14, 48, 18);
  g.fillStyle = '#fff'; g.font = 'bold 13px monospace'; g.textAlign = 'center';
  g.fillText(`${Math.round(ft)}`, cx, cy + 28);
  g.fillStyle = '#8fa0b5'; g.font = '10px sans-serif'; g.fillText('ALT FT', cx, cy - 18);
  needle(g, cx, cy, (ft / 10000) * Math.PI * 2, R - 30, 4.5);
  needle(g, cx, cy, (ft / 1000) * Math.PI * 2, R - 8, 2.5);
}

function vsi(g: CanvasRenderingContext2D, cx: number, cy: number, fpm: number) {
  bezel(g, cx, cy);
  const map = (v: number) => -Math.PI / 2 + clamp(v / 2000, -1, 1) * Math.PI * 0.85;
  g.strokeStyle = '#ddd'; g.fillStyle = '#ddd'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center';
  for (let v = -2000; v <= 2000; v += 500) {
    const a = map(v);
    g.lineWidth = v % 1000 === 0 ? 2.5 : 1.2;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 10), cy + Math.sin(a) * (R - 10)); g.lineTo(cx + Math.cos(a) * (R - 1), cy + Math.sin(a) * (R - 1)); g.stroke();
    if (v % 1000 === 0) g.fillText(`${Math.abs(v / 1000)}`, cx + Math.cos(a) * (R - 21), cy + Math.sin(a) * (R - 21) + 4);
  }
  g.fillStyle = '#8fa0b5'; g.font = '10px sans-serif';
  g.fillText('UP', cx + 22, cy - 18); g.fillText('DN', cx + 22, cy + 24); g.fillText('×1000', cx - 4, cy + 36);
  needle(g, cx, cy, map(fpm) + Math.PI / 2, R - 10, 3, fpm < -500 ? '#ffb4a2' : '#f1f1f1');
}

function heading(g: CanvasRenderingContext2D, cx: number, cy: number, sim: Sim) {
  bezel(g, cx, cy);
  const h = sim.heli;
  const hdg = ((-h.yaw * 180 / Math.PI) % 360 + 360) % 360;
  g.save(); g.translate(cx, cy); g.rotate(-hdg * Math.PI / 180);
  g.strokeStyle = '#ddd'; g.fillStyle = '#ddd'; g.textAlign = 'center';
  for (let d = 0; d < 360; d += 10) {
    const a = d * Math.PI / 180, big = d % 30 === 0;
    g.lineWidth = big ? 2 : 1;
    g.beginPath(); g.moveTo(Math.sin(a) * (R - (big ? 10 : 6)), -Math.cos(a) * (R - (big ? 10 : 6))); g.lineTo(Math.sin(a) * (R - 1), -Math.cos(a) * (R - 1)); g.stroke();
    if (big) {
      g.save(); g.rotate(a); g.font = d % 90 === 0 ? 'bold 13px sans-serif' : '10px sans-serif';
      g.fillText(d % 90 === 0 ? 'NESW'[d / 90] : `${d / 10}`, 0, -R + 24); g.restore();
    }
  }
  const tp = sim.targetPad();
  const brg = Math.atan2(tp.x - h.pos.x, -(tp.z - h.pos.z));
  g.rotate(brg);
  g.fillStyle = sim.mission.stage === 'pickup' ? '#ffd166' : '#06d6a0';
  g.beginPath(); g.moveTo(0, -R + 6); g.lineTo(-7, -R + 22); g.lineTo(7, -R + 22); g.fill();
  g.fillRect(-2, -R + 20, 4, R * 2 - 40);
  g.restore();
  g.fillStyle = '#f4a100'; g.beginPath(); g.moveTo(cx, cy - R + 1); g.lineTo(cx - 5, cy - R - 6); g.lineTo(cx + 5, cy - R - 6); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx, cy - 12); g.lineTo(cx, cy + 12); g.moveTo(cx - 10, cy - 2); g.lineTo(cx + 10, cy - 2); g.stroke();
  g.fillStyle = '#000'; g.fillRect(cx - 18, cy + 20, 36, 16);
  g.fillStyle = '#fff'; g.font = 'bold 12px monospace'; g.textAlign = 'center';
  g.fillText(String(Math.round(hdg) % 360).padStart(3, '0'), cx, cy + 32);
}

function tach(g: CanvasRenderingContext2D, cx: number, cy: number, rpm: number, torque: number) {
  bezel(g, cx, cy);
  const from = -Math.PI * 0.8, to = Math.PI * 0.8;
  const a = (v: number) => from + (to - from) * clamp(v / 1.2, 0, 1) - Math.PI / 2;
  g.lineWidth = 6;
  g.strokeStyle = '#2a9d4b'; g.beginPath(); g.arc(cx, cy, R - 5, a(0.95), a(1.05)); g.stroke();
  g.strokeStyle = '#c1121f'; g.beginPath(); g.arc(cx, cy, R - 5, a(1.07), a(1.2)); g.stroke();
  g.beginPath(); g.arc(cx, cy, R - 5, a(0), a(0.85)); g.strokeStyle = '#5c1f1f'; g.stroke();
  ticks(g, cx, cy, from, to, 12, 2, i => `${i * 10}`);
  g.fillStyle = '#8fa0b5'; g.font = '10px sans-serif'; g.textAlign = 'center';
  g.fillText('ROTOR %', cx, cy + 24); g.fillText('TRQ', cx, cy + 36);
  needle(g, cx, cy, a(torque) + Math.PI / 2, R - 24, 2.5, '#f4a100');
  needle(g, cx, cy, a(rpm) + Math.PI / 2, R - 8, 3);
}

function readout(g: CanvasRenderingContext2D, cx: number, cy: number, label: string, value: string, unit: string) {
  g.fillStyle = '#0a0b0d'; g.fillRect(cx - 58, cy - 18, 116, 64);
  g.fillStyle = '#8fa0b5'; g.font = '11px sans-serif'; g.textAlign = 'center';
  g.fillText(label, cx, cy - 3);
  g.fillStyle = '#7dffb0'; g.font = 'bold 26px monospace';
  g.fillText(value, cx - (unit ? 8 : 0), cy + 30);
  g.fillStyle = '#5fbf85'; g.font = '12px monospace'; g.textAlign = 'left';
  if (unit) g.fillText(unit, cx + 28, cy + 30);
}

function fuelGauge(g: CanvasRenderingContext2D, cx: number, cy: number, fuel: number) {
  g.fillStyle = '#0a0b0d'; g.fillRect(cx - 58, cy - 18, 116, 64);
  g.fillStyle = '#8fa0b5'; g.font = '11px sans-serif'; g.textAlign = 'center';
  g.fillText('FUEL', cx, cy - 3);
  g.fillStyle = '#2e3137'; g.fillRect(cx - 48, cy + 8, 96, 16);
  g.fillStyle = fuel < 20 ? '#f4a100' : '#4cc9f0'; g.fillRect(cx - 48, cy + 8, 96 * fuel / 100, 16);
  g.fillStyle = '#ddd'; g.font = 'bold 12px monospace'; g.fillText(`${Math.round(fuel)}%`, cx, cy + 40);
}
