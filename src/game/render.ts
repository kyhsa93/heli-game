import { CR, G, LAND_A, LAND_VX, LAND_VY, PAD_W, SKID, WORLD } from './constants';
import type { Game, Heli } from './game';
import { clamp } from './math';

export interface View {
  w: number;
  h: number;
  dpr: number;
  touch: boolean;
}

export function viewScale(v: View) {
  return clamp(Math.min(v.h / 760, v.w / 620), 0.5, 1.3);
}

export function render(game: Game, ctx: CanvasRenderingContext2D, v: View) {
  const { w: W, h: H, dpr } = v;
  const s = viewScale(v);
  const heli = game.heli, cam = game.cam;
  const tx = heli.alive ? heli.x + heli.vx * 0.5 : cam.x;
  const ty = heli.alive ? heli.y + heli.vy * 0.3 - 40 : cam.y;
  cam.x += (tx - cam.x) * 0.08; cam.y += (ty - cam.y) * 0.08;
  const halfW = W / 2 / s;
  cam.x = clamp(cam.x, halfW, WORLD - halfW);

  drawBackground(game, ctx, v, s);

  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - cam.x * s), dpr * (H / 2 - cam.y * s));
  const x0 = Math.max(0, cam.x - halfW - 20), x1 = Math.min(WORLD, cam.x + halfW + 20);
  drawTerrain(game, ctx, x0, x1, cam.y + H / 2 / s + 20);
  drawPads(game, ctx, x0, x1);
  drawCrate(game, ctx);
  if (heli.alive) drawHeli(game, ctx, heli);
  drawEffects(game, ctx);

  drawHud(game, ctx, v, s);
}

function drawBackground(game: Game, ctx: CanvasRenderingContext2D, v: View, s: number) {
  const { w: W, h: H, dpr } = v;
  const cam = game.cam;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const alt01 = clamp((900 - cam.y) / 1400, 0, 1);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, `hsl(212,${55 + alt01 * 15}%,${38 - alt01 * 14}%)`);
  sky.addColorStop(1, `hsl(200,55%,${74 - alt01 * 10}%)`);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 9; i++) {
    const cxw = i * 1100 + 300, cy = 80 + (i * 97 % 260);
    const sx = ((cxw - cam.x * 0.5) % (W + 400) + W + 400) % (W + 400) - 200;
    const sy = H * 0.5 + (cy - 300 - cam.y * 0.2 + 180) * s * 0.7;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 70 * s, 18 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(sx + 40 * s, sy - 10 * s, 45 * s, 16 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const layers: [number, string, number, number][] = [[0.25, '#6b88a8', 0.62, 1], [0.45, '#4f6d8c', 0.72, 1.3]];
  for (const [par, col, base, amp] of layers) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
    for (let sx = 0; sx <= W + 8; sx += 8) {
      const wx = cam.x * par + (sx - W / 2) / s;
      const hh = 90 * Math.sin(wx / 330) + 50 * Math.sin(wx / 140 + 2) + 30 * Math.sin(wx / 61);
      ctx.lineTo(sx, H * base - (hh * amp + 60) * s - (cam.y - 700) * s * par * 0.4);
    }
    ctx.lineTo(W, H); ctx.fill();
  }
}

function drawTerrain(game: Game, ctx: CanvasRenderingContext2D, x0: number, x1: number, yBot: number) {
  const earth = ctx.createLinearGradient(0, 300, 0, 1300);
  earth.addColorStop(0, '#6c7a45'); earth.addColorStop(1, '#3a3222');
  ctx.fillStyle = earth; ctx.beginPath(); ctx.moveTo(x0, yBot);
  for (let x = x0; x <= x1; x += 6) ctx.lineTo(x, game.ground(x));
  ctx.lineTo(x1, game.ground(x1)); ctx.lineTo(x1, yBot); ctx.fill();
  ctx.strokeStyle = '#8fb35a'; ctx.lineWidth = 4; ctx.beginPath();
  for (let x = x0; x <= x1; x += 6) {
    if (x === x0) ctx.moveTo(x, game.ground(x));
    else ctx.lineTo(x, game.ground(x));
  }
  ctx.stroke();

  const pads = game.world.pads;
  for (let x = Math.floor(x0 / 90) * 90; x < x1; x += 90) {
    const hsh = Math.sin(x * 12.9898) * 43758.5453 % 1;
    if (hsh < 0.35 || pads.some(p => Math.abs(p.x - x) < PAD_W / 2 + 30)) continue;
    const gy = game.ground(x), th = 16 + hsh * 20;
    ctx.fillStyle = '#4a3a24'; ctx.fillRect(x - 2, gy - th * 0.5, 4, th * 0.5);
    ctx.fillStyle = '#3f6b35'; ctx.beginPath();
    ctx.moveTo(x - th * 0.35, gy - th * 0.35); ctx.lineTo(x, gy - th * 1.2); ctx.lineTo(x + th * 0.35, gy - th * 0.35);
    ctx.fill();
  }
}

function drawPads(game: Game, ctx: CanvasRenderingContext2D, x0: number, x1: number) {
  const { mission, crate, time } = game;
  game.world.pads.forEach((p, i) => {
    if (p.x < x0 - PAD_W || p.x > x1 + PAD_W) return;
    const isTo = i === mission.to && !crate.dead;
    const isFrom = i === mission.from && !crate.dead && !crate.attached;
    ctx.fillStyle = '#5b5f66'; ctx.fillRect(p.x - PAD_W / 2, p.y, PAD_W, 8);
    ctx.fillStyle = '#7d828b'; ctx.fillRect(p.x - PAD_W / 2, p.y - 1, PAD_W, 3);
    const blink = Math.sin(time * 5 + i) > 0;
    ctx.fillStyle = isTo ? (blink ? '#06d6a0' : '#0a5') : (p.base ? '#118ab2' : '#ffd166');
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(p.x + sx * (PAD_W / 2 - 4), p.y - 3, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 22px system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x, p.y + 30);
    if (p.base) { ctx.font = 'bold 11px system-ui,sans-serif'; ctx.fillStyle = '#9fd8ef'; ctx.fillText('FUEL', p.x, p.y + 44); }
    if (isTo) {
      ctx.fillStyle = `rgba(6,214,160,${0.12 + 0.08 * Math.sin(time * 4)})`;
      ctx.fillRect(p.x - PAD_W / 2, p.y - 260, PAD_W, 260);
      ctx.fillStyle = '#06d6a0'; ctx.font = 'bold 14px system-ui,sans-serif'; ctx.fillText('도착지', p.x, p.y - 12);
    }
    if (isFrom) { ctx.fillStyle = '#ffd166'; ctx.font = 'bold 14px system-ui,sans-serif'; ctx.fillText('화물', p.x + 38, p.y - 28); }
  });
}

function drawCrate(game: Game, ctx: CanvasRenderingContext2D) {
  const crate = game.crate;
  if (crate.dead) return;
  if (crate.attached && game.heli.alive) {
    const hp = game.hookPos();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(hp.x, hp.y); ctx.lineTo(crate.x, crate.y - CR); ctx.stroke();
  }
  ctx.fillStyle = '#b77a35'; ctx.fillRect(crate.x - CR, crate.y - CR, CR * 2, CR * 2);
  ctx.strokeStyle = '#6e4519'; ctx.lineWidth = 2; ctx.strokeRect(crate.x - CR, crate.y - CR, CR * 2, CR * 2);
  ctx.beginPath();
  ctx.moveTo(crate.x - CR, crate.y - CR); ctx.lineTo(crate.x + CR, crate.y + CR);
  ctx.moveTo(crate.x + CR, crate.y - CR); ctx.lineTo(crate.x - CR, crate.y + CR);
  ctx.stroke();
  if (game.crateInReach()) {
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(crate.x, crate.y, 20, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
}

function drawHeli(game: Game, ctx: CanvasRenderingContext2D, h: Heli) {
  ctx.save();
  ctx.translate(h.x, h.y); ctx.rotate(h.a); ctx.scale(h.facing, 1);
  const spin = clamp(h.T / G, 0, 1.2);

  ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-9, 11); ctx.lineTo(-11, SKID); ctx.moveTo(9, 11); ctx.lineTo(11, SKID);
  ctx.moveTo(-20, SKID); ctx.lineTo(18, SKID); ctx.quadraticCurveTo(23, SKID, 24, SKID - 4);
  ctx.stroke();

  ctx.fillStyle = '#b8352c';
  ctx.beginPath(); ctx.moveTo(-10, -7); ctx.lineTo(-44, -8); ctx.lineTo(-44, -3); ctx.lineTo(-10, 4); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-40, -8); ctx.lineTo(-48, -20); ctx.lineTo(-44, -20); ctx.lineTo(-36, -8); ctx.fill();

  const tr = h.rotor * 1.7;
  ctx.fillStyle = `rgba(40,40,40,${0.15 + spin * 0.2})`;
  ctx.beginPath(); ctx.arc(-44, -6, 8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(-44 + Math.cos(tr) * 8, -6 + Math.sin(tr) * 8); ctx.lineTo(-44 - Math.cos(tr) * 8, -6 - Math.sin(tr) * 8);
  ctx.stroke();

  ctx.fillStyle = '#d9443a';
  ctx.beginPath(); ctx.ellipse(0, 0, 22, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9fd3ee';
  ctx.beginPath(); ctx.ellipse(10, -2, 11, 8.5, 0, -Math.PI / 2, Math.PI / 2); ctx.lineTo(4, 6); ctx.lineTo(4, -10); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-12, -6, 12, 2);

  ctx.fillStyle = '#2b2f36'; ctx.fillRect(-2, -18, 4, 6);
  ctx.fillStyle = `rgba(30,30,30,${0.08 + spin * 0.18})`;
  ctx.beginPath(); ctx.ellipse(0, -17, 42, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  const L = 42 * Math.cos(h.rotor);
  ctx.strokeStyle = '#1f2227'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-L, -17); ctx.lineTo(L, -17); ctx.stroke();
  ctx.restore();

  const hp = game.hookPos();
  ctx.fillStyle = game.crate.attached ? '#ffd166' : '#555';
  ctx.beginPath(); ctx.arc(hp.x, hp.y, 2.5, 0, Math.PI * 2); ctx.fill();
}

function drawEffects(game: Game, ctx: CanvasRenderingContext2D) {
  for (const p of game.particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.c;
    ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.font = 'bold 16px system-ui,sans-serif';
  for (const f of game.floaters) {
    ctx.globalAlpha = clamp(f.life, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawHud(game: Game, ctx: CanvasRenderingContext2D, v: View, s: number) {
  const { w: W, h: H, dpr } = v;
  const { heli: h, crate, mission, time, cam } = game;
  const pads = game.world.pads;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pw = 176;
  roundRect(ctx, 12, 12, pw, 150, 10); ctx.fillStyle = 'rgba(8,14,24,0.62)'; ctx.fill();
  ctx.textAlign = 'left'; ctx.font = 'bold 15px system-ui,sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText(`점수 ${game.score}`, 24, 34);
  ctx.font = '12px system-ui,sans-serif'; ctx.fillStyle = '#9fb0c8';
  ctx.fillText(`배달 ${game.delivered} · 최고 ${game.best}`, 24, 51);

  const mtext = crate.dead ? '다음 임무 준비 중…'
    : crate.attached ? `배달: ${pads[mission.to].name} 패드`
    : `픽업: 화물 (${pads[mission.from].name} 근처)`;
  ctx.font = 'bold 13px system-ui,sans-serif'; ctx.fillStyle = crate.attached ? '#06d6a0' : '#ffd166';
  ctx.fillText(mtext, 24, 72);

  ctx.fillStyle = '#9fb0c8'; ctx.font = '12px system-ui,sans-serif'; ctx.fillText('연료', 24, 93);
  roundRect(ctx, 56, 84, 118, 11, 5); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
  const lowFuel = h.fuel < 25;
  if (h.fuel > 0) {
    roundRect(ctx, 56, 84, 118 * h.fuel / 100, 11, 5);
    ctx.fillStyle = lowFuel ? (Math.sin(time * 8) > 0 ? '#ef476f' : '#a33') : '#118ab2';
    ctx.fill();
  }

  const alt = Math.max(0, Math.round(game.ground(h.x) - h.y - SKID));
  const vy = Math.round(h.vy), vx = Math.round(h.vx);
  ctx.fillStyle = '#e8eef7'; ctx.font = '12px ui-monospace,Menlo,Consolas,monospace';
  ctx.fillText(`고도  ${String(alt).padStart(4)}`, 24, 115);
  ctx.fillStyle = vy > LAND_VY ? '#ef476f' : vy > LAND_VY * 0.7 ? '#ffd166' : '#e8eef7';
  ctx.fillText(`수직  ${String(vy).padStart(4)} ${vy > 5 ? '↓' : vy < -5 ? '↑' : ' '}`, 24, 132);
  ctx.fillStyle = Math.abs(vx) > LAND_VX ? '#ffd166' : '#e8eef7';
  ctx.fillText(`수평  ${String(vx).padStart(4)}`, 24, 149);

  ctx.save(); ctx.translate(152, 133); ctx.strokeStyle = Math.abs(h.a) > LAND_A ? '#ffd166' : '#8aa'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.rotate(h.a); ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.moveTo(0, 0); ctx.lineTo(0, -6); ctx.stroke();
  ctx.restore();

  const mw = Math.min(240, W - pw - 36), mx = W - mw - 12, my = 12, mh = 58;
  if (mw > 90) {
    roundRect(ctx, mx, my, mw, mh, 8); ctx.fillStyle = 'rgba(8,14,24,0.62)'; ctx.fill();
    const toX = (x: number) => mx + 6 + x / WORLD * (mw - 12);
    const toY = (y: number) => my + 8 + clamp((y - 50) / 1150, 0, 1) * (mh - 16);
    ctx.fillStyle = '#5f6f45'; ctx.beginPath(); ctx.moveTo(toX(0), my + mh - 4);
    game.world.miniPath.forEach((y, i) => ctx.lineTo(toX(i * 40), toY(y)));
    ctx.lineTo(toX(WORLD), my + mh - 4); ctx.fill();
    pads.forEach((p, i) => {
      ctx.fillStyle = i === mission.to && !crate.dead ? '#06d6a0' : p.base ? '#118ab2' : '#ccc';
      ctx.fillRect(toX(p.x) - 2, toY(p.y) - 4, 4, 4);
    });
    if (!crate.dead && !crate.attached) { ctx.fillStyle = '#ffd166'; ctx.fillRect(toX(crate.x) - 2, toY(crate.y) - 5, 4, 4); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(toX(h.x), toY(h.y), 3, 0, Math.PI * 2); ctx.fill();
  }

  const wx = mw > 90 ? mx + mw / 2 : W - 60, wy = my + mh + 18;
  ctx.fillStyle = '#cfe0f0'; ctx.font = '12px system-ui,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`바람 ${game.wind > 0 ? '→' : '←'} ${Math.abs(Math.round(game.wind))}`, wx, wy);

  if (h.alive && !crate.dead) {
    const tgt = crate.attached ? { x: pads[mission.to].x, y: pads[mission.to].y - 20 } : crate;
    const sx = W / 2 + (tgt.x - cam.x) * s, sy = H / 2 + (tgt.y - cam.y) * s;
    const m = 36, mb = v.touch ? 200 : m;
    if (sx < m || sx > W - m || sy < 180 || sy > H - mb) {
      const ang = Math.atan2(sy - H / 2, sx - W / 2);
      const ex = clamp(sx, m, W - m), ey = clamp(sy, 180, H - mb);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
      ctx.fillStyle = crate.attached ? '#06d6a0' : '#ffd166';
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.fill();
      ctx.restore();
      const dist = Math.round(Math.hypot(tgt.x - h.x, tgt.y - h.y) / 10);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui,sans-serif';
      ctx.fillText(`${dist}m`, clamp(ex - Math.cos(ang) * 26, 30, W - 30), clamp(ey - Math.sin(ang) * 26, 170, H - mb + 16));
    }
  }

  ctx.textAlign = 'center';
  if (h.alive && h.fuel <= 0) {
    ctx.fillStyle = '#ef476f'; ctx.font = 'bold 20px system-ui,sans-serif'; ctx.fillText('연료 없음!', W / 2, H * 0.3);
  } else if (h.alive && lowFuel && Math.sin(time * 6) > 0) {
    ctx.fillStyle = '#ef476f'; ctx.font = 'bold 16px system-ui,sans-serif'; ctx.fillText('연료 부족 — H 패드로', W / 2, H * 0.3);
  }
  if (game.crateInReach()) {
    ctx.fillStyle = '#ffd166'; ctx.font = 'bold 15px system-ui,sans-serif';
    ctx.fillText(v.touch ? '고리 버튼으로 화물 연결' : 'E 키로 화물 연결', W / 2, H * 0.3 + 26);
  }
  if (game.mode === 'crashed') {
    ctx.fillStyle = '#ef476f'; ctx.font = 'bold 22px system-ui,sans-serif'; ctx.fillText(game.crashReason, W / 2, H * 0.36);
  }
}
