import * as THREE from 'three';
import type { TimeOfDay } from '../sim/ai/awareness';

export interface TimePreset {
  sun: [number, number, number];
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  sky: boolean;
  rayleigh: number;
  turbidity: number;
  stars: number;
  panelLight: number;
}

export const TIME_PRESETS: Record<TimeOfDay, TimePreset> = {
  day: { sun: [0.45, 0.8, 0.35], sunColor: 0xfff1d6, sunIntensity: 2.2, hemiSky: 0xcfe4ff, hemiGround: 0x4a4030, hemiIntensity: 1.1, fog: 0xbcd6ea, fogNear: 500, fogFar: 3600, sky: true, rayleigh: 1.2, turbidity: 2.5, stars: 0, panelLight: 0 },
  dusk: { sun: [-0.93, 0.1, 0.35], sunColor: 0xff9447, sunIntensity: 1.5, hemiSky: 0x8f86a8, hemiGround: 0x3a2a22, hemiIntensity: 0.65, fog: 0xc98f6a, fogNear: 400, fogFar: 3200, sky: true, rayleigh: 2.6, turbidity: 6, stars: 0, panelLight: 0.35 },
  dawn: { sun: [0.9, 0.13, -0.42], sunColor: 0xffb57a, sunIntensity: 1.3, hemiSky: 0xa6b4cf, hemiGround: 0x363028, hemiIntensity: 0.7, fog: 0xc7b3a6, fogNear: 300, fogFar: 2800, sky: true, rayleigh: 2.2, turbidity: 5, stars: 0, panelLight: 0.25 },
  night: { sun: [0.3, 0.6, -0.5], sunColor: 0x8ea6d8, sunIntensity: 0.1, hemiSky: 0x1b2440, hemiGround: 0x070707, hemiIntensity: 0.1, fog: 0x04060b, fogNear: 150, fogFar: 2000, sky: false, rayleigh: 0, turbidity: 0, stars: 1, panelLight: 1 },
};

export function starField(count = 1400, radius = 4200, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const y = 0.05 + rnd() * 0.95, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r * radius, y * radius, Math.sin(a) * r * radius], i * 3);
    const b = 0.35 + rnd() * 0.65;
    col.set([b, b, b * (0.9 + rnd() * 0.2)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
  stars.renderOrder = -1;
  stars.visible = false;
  return stars;
}
