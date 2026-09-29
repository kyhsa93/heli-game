import { useEffect, useRef, useState } from 'react';
import { t } from '../../content/strings';
import { missionTerrain } from '../../sim/mission/runtime';
import type { MissionDef } from '../../sim/mission/schema';
import { Terrain } from '../../sim/terrain';
import { UNIT_DEFS } from '../../sim/units';

const THREAT_TYPES = new Set(['spaag', 'sam_short', 'sam_radar', 'aaa_light', 'manpads', 'technical']);

export function threatRadius(type: string) {
  const d = UNIT_DEFS[type];
  if (!d) return 0;
  return Math.min(6000, Math.max(0, ...d.weapons.map(w => w.range)));
}

function drawMap(cv: HTMLCanvasElement, m: MissionDef, terrain: Terrain) {
  const size = cv.width, g = cv.getContext('2d')!;
  const img = g.createImageData(size, size);
  const k = terrain.size / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = -terrain.half + (i + 0.5) * k, z = -terrain.half + (j + 0.5) * k;
      const h = terrain.heightAt(x, z), n = terrain.normalAt(x, z);
      const shade = 0.55 + 0.45 * Math.max(0, n.x * -0.5 + n.y * 0.7 + n.z * -0.5);
      let r: number, gg: number, b: number;
      if (h < 0) { r = 30; gg = 70; b = 100; } else {
        const tt = Math.min(1, h / 450);
        r = 60 + tt * 90; gg = 90 + tt * 60; b = 50 + tt * 70;
      }
      const o = (j * size + i) * 4;
      img.data[o] = r * shade; img.data[o + 1] = gg * shade; img.data[o + 2] = b * shade; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const px = (v: number) => (v + terrain.half) / k;
  g.lineWidth = 2; g.strokeStyle = '#c9a36a';
  for (const road of terrain.roads) { g.beginPath(); road.forEach(([x, z], i) => (i ? g.lineTo(px(x), px(z)) : g.moveTo(px(x), px(z)))); g.stroke(); }
  for (const u of m.units) {
    if (u.hidden || !THREAT_TYPES.has(u.type)) continue;
    const r = threatRadius(u.type) / k;
    g.strokeStyle = 'rgba(239, 71, 111, .8)'; g.fillStyle = 'rgba(239, 71, 111, .12)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(px(u.position[0]), px(u.position[1]), r, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  g.font = 'bold 13px "Karda Sans", sans-serif'; g.textAlign = 'left';
  for (const w of m.waypoints) {
    const x = px(w.position[0]), y = px(w.position[1]), bp = /^BP/i.test(w.name);
    g.fillStyle = bp ? '#4cc9f0' : '#ffd166';
    g.beginPath(); if (bp) g.rect(x - 4, y - 4, 8, 8); else g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
    g.fillText(w.name, x + 7, y + 4);
  }
  for (const f of m.farps) {
    const x = px(f.position[0]), y = px(f.position[1]);
    g.fillStyle = '#06d6a0';
    g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x - 7, y + 5); g.lineTo(x + 7, y + 5); g.closePath(); g.fill();
    g.fillText('FARP', x + 9, y + 4);
  }
}

export function MissionMap({ mission }: { mission: MissionDef }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      if (!alive || !ref.current) return;
      drawMap(ref.current, mission, new Terrain(mission.environment.seed, missionTerrain(mission)));
      setReady(true);
    }, 30);
    return () => { alive = false; clearTimeout(id); };
  }, [mission]);
  return (
    <div className="mission-map">
      <canvas ref={ref} width={360} height={360} />
      {!ready && <span className="map-wait">{t('briefing.mapLoading')}</span>}
    </div>
  );
}
