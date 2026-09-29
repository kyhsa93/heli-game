import * as THREE from 'three';
import { clamp } from '../core/math';
import { bearingDeg, headingDeg, hoverVector } from './cockpit/instruments';
import { M_TO_FT, MS_TO_FPM, MS_TO_KT } from '../core/units';
import { agl as aglOf, airspeed } from '../sim/heli/state';
import { gunInLimits } from '../sim/weapons/arms';
import { damageWarnings } from '../sim/heli/damage';
import { aseThreats, missileInbound } from '../sim/sensors/ase';
import { predictGunImpact } from '../sim/weapons/ballistics';
import { count } from '../sim/heli/loadout';
import { EYE } from '../sim/heli/airframe';
import { toWorld } from '../sim/heli/state';
import { boresight, HYDRA, rocketSolution, rocketTarget } from '../sim/weapons/rockets';
import { LAUNCH_CONSTRAINT } from '../sim/weapons/hellfire';
import { tadsWeaponStatus } from './tadsHud';
import type { World } from '../sim/world';

const GREEN = '#5dff6e';
const tmp = new THREE.Vector3();
const camPos = new THREE.Vector3();
const camDir = new THREE.Vector3();

function project(camera: THREE.Camera, p: THREE.Vector3, w: number, h: number) {
  tmp.copy(p).project(camera);
  if (tmp.z > 1 || tmp.z < -1) return null;
  return { x: (tmp.x + 1) / 2 * w, y: (1 - tmp.y) / 2 * h };
}

export function drawIhadss(g: CanvasRenderingContext2D, w: number, h: number, world: World, camera: THREE.Camera) {
  const u = clamp(Math.min(w, h) / 700, 0.6, 1.4);
  const cx = w / 2, cy = h / 2;
  const heli = world.player;
  g.save();
  g.strokeStyle = GREEN; g.fillStyle = GREEN; g.lineWidth = 2 * u;
  g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 3;
  g.font = `bold ${Math.round(16 * u)}px "B612 Mono", ui-monospace, Menlo, Consolas, monospace`;
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

  const hv = hoverVector(world);
  const R = 70 * u, s = R / 5;
  g.globalAlpha = 0.45; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
  const vx = clamp(hv.right * s, -R, R), vy = clamp(-hv.fwd * s, -R, R);
  g.lineWidth = 3 * u;
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + vx, cy + vy); g.stroke();
  g.lineWidth = 2 * u;
  g.beginPath(); g.arc(cx + vx, cy + vy, 4 * u, 0, Math.PI * 2); g.fill();

  const hdg = headingDeg(heli.yaw), brg = bearingDeg(world);
  const tw = 260 * u, ty = 40 * u, ppd = tw / 60;
  for (let d = Math.ceil((hdg - 30) / 5) * 5; d <= hdg + 30; d += 5) {
    const x = cx + (d - hdg) * ppd, n = ((d % 360) + 360) % 360;
    g.beginPath(); g.moveTo(x, ty); g.lineTo(x, ty - (n % 10 === 0 ? 10 : 5) * u); g.stroke();
    if (n % 30 === 0) g.fillText(n % 90 === 0 ? 'NESW'[n / 90] : `${n / 10}`, x, ty - 14 * u);
  }
  g.strokeRect(cx - 24 * u, ty + 4 * u, 48 * u, 22 * u);
  g.fillText(String(Math.round(hdg) % 360).padStart(3, '0'), cx, ty + 21 * u);
  if (brg !== null) {
    let db = brg - hdg; while (db > 180) db -= 360; while (db < -180) db += 360;
    const bx = cx + clamp(db, -30, 30) * ppd;
    g.beginPath(); g.moveTo(bx, ty + 30 * u); g.lineTo(bx - 7 * u, ty + 42 * u); g.lineTo(bx + 7 * u, ty + 42 * u); g.closePath(); g.stroke();
  }

  const kt = airspeed(world.player, world.wind) * MS_TO_KT;
  g.textAlign = 'right';
  g.fillText(`${Math.round(kt)}`, cx - 150 * u, cy + 6 * u);
  const agl = Math.max(0, aglOf(world.player, world.terrain)) * M_TO_FT;
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

  if (world.arms.selected === 'hydra70') drawRockets(g, w, h, u, world, camera);
  else if (world.arms.selected === 'agm114k') drawHellfire(g, w, h, u, world, camera);
  else drawGun(g, w, h, u, world, camera);

  const tp = world.target;
  const sp = tp && project(camera, tmp.set(tp.x, tp.y + 1, tp.z), w, h);
  if (tp && sp && sp.x > 0 && sp.x < w && sp.y > 0 && sp.y < h) {
    const d = Math.hypot(tp.x - heli.pos.x, tp.z - heli.pos.z);
    const r = 10 * u;
    g.beginPath(); g.moveTo(sp.x, sp.y - r); g.lineTo(sp.x + r, sp.y); g.lineTo(sp.x, sp.y + r); g.lineTo(sp.x - r, sp.y); g.closePath(); g.stroke();
    g.textAlign = 'center';
    g.fillText(`${tp.name} ${d > 999 ? (d / 1000).toFixed(1) + 'K' : Math.round(d)}`, sp.x, sp.y - r - 6 * u);
  }

  drawThreatArcs(g, w, h, u, world, camera);

  g.textAlign = 'center';
  const warns: string[] = [];
  if (missileInbound(world)) warns.push('MISSILE');
  if (!heli.engineOn && heli.alive && world.active && !heli.landed) warns.push('ENGINE OUT');
  if (heli.rpm < 0.85 && !heli.landed) warns.push('LOW ROTOR RPM');
  if (heli.fuel < 10) warns.push('FUEL LOW');
  for (const w of damageWarnings(heli.damage)) if (/OUT|FIRE|LAND NOW|TAIL ROTOR/.test(w)) warns.push(w === 'LAND NOW' && heli.rotorFailIn !== null ? `LAND NOW ${Math.ceil(heli.rotorFailIn)}` : w);
  if (warns.length && Math.sin(world.time * 8) > 0) g.fillText(warns.join('  '), cx, cy + 150 * u);
  g.restore();
}

function drawGun(g: CanvasRenderingContext2D, w: number, h: number, u: number, world: World, camera: THREE.Camera) {
  const cx = w / 2, cy = h / 2, a = world.arms;
  const inLimits = gunInLimits(world.commands.aim);
  g.save();
  g.lineWidth = 2 * u;
  if (inLimits) {
    const r = 12 * u;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    g.moveTo(cx - r - 8 * u, cy); g.lineTo(cx - r, cy);
    g.moveTo(cx + r, cy); g.lineTo(cx + r + 8 * u, cy);
    g.moveTo(cx, cy + r); g.lineTo(cx, cy + r + 8 * u);
    g.stroke();
    const pred = a.gunAmmo > 0 ? predictGunImpact(world) : null;
    const sp = pred && project(camera, pred.point, w, h);
    if (pred && sp) {
      g.beginPath(); g.arc(sp.x, sp.y, 4 * u, 0, Math.PI * 2); g.stroke();
      g.textAlign = 'left';
      g.fillText(`${pred.laser ? 'L' : ''}${Math.round(pred.range)}`, sp.x + 8 * u, sp.y + 5 * u);
    }
  } else {
    const r = 16 * u;
    g.beginPath(); g.moveTo(cx - r, cy - r); g.lineTo(cx + r, cy + r); g.moveTo(cx + r, cy - r); g.lineTo(cx - r, cy + r); g.stroke();
  }
  g.textAlign = 'right';
  const status = a.gunAmmo <= 0 ? 'GUN EMPTY' : `GUN ${a.gunAmmo}${inLimits ? '' : ' LIMIT'}`;
  g.fillText(status, cx + 190 * u, cy + 132 * u);
  g.restore();
}

const eye = new THREE.Vector3();
const dirTmp = new THREE.Vector3();

function rangeText(m: number) {
  return m > 999 ? `${(m / 1000).toFixed(1)}K` : `${Math.round(m)}`;
}

function drawRockets(g: CanvasRenderingContext2D, w: number, h: number, u: number, world: World, camera: THREE.Camera) {
  const heli = world.player, a = world.arms;
  const left = count(world.loadout, 'hydra70');
  toWorld(heli, EYE, eye);
  const bore = project(camera, dirTmp.copy(boresight(heli)).multiplyScalar(3000).add(eye), w, h);
  g.save();
  g.lineWidth = 2 * u;
  const edge = 30 * u;
  const bx = bore ? clamp(bore.x, edge, w - edge) : w / 2, by = bore ? clamp(bore.y, edge, h - edge) : h / 2;
  g.beginPath(); g.arc(bx, by, 6 * u, 0, Math.PI * 2); g.stroke();

  const aim = rocketTarget(world);
  const target = aim?.point ?? null;
  const tp = target && project(camera, target, w, h);
  if (tp) {
    const r = 5 * u;
    if (aim?.laser) { g.strokeRect(tp.x - r, tp.y - r, r * 2, r * 2); }
    else { g.beginPath(); g.moveTo(tp.x - r, tp.y); g.lineTo(tp.x + r, tp.y); g.moveTo(tp.x, tp.y - r); g.lineTo(tp.x, tp.y + r); g.stroke(); }
  }
  const sol = target && left > 0 ? rocketSolution(world, target) : null;
  const sp = sol && project(camera, dirTmp.copy(sol.dir).multiplyScalar(3000).add(eye), w, h);
  let note = '';
  if (target) {
    const range = Math.hypot(target.x - heli.pos.x, target.z - heli.pos.z);
    note = range < HYDRA.minRange ? ' MIN' : range > (HYDRA.effectiveRange ?? HYDRA.maxRange) ? ' MAX' : '';
    g.textAlign = 'center';
    g.fillText(`${aim?.laser ? 'L ' : ''}${rangeText(range)}`, bx, by + 58 * u);
  }
  if (sol && sp) {
    const ix = clamp(sp.x, edge, w - edge), ey = clamp(sp.y, edge, h - edge);
    const ih = 22 * u, serif = 7 * u;
    g.lineWidth = 3 * u;
    g.beginPath();
    g.moveTo(ix, by - ih); g.lineTo(ix, by + ih);
    g.moveTo(ix - serif, by - ih); g.lineTo(ix + serif, by - ih);
    g.moveTo(ix - serif, by + ih); g.lineTo(ix + serif, by + ih);
    g.stroke();
    g.lineWidth = 2 * u;
    g.beginPath(); g.moveTo(bx - 26 * u, ey); g.lineTo(bx - 10 * u, ey); g.moveTo(bx + 10 * u, ey); g.lineTo(bx + 26 * u, ey); g.stroke();
  }
  g.textAlign = 'right';
  const status = left <= 0 ? 'RKT EMPTY' : `RKT ${left} x${a.salvo}${note}`;
  g.fillText(status, w / 2 + 190 * u, h / 2 + 132 * u);
  g.restore();
}

function drawHellfire(g: CanvasRenderingContext2D, w: number, h: number, u: number, world: World, camera: THREE.Camera) {
  const heli = world.player;
  toWorld(heli, EYE, eye);
  g.save();
  g.lineWidth = 2 * u;
  const yaw = heli.yaw, c = LAUNCH_CONSTRAINT;
  const corners = [-c, c].map(a => project(camera, dirTmp.set(-Math.sin(yaw + a), 0, -Math.cos(yaw + a)).multiplyScalar(3000).add(eye), w, h));
  const [l, r] = corners;
  if (l && r) {
    const y = (l.y + r.y) / 2, hh = 26 * u;
    g.setLineDash([6 * u, 6 * u]);
    g.strokeRect(Math.min(l.x, r.x), y - hh, Math.abs(r.x - l.x), hh * 2);
    g.setLineDash([]);
  }
  const spots = world.laserSpots();
  for (const s of spots) {
    const p = project(camera, s.pos, w, h);
    if (!p) continue;
    const r = 7 * u;
    g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(p.x - r * 1.6, p.y); g.lineTo(p.x + r * 1.6, p.y); g.moveTo(p.x, p.y - r * 1.6); g.lineTo(p.x, p.y + r * 1.6); g.stroke();
  }
  g.textAlign = 'right';
  g.fillText(tadsWeaponStatus(world), w / 2 + 190 * u, h / 2 + 132 * u);
  g.restore();
}

function drawThreatArcs(g: CanvasRenderingContext2D, w: number, h: number, u: number, world: World, camera: THREE.Camera) {
  const threats = aseThreats(world);
  if (!threats.length) return;
  camera.getWorldDirection(camDir);
  const heli = world.player;
  const view = Math.atan2(-camDir.x, -camDir.z) - heli.yaw;
  const R = Math.min(w, h) * 0.44, cx = w / 2, cy = h / 2;
  const blink = Math.sin(world.time * 10) > 0;
  g.save();
  for (const t of threats) {
    const a = -(t.bearing - view);
    const loud = t.state !== 'search';
    if (loud && !blink && t.state !== 'missile') continue;
    g.lineWidth = (loud ? 4 : 2) * u;
    const span = loud ? 0.18 : 0.1;
    g.beginPath(); g.arc(cx, cy, R, a - Math.PI / 2 - span, a - Math.PI / 2 + span); g.stroke();
    g.font = `bold ${Math.round((loud ? 20 : 15) * u)}px "B612 Mono", monospace`;
    g.textAlign = 'center';
    g.fillText(t.symbol, cx + Math.cos(a - Math.PI / 2) * (R - 22 * u), cy + Math.sin(a - Math.PI / 2) * (R - 22 * u) + 6 * u);
  }
  g.restore();
}
