import * as THREE from 'three';
import { BLADES, EYE, GEAR_Y, ROTOR_R, ROTOR_Y } from '../sim/heli/airframe';

export interface Screens {
  mpdL: THREE.Mesh;
  mpdR: THREE.Mesh;
  eufd: THREE.Mesh;
  standby: THREE.Mesh;
}

export interface HeliModel {
  root: THREE.Group;
  shell: THREE.Group;
  cockpit: THREE.Group;
  rotor: THREE.Group;
  blades: THREE.Mesh[];
  disc: THREE.Mesh;
  tailRotor: THREE.Group;
  cyclic: THREE.Group;
  collective: THREE.Group;
  pedalL: THREE.Group;
  pedalR: THREE.Group;
  head: THREE.Group;
  screens: Screens;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });

const MAT = {
  olive: lambert(0x3d4632),
  oliveDark: lambert(0x2e3526),
  frame: lambert(0x23262a),
  interior: new THREE.MeshLambertMaterial({ color: 0x3a3f45, side: THREE.DoubleSide }),
  interiorDark: new THREE.MeshLambertMaterial({ color: 0x25292e, side: THREE.DoubleSide }),
  black: lambert(0x111214),
  rubber: lambert(0x1a1a1a),
  metal: lambert(0x8a9096),
  missile: lambert(0x5b6150),
  suit: lambert(0x4f5a3c),
  helmet: lambert(0x3c4034),
  seat: lambert(0x2b2f25),
  yellow: lambert(0xd9b21e),
  red: lambert(0xa3201a),
  glass: new THREE.MeshPhongMaterial({
    color: 0x9fbccc, transparent: true, opacity: 0.1, shininess: 120, specular: 0xffffff,
    depthWrite: false, side: THREE.DoubleSide,
  }),
};

function add<T extends THREE.Object3D>(g: THREE.Object3D, o: T): T { g.add(o); return o; }

function box(g: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = add(g, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
  m.position.set(x, y, z);
  return m;
}

function bar(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, t: number, mat: THREE.Material) {
  const m = add(g, new THREE.Mesh(new THREE.BoxGeometry(t, a.distanceTo(b), t), mat));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

function tube(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, seg = 10) {
  const m = add(g, new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg), mat));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

function quad(g: THREE.Object3D, pts: THREE.Vector3[], mat: THREE.Material) {
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  geo.setIndex(pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]);
  geo.computeVertexNormals();
  const uv = pts.length === 4 ? [0, 0, 1, 0, 1, 1, 0, 1] : [0, 0, 1, 0, 0.5, 1];
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return add(g, new THREE.Mesh(geo, mat));
}

function taperBox(z0: number, z1: number, w0: number, h0: number, w1: number, h1: number, y0: number, y1: number, mat: THREE.Material) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = p.getZ(i) + 0.5;
    const w = w0 + (w1 - w0) * t, h = h0 + (h1 - h0) * t, yc = y0 + (y1 - y0) * t;
    p.setXYZ(i, p.getX(i) * w, yc + p.getY(i) * h, z0 + (z1 - z0) * t);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function extrudeSide(points: [number, number][], thickness: number, mat: THREE.Material) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.y = -Math.PI / 2;
  return m;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
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

function buildExterior(root: THREE.Group) {
  const ext = new THREE.Group();
  root.add(ext);
  const { olive, oliveDark, black, metal, rubber, missile } = MAT;

  const nose = add(ext, taperBox(-6.55, -5.4, 0.55, 0.45, 1.0, 0.75, -0.62, -0.6, olive));
  nose.name = 'nose';
  const tads = add(ext, new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 18), oliveDark));
  tads.position.set(0, -0.72, -6.55);
  box(ext, 0.2, 0.26, 0.22, black, -0.3, -0.72, -6.6);
  box(ext, 0.2, 0.26, 0.22, black, 0.3, -0.72, -6.6);
  box(ext, 0.24, 0.12, 0.08, lambert(0x1c3a4a), 0, -0.68, -6.9);
  const pnvs = add(ext, new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), oliveDark));
  pnvs.position.set(0, -0.3, -6.45);

  for (const s of [-1, 1]) {
    box(ext, 0.42, 0.8, 3.95, olive, s * 0.78, -0.55, -1.35);
  }
  box(ext, 1.24, 2.05, 4.3, olive, 0, 0.02, 0.45);
  box(ext, 1.0, 0.5, 3.8, oliveDark, 0, 1.3, 0.3);
  tube(ext, v(0, 1.55, 0), v(0, ROTOR_Y - 0.15, 0), 0.16, metal);

  for (const s of [-1, 1]) {
    const nac = add(ext, new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 2.6, 16), olive));
    nac.rotation.x = Math.PI / 2; nac.position.set(s * 0.98, 0.95, 0.55);
    const intake = add(ext, new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), black));
    intake.position.set(s * 0.98, 0.95, -0.76); intake.rotation.y = Math.PI;
    const ex = box(ext, 0.5, 0.55, 0.8, oliveDark, s * 1.1, 0.95, 2.2);
    ex.rotation.y = s * 0.35;
    box(ext, 0.32, 0.38, 0.05, black, s * 1.25, 0.95, 2.58).rotation.y = s * 0.35;
  }

  add(ext, taperBox(2.6, 8.7, 0.95, 1.05, 0.38, 0.55, 0.3, 0.55, olive));
  const fin = add(ext, extrudeSide([[8.1, 0.4], [9.1, 0.4], [9.5, 2.55], [8.95, 2.55]], 0.14, olive));
  fin.position.x = 0;
  box(ext, 3.4, 0.07, 0.7, olive, 0, 0.1, 8.75);
  box(ext, 0.08, 0.35, 0.7, olive, -1.7, 0.2, 8.75);
  box(ext, 0.08, 0.35, 0.7, olive, 1.7, 0.2, 8.75);

  for (const s of [-1, 1]) {
    box(ext, 1.95, 0.1, 1.1, olive, s * 1.6, 0.35, 0.15);
    for (const [px, kind] of [[1.25, 'hellfire'], [2.1, 'rockets']] as const) {
      box(ext, 0.12, 0.35, 0.6, oliveDark, s * px, 0.13, 0.15);
      if (kind === 'hellfire') {
        box(ext, 0.62, 0.06, 1.55, oliveDark, s * px, -0.08, 0.15);
        for (const dx of [-0.17, 0.17]) {
          for (const dy of [-0.24, -0.5]) {
            const m = add(ext, new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.62, 10), missile));
            m.rotation.x = Math.PI / 2; m.position.set(s * px + dx, dy, 0.1);
            const tip = add(ext, new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), black));
            tip.rotation.x = -Math.PI / 2; tip.position.set(s * px + dx, dy, -0.71);
          }
        }
      } else {
        const pod = add(ext, new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 1.6, 16), oliveDark));
        pod.rotation.x = Math.PI / 2; pod.position.set(s * px, -0.2, 0.15);
        const face = add(ext, new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), black));
        face.position.set(s * px, -0.2, -0.66); face.rotation.y = Math.PI;
      }
    }
  }

  box(ext, 0.42, 0.26, 0.42, oliveDark, 0, -1.12, -3.25);
  tube(ext, v(0, -1.2, -3.3), v(0, -1.2, -5.0), 0.055, black);
  box(ext, 0.16, 0.16, 0.5, oliveDark, 0, -1.2, -3.7);

  for (const s of [-1, 1]) {
    bar(ext, v(s * 0.8, -0.9, -2.35), v(s * 1.15, -1.75, -2.35), 0.1, metal);
    bar(ext, v(s * 0.75, -0.8, -1.8), v(s * 1.15, -1.75, -2.35), 0.07, metal);
    const wheel = add(ext, new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.22, 18), rubber));
    wheel.rotation.z = Math.PI / 2; wheel.position.set(s * 1.2, GEAR_Y + 0.35, -2.35);
  }
  bar(ext, v(0, -0.2, 7.65), v(0, GEAR_Y + 0.2, 7.9), 0.08, metal);
  const tw = add(ext, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 14), rubber));
  tw.rotation.z = Math.PI / 2; tw.position.set(0, GEAR_Y + 0.2, 7.9);

  const dome = add(ext, new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 12), oliveDark));
  dome.scale.set(1, 0.42, 1); dome.position.set(0, ROTOR_Y + 0.55, 0);
  tube(ext, v(0, ROTOR_Y + 0.1, 0), v(0, ROTOR_Y + 0.45, 0), 0.12, metal);

  const tailRotor = new THREE.Group();
  tailRotor.position.set(-0.3, 2.05, 9.15);
  for (let i = 0; i < 4; i++) {
    const b = box(tailRotor, 0.03, 1.4, 0.2, MAT.frame, 0, 0, 0);
    b.geometry.translate(0, 0.7, 0);
    b.rotation.x = i * Math.PI / 2 + (i % 2) * 0.35;
  }
  ext.add(tailRotor);

  return { tailRotor };
}

function buildRotor(root: THREE.Group) {
  const rotor = new THREE.Group();
  rotor.position.set(0, ROTOR_Y, 0);
  root.add(rotor);
  box(rotor, 0.7, 0.18, 0.7, MAT.frame, 0, 0, 0);
  const blades: THREE.Mesh[] = [];
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x1f2226, transparent: true, opacity: 1 });
  for (let i = 0; i < BLADES; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(ROTOR_R - 0.3, 0.05, 0.53), bladeMat);
    b.geometry.translate((ROTOR_R - 0.3) / 2 + 0.3, 0, 0);
    b.rotation.y = i * Math.PI * 2 / BLADES;
    rotor.add(b); blades.push(b);
  }
  const disc = new THREE.Mesh(
    new THREE.RingGeometry(0.5, ROTOR_R, 64),
    new THREE.MeshBasicMaterial({ color: 0x151515, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = ROTOR_Y;
  root.add(disc);
  return { rotor, blades, disc };
}

function buildShell(root: THREE.Group) {
  const shell = new THREE.Group();
  root.add(shell);
  box(shell, 1.12, 0.65, 2.05, MAT.olive, 0, -0.675, -4.425);
  box(shell, 1.2, 1.1, 1.72, MAT.olive, 0, -0.45, -2.56);
  return shell;
}

function buildCanopy(g: THREE.Group) {
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

function buildPilotStation(g: THREE.Group) {
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

function buildGunnerStation(g: THREE.Group) {
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

export function buildHeli(): HeliModel {
  const root = new THREE.Group();
  const { tailRotor } = buildExterior(root);
  const { rotor, blades, disc } = buildRotor(root);
  const shell = buildShell(root);
  const cockpit = new THREE.Group();
  root.add(cockpit);
  buildCanopy(cockpit);
  buildGunnerStation(cockpit);
  const pilot = buildPilotStation(cockpit);
  const head = new THREE.Group();
  head.position.copy(EYE);
  root.add(head);
  return { root, shell, cockpit, rotor, blades, disc, tailRotor, head, ...pilot };
}
