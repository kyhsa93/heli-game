import * as THREE from 'three';
import { clamp } from '../../core/math';
import { M_TO_FT, MS_TO_KT } from '../../core/units';
import { damageWarnings } from '../../sim/heli/damage';
import { airspeed } from '../../sim/heli/state';
import { N } from '../../sim/terrain';
import type { World } from '../../sim/world';
import { AMBER, FUEL_LB } from './pages/common';
import { MpdState, PAGE_LABELS, type MpdSide, type PageId } from './mpd';
import { drawFlt } from './pages/flt';
import { drawTsd } from './pages/tsd';
import { drawWpn } from './pages/wpn';
import { drawTadsPage } from './pages/tads';
import { drawAse } from './pages/ase';

export { bearingDeg, headingDeg, hoverVector } from './pages/common';

const CRITICAL = /OUT|FIRE|LAND NOW|LOW ROTOR|TAIL ROTOR/;
export const isCritical = (w: string) => CRITICAL.test(w);

interface Surface { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture }

function surface(w: number, h: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { canvas, ctx: canvas.getContext('2d')!, texture };
}

export class Instruments {
  readonly mpdL = surface(512, 512);
  readonly mpdR = surface(512, 512);
  readonly eufd = surface(512, 288);
  readonly standby = surface(384, 504);
  readonly mpd = new MpdState();
  tadsImage: CanvasImageSource | null = null;
  private relief: HTMLCanvasElement;

  constructor(world: World) {
    this.relief = reliefMap(world);
  }

  textures() {
    return { mpdL: this.mpdL.texture, mpdR: this.mpdR.texture, eufd: this.eufd.texture, standby: this.standby.texture };
  }

  dispose() {
    for (const s of [this.mpdL, this.mpdR, this.eufd, this.standby]) s.texture.dispose();
  }

  shows(page: PageId) {
    return this.mpd.left === page || this.mpd.right === page;
  }

  draw(world: World, part: number) {
    if (part === 0) this.drawMpd('left', world);
    if (part === 1) this.drawMpd('right', world);
    if (part === 2) {
      this.drawEufd(world); this.eufd.texture.needsUpdate = true;
      this.drawStandby(world); this.standby.texture.needsUpdate = true;
    }
  }

  private drawMpd(side: MpdSide, world: World) {
    const s = side === 'left' ? this.mpdL : this.mpdR, g = s.ctx;
    const page = this.mpd[side], sel = PAGE_LABELS.indexOf(page);
    switch (page) {
      case 'FLT': drawFlt(g, world, PAGE_LABELS, sel); break;
      case 'TSD': drawTsd(g, world, this.relief, PAGE_LABELS, sel); break;
      case 'WPN': drawWpn(g, world, PAGE_LABELS, sel); break;
      case 'TADS': drawTadsPage(g, world, this.tadsImage, PAGE_LABELS, sel); break;
      case 'ASE': drawAse(g, world, PAGE_LABELS, sel); break;
    }
    s.texture.needsUpdate = true;
  }

  private drawEufd(world: World) {
    const g = this.eufd.ctx, h = world.player, W = 512, H = 288;
    g.fillStyle = '#050403'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#3a2a00'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(250, 12); g.lineTo(250, H - 12); g.stroke();
    g.font = 'bold 26px "B612 Mono", monospace'; g.textAlign = 'left';
    const warn: string[] = [];
    if (!h.engineOn && world.active && h.alive) warn.push('ENGINE OUT');
    if (h.rpm < 0.9 && !h.landed) warn.push('LOW ROTOR RPM');
    if (h.fuel < 20) warn.push('FUEL LOW');
    for (const w of damageWarnings(h.damage)) warn.push(w === 'LAND NOW' && h.rotorFailIn !== null ? `LAND NOW ${Math.ceil(h.rotorFailIn)}` : w);
    warn.sort((a, b) => Number(isCritical(b)) - Number(isCritical(a)));
    const blink = Math.sin(world.time * 7) > 0;
    warn.slice(0, 6).forEach((w, i) => {
      const caution = isCritical(w);
      g.fillStyle = caution && blink ? '#ff5a3a' : AMBER;
      g.fillText(w, 16, 40 + i * 40);
    });
    if (!warn.length) { g.fillStyle = '#6b4a00'; g.fillText('NO FAULTS', 16, 40); }
    g.fillStyle = AMBER;
    const t = new Date(world.time * 1000);
    g.fillText(`FUEL ${Math.round(h.fuel / 100 * FUEL_LB)}`, 266, 40);
    g.fillText(`NR   ${Math.round(h.rpm * 101)}%`, 266, 80);
    g.fillText(`TQ   ${Math.round(h.collective * h.rpm * 100)}%`, 266, 120);
    g.fillText(`VHF 127.000`, 266, 190);
    g.fillText(`T+ ${String(t.getUTCMinutes()).padStart(2, '0')}:${String(t.getUTCSeconds()).padStart(2, '0')}`, 266, 240);
  }

  private drawStandby(world: World) {
    const g = this.standby.ctx, h = world.player;
    g.fillStyle = '#16181b'; g.fillRect(0, 0, 384, 504);
    const r = 70;
    const kt = airspeed(world.player, world.wind) * MS_TO_KT;
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

function reliefMap(world: World) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(N, N);
  const t = world.terrain;
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
