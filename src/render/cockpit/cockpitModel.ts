import * as THREE from 'three';
import { add, bar, box, canvasTex, lambert, MAT, quad, tube, v } from '../modelKit';

export interface Screens {
  mpdL: THREE.Mesh;
  mpdR: THREE.Mesh;
  eufd: THREE.Mesh;
  standby: THREE.Mesh;
}

export interface PilotParts {
  cyclic: THREE.Group;
  collective: THREE.Group;
  pedalL: THREE.Group;
  pedalR: THREE.Group;
  screens: Screens;
}

function consoleTexture(seed: number) {
  const labels = ['BATT', 'APU', 'GEN 1', 'GEN 2', 'NVS', 'FUEL XFER', 'BOOST', 'ANTI ICE', 'PITOT', 'EXT LT', 'FORM', 'NAV', 'IFF', 'VHF', 'UHF', 'FM 1', 'ENG 1', 'ENG 2', 'RTR BRK', 'CHOP'];
  return canvasTex(256, 512, g => {
    g.fillStyle = '#2b2f34'; g.fillRect(0, 0, 256, 512);
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let y = 8; y < 500; y += 84) {
      g.fillStyle = '#1e2124'; g.fillRect(8, y, 240, 76);
      g.strokeStyle = '#4a5058'; g.lineWidth = 2; g.strokeRect(8, y, 240, 76);
      for (let i = 0; i < 4; i++) {
        const x = 28 + i * 58;
        if (rnd() < 0.55) {
          g.fillStyle = '#9aa0a6'; g.beginPath(); g.arc(x + 10, y + 30, 7, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#d0d4d8'; g.fillRect(x + 8, y + 12 + (rnd() < 0.5 ? 0 : 18), 4, 16);
        } else {
          g.fillStyle = '#111'; g.beginPath(); g.arc(x + 10, y + 30, 11, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#c9ced3'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 10, y + 30); g.lineTo(x + 10 + Math.cos(rnd() * 6) * 10, y + 30 + Math.sin(rnd() * 6) * 10); g.stroke();
        }
        g.fillStyle = '#e8e2c8'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center';
        g.fillText(labels[Math.floor(rnd() * labels.length)], x + 10, y + 64);
      }
    }
  });
}

function bulkheadTexture() {
  return canvasTex(256, 256, g => {
    g.fillStyle = '#34383d'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#2a2d31'; g.lineWidth = 3;
    for (let i = 0; i <= 256; i += 32) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
    }
    g.fillStyle = '#4a4f55';
    for (let y = 16; y < 256; y += 32) for (let x = 16; x < 256; x += 32) { g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill(); }
  });
}

function stripes() {
  return canvasTex(64, 64, g => {
    g.fillStyle = '#d9b21e'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#111';
    for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 8, 0); g.lineTo(i + 72, 64); g.lineTo(i + 64, 64); g.fill(); }
  });
}

export function buildCanopy(g: THREE.Group) {
  const { frame, glass } = MAT;
  const T = 0.045;
  for (const s of [-1, 1]) {
    quad(g, [v(s * 0.55, -0.35, -3.4), v(s * 0.55, -0.35, -5.0), v(s * 0.32, 0.5, -4.95), v(s * 0.32, 0.72, -3.4)], glass);
    quad(g, [v(s * 0.55, -0.35, -5.0), v(s * 0.5, -0.3, -5.45), v(s * 0.32, 0.5, -4.95)], glass);
    bar(g, v(s * 0.55, -0.35, -3.4), v(s * 0.55, -0.35, -5.0), T, frame);
    bar(g, v(s * 0.32, 0.72, -3.4), v(s * 0.32, 0.5, -4.95), T, frame);
    bar(g, v(s * 0.55, -0.35, -5.0), v(s * 0.32, 0.5, -4.95), T, frame);
    bar(g, v(s * 0.55, -0.35, -4.2), v(s * 0.32, 0.61, -4.2), T * 0.8, frame);
    bar(g, v(s * 0.5, -0.3, -5.45), v(s * 0.32, 0.5, -4.95), T, frame);

    quad(g, [v(s * 0.6, 0.1, -3.4), v(s * 0.6, 0.1, -1.7), v(s * 0.35, 1.25, -1.7), v(s * 0.35, 1.25, -3.2)], glass);
    bar(g, v(s * 0.6, 0.1, -3.42), v(s * 0.6, 0.1, -1.7), T, frame);
    bar(g, v(s * 0.35, 1.25, -3.2), v(s * 0.35, 1.25, -1.7), 0.03, frame);
    bar(g, v(s * 0.6, 0.1, -3.4), v(s * 0.35, 1.25, -3.2), T * 1.2, frame);
    bar(g, v(s * 0.6, 0.1, -2.45), v(s * 0.35, 1.25, -2.45), T, frame);
    bar(g, v(s * 0.6, 0.1, -1.7), v(s * 0.35, 1.25, -1.7), T * 1.4, frame);
    bar(g, v(s * 0.55, -0.35, -3.4), v(s * 0.6, 0.1, -3.4), T, frame);
  }
  quad(g, [v(-0.32, 0.5, -4.95), v(0.32, 0.5, -4.95), v(0.5, -0.3, -5.45), v(-0.5, -0.3, -5.45)], glass);
  bar(g, v(0, 0.5, -4.95), v(0, -0.3, -5.45), T * 0.8, frame);
  bar(g, v(-0.5, -0.3, -5.45), v(0.5, -0.3, -5.45), T, frame);
  bar(g, v(-0.32, 0.5, -4.95), v(0.32, 0.5, -4.95), T, frame);
  quad(g, [v(-0.32, 0.72, -3.4), v(0.32, 0.72, -3.4), v(0.32, 0.5, -4.95), v(-0.32, 0.5, -4.95)], glass);
  bar(g, v(-0.32, 0.72, -3.4), v(0.32, 0.72, -3.4), T * 0.8, frame);

  quad(g, [v(-0.4, 0.55, -3.42), v(0.4, 0.55, -3.42), v(0.35, 1.25, -3.2), v(-0.35, 1.25, -3.2)], glass);
  quad(g, [v(-0.35, 1.25, -3.2), v(0.35, 1.25, -3.2), v(0.35, 1.25, -1.7), v(-0.35, 1.25, -1.7)], glass);
  bar(g, v(-0.35, 1.25, -3.2), v(0.35, 1.25, -3.2), 0.03, frame);
  bar(g, v(-0.35, 1.25, -2.45), v(0.35, 1.25, -2.45), 0.025, frame);
  bar(g, v(0, 1.25, -3.2), v(0, 1.25, -1.7), 0.02, frame);

  const handle = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), new THREE.MeshLambertMaterial({ map: stripes() })));
  handle.rotation.z = Math.PI / 2; handle.position.set(0, 1.2, -2.3);
}

export function buildPilotStation(g: THREE.Group): PilotParts {
  const { interior, interiorDark, black, frame, seat } = MAT;
  box(g, 1.16, 0.04, 1.72, interiorDark, 0, -0.32, -2.56);
  for (const s of [-1, 1]) {
    quad(g, [v(s * 0.595, -0.32, -3.4), v(s * 0.595, -0.32, -1.7), v(s * 0.595, 0.1, -1.7), v(s * 0.595, 0.1, -3.4)], interior);
    const con = box(g, 0.26, 0.3, 1.15, interiorDark, s * 0.46, -0.16, -2.35);
    const top = add(g, new THREE.Mesh(new THREE.PlaneGeometry(0.26, 1.15), new THREE.MeshLambertMaterial({ map: consoleTexture(s > 0 ? 7 : 3) })));
    top.rotation.x = -Math.PI / 2; top.position.set(s * 0.46, -0.005, -2.35);
    con.name = 'console';
    box(g, 0.05, 0.04, 1.7, frame, s * 0.59, 0.1, -2.55);
  }

  const bh = add(g, new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.57), new THREE.MeshLambertMaterial({ map: bulkheadTexture() })));
  bh.position.set(0, 0.465, -1.71); bh.rotation.y = Math.PI;
  const bhBack = box(g, 1.2, 1.57, 0.04, interiorDark, 0, 0.465, -1.68);
  bhBack.name = 'bulkhead';

  box(g, 0.5, 0.1, 0.48, seat, 0, 0.12, -2.45);
  box(g, 0.5, 0.85, 0.1, seat, 0, 0.6, -2.18);
  box(g, 0.34, 0.2, 0.08, seat, 0, 1.08, -2.18);
  for (const s of [-1, 1]) {
    box(g, 0.04, 0.55, 0.5, interior, s * 0.28, 0.35, -2.42);
    box(g, 0.06, 0.8, 0.02, lambert(0x6b6a45), s * 0.12, 0.62, -2.24);
  }
  box(g, 0.42, 0.42, 0.04, interiorDark, 0, -0.1, -3.36);
  for (const s of [-1, 1]) quad(g, [v(s * 0.3, -0.32, -3.35), v(s * 0.3, -0.32, -2.9), v(s * 0.3, 0.1, -3.2), v(s * 0.3, 0.1, -3.35)], interiorDark);

  const panel = new THREE.Group();
  panel.position.set(0, 0.3, -3.3);
  panel.rotation.x = -0.28;
  g.add(panel);
  box(panel, 1.0, 0.56, 0.08, frame, 0, 0, -0.05);
  box(panel, 1.04, 0.035, 0.22, black, 0, 0.29, 0.05);
  box(panel, 1.04, 0.05, 0.02, black, 0, 0.27, 0.16);
  const screens = {} as Screens;
  const scr = (w: number, h: number) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  for (const [key, x] of [['mpdL', -0.26], ['mpdR', 0.26]] as const) {
    box(panel, 0.34, 0.34, 0.04, interiorDark, x, 0.0, 0.0);
    const m = add(panel, scr(0.32, 0.32));
    m.position.set(x, 0.0, 0.021);
    screens[key] = m;
  }
  box(panel, 0.17, 0.1, 0.03, interiorDark, 0, 0.19, 0.0);
  screens.eufd = add(panel, scr(0.16, 0.09));
  screens.eufd.position.set(0, 0.19, 0.016);
  box(panel, 0.17, 0.22, 0.03, interiorDark, 0, 0.0, 0.0);
  screens.standby = add(panel, scr(0.16, 0.21));
  screens.standby.position.set(0, 0.0, 0.016);
  const ku = box(panel, 0.16, 0.08, 0.03, lambert(0x2f3338), 0, -0.19, 0.0);
  ku.name = 'ku';
  for (let i = 0; i < 12; i++) box(panel, 0.018, 0.014, 0.01, lambert(0xb9bdc2), -0.055 + (i % 6) * 0.022, -0.175 - Math.floor(i / 6) * 0.025, 0.02);
  const master = box(panel, 0.05, 0.03, 0.02, MAT.red, -0.43, 0.2, 0.0);
  master.name = 'masterCaution';
  box(panel, 0.05, 0.03, 0.02, MAT.yellow, 0.43, 0.2, 0.0);

  const cyclic = new THREE.Group();
  cyclic.position.set(0, -0.3, -2.8);
  const boot = add(cyclic, new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 10), MAT.rubber));
  boot.position.y = 0.06;
  const stick = add(cyclic, new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.5, 8), black));
  stick.position.y = 0.3;
  const grip = box(cyclic, 0.05, 0.13, 0.05, lambert(0x2c2c2c), 0, 0.6, 0);
  grip.rotation.x = 0.2;
  box(cyclic, 0.018, 0.014, 0.014, MAT.red, 0, 0.67, -0.03);
  box(cyclic, 0.014, 0.014, 0.014, lambert(0x777777), 0.018, 0.655, -0.03);
  box(cyclic, 0.03, 0.01, 0.03, lambert(0x777777), 0, 0.53, -0.035);
  g.add(cyclic);

  const collective = new THREE.Group();
  collective.position.set(-0.42, 0.02, -2.2);
  const lever = add(collective, new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.55, 8), black));
  lever.rotation.x = Math.PI / 2; lever.position.z = -0.275;
  const head = box(collective, 0.07, 0.07, 0.14, lambert(0x2c2c2c), 0, 0.02, -0.6);
  head.name = 'collectiveHead';
  box(collective, 0.02, 0.015, 0.02, MAT.yellow, 0.03, 0.06, -0.62);
  box(collective, 0.02, 0.015, 0.02, lambert(0x777777), -0.03, 0.06, -0.58);
  const throttle = add(collective, new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.12, 10), lambert(0x444444)));
  throttle.rotation.x = Math.PI / 2; throttle.position.z = -0.47;
  g.add(collective);

  const pedal = (x: number) => {
    const p = new THREE.Group();
    p.position.set(x, -0.2, -3.18);
    box(p, 0.03, 0.2, 0.03, MAT.metal, 0, 0.08, 0.04);
    box(p, 0.09, 0.14, 0.02, lambert(0x4d5157), 0, 0, 0);
    g.add(p);
    return p;
  };
  const pedalL = pedal(-0.16), pedalR = pedal(0.16);

  return { cyclic, collective, pedalL, pedalR, screens };
}

export function buildGunnerStation(g: THREE.Group) {
  const { interior, interiorDark, black, suit, helmet, seat } = MAT;
  box(g, 1.06, 0.04, 1.6, interiorDark, 0, -0.82, -4.25);
  for (const s of [-1, 1]) {
    quad(g, [v(s * 0.545, -0.82, -5.05), v(s * 0.545, -0.82, -3.4), v(s * 0.545, -0.35, -3.4), v(s * 0.545, -0.35, -5.05)], interior);
  }
  box(g, 1.1, 0.87, 0.04, interiorDark, 0, -0.385, -3.4);
  box(g, 1.0, 0.45, 0.3, MAT.frame, 0, -0.55, -5.05);
  const ort = box(g, 0.34, 0.22, 0.34, interiorDark, 0, -0.18, -4.78);
  ort.rotation.x = -0.2;
  box(g, 0.24, 0.1, 0.02, lambert(0x0f2a14), 0, -0.16, -4.6).rotation.x = -0.2;
  for (const s of [-1, 1]) {
    const h = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), black));
    h.position.set(s * 0.21, -0.25, -4.62);
  }
  box(g, 0.48, 0.8, 0.1, seat, 0, -0.2, -3.5);
  box(g, 0.3, 0.2, 0.08, seat, 0, 0.3, -3.5);

  box(g, 0.44, 0.48, 0.26, suit, 0, -0.08, -3.72);
  for (const s of [-1, 1]) {
    tube(g, v(s * 0.2, 0.08, -3.75), v(s * 0.2, -0.12, -4.25), 0.05, suit);
    tube(g, v(s * 0.2, -0.12, -4.25), v(s * 0.2, -0.22, -4.6), 0.045, suit);
  }
  const neck = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), lambert(0x8d6e5a)));
  neck.position.set(0, 0.22, -3.76);
  const hel = add(g, new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), helmet));
  hel.position.set(0, 0.38, -3.78); hel.scale.set(1, 1.05, 1.12);
  box(g, 0.2, 0.06, 0.05, lambert(0x121518), 0, 0.37, -3.93);
  box(g, 0.03, 0.03, 0.08, black, 0.09, 0.34, -3.95);
  tube(g, v(0.12, 0.3, -3.72), v(0.2, 0.05, -3.6), 0.012, black, 6);
}

export function buildCockpit(): PilotParts & { cockpit: THREE.Group } {
  const cockpit = new THREE.Group();
  buildCanopy(cockpit);
  buildGunnerStation(cockpit);
  return { cockpit, ...buildPilotStation(cockpit) };
}
