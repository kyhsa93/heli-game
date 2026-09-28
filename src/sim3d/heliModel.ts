import * as THREE from 'three';
import { EYE, ROTOR_R, SKID_Y } from './sim';

export interface HeliModel {
  root: THREE.Group;
  exterior: THREE.Group;
  cockpit: THREE.Group;
  rotor: THREE.Group;
  blades: THREE.Mesh[];
  disc: THREE.Mesh;
  tailRotor: THREE.Group;
  cyclic: THREE.Group;
  collective: THREE.Group;
  pedalL: THREE.Mesh;
  pedalR: THREE.Mesh;
  head: THREE.Group;
  panel: THREE.Mesh;
}

function bar(a: THREE.Vector3, b: THREE.Vector3, t: number, mat: THREE.Material) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(t, len, t), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function buildExterior(paint: THREE.Material, dark: THREE.Material) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), paint);
  body.scale.set(0.95, 1.05, 2.05);
  body.position.set(0, 0.15, -0.45);
  g.add(body);
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshPhongMaterial({ color: 0x9fd3ee, transparent: true, opacity: 0.55, shininess: 90 }),
  );
  glass.scale.set(0.9, 0.95, 1.2);
  glass.rotation.x = -Math.PI / 2 + 0.5;
  glass.position.set(0, 0.35, -1.3);
  g.add(glass);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.26, 4.6, 12), paint);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0.35, 3.4);
  g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.7), paint);
  fin.position.set(0, 0.9, 5.6); fin.rotation.x = -0.35;
  g.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.45), paint);
  stab.position.set(0, 0.4, 4.6);
  g.add(stab);
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 1.6), dark);
  engine.position.set(0, 1.05, 0.5);
  g.add(engine);
  return g;
}

function buildSkids(dark: THREE.Material) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    g.add(bar(v(sx, SKID_Y, -1.9), v(sx, SKID_Y, 1.4), 0.09, dark));
    g.add(bar(v(sx, SKID_Y, -1.9), v(sx, SKID_Y + 0.25, -2.25), 0.09, dark));
    g.add(bar(v(sx, SKID_Y, -0.9), v(sx * 0.55, -0.55, -0.9), 0.08, dark));
    g.add(bar(v(sx, SKID_Y, 0.7), v(sx * 0.55, -0.55, 0.7), 0.08, dark));
  }
  return g;
}

function buildRotor(dark: THREE.Material) {
  const rotor = new THREE.Group();
  rotor.position.set(0, 1.35, 0);
  rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5), dark));
  const blades: THREE.Mesh[] = [];
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x1d1f24, transparent: true, opacity: 1 });
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(ROTOR_R, 0.04, 0.3), bladeMat);
    b.position.set(s * ROTOR_R / 2, 0.22, 0);
    rotor.add(b); blades.push(b);
  }
  const disc = new THREE.Mesh(
    new THREE.RingGeometry(0.4, ROTOR_R, 48),
    new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 1.57;
  return { rotor, blades, disc };
}

function buildTailRotor(dark: THREE.Material) {
  const tr = new THREE.Group();
  tr.position.set(0.18, 0.95, 5.75);
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.75, 0.1), dark);
    b.position.y = s * 0.375;
    tr.add(b);
  }
  return tr;
}

function buildCockpit(): Omit<HeliModel, 'root' | 'exterior' | 'rotor' | 'blades' | 'disc' | 'tailRotor' | 'head'> {
  const g = new THREE.Group();
  const frame = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x3a3e46 });
  const black = new THREE.MeshLambertMaterial({ color: 0x121316 });

  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.45), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  panel.position.set(0.18, -0.16, -1.46);
  panel.rotation.x = -0.32;
  g.add(panel);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.3), frame);
  back.position.set(0.18, -0.2, -1.66);
  back.rotation.x = -0.32;
  g.add(back);
  const glare = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.04, 0.26), frame);
  glare.position.set(0.18, 0.08, -1.52);
  g.add(glare);
  const console_ = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.7), trim);
  console_.position.set(0, -0.55, -1.2);
  g.add(console_);

  g.add(bar(v(0, 0.08, -1.6), v(0, 1.18, -0.92), 0.05, frame));
  for (const sx of [-1, 1]) {
    g.add(bar(v(sx * 0.84, 0.05, -1.5), v(sx * 0.84, 1.18, -0.88), 0.06, frame));
    g.add(bar(v(sx * 0.86, -0.78, -0.12), v(sx * 0.86, 1.18, -0.12), 0.08, frame));
    g.add(bar(v(sx * 0.86, -0.3, -1.45), v(sx * 0.86, -0.3, 0.4), 0.05, frame));
    g.add(bar(v(sx * 0.84, 0.05, -1.5), v(sx * 0.6, -0.78, -2.0), 0.04, frame));
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 1.9), trim);
    door.position.set(sx * 0.87, -0.55, -0.55);
    g.add(door);
  }
  g.add(bar(v(-0.86, 1.18, -0.9), v(0.86, 1.18, -0.9), 0.08, frame));
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.5), frame);
  roof.position.set(0, 1.22, -0.15);
  g.add(roof);
  const overhead = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.8), black);
  overhead.position.set(0, 1.14, -0.3);
  g.add(overhead);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 1.4), trim);
  floor.position.set(0, -0.8, -0.2);
  g.add(floor);
  g.add(bar(v(0, -0.8, -0.9), v(0, -0.6, -2.0), 0.05, frame));

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), black);
  seat.position.set(-0.42, -0.35, 0.05);
  g.add(seat);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.1), black);
  seatBack.position.set(-0.42, 0.05, 0.32);
  g.add(seatBack);

  for (const sx of [-1, 1]) {
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.84, 1.0),
      new THREE.MeshBasicMaterial({ color: 0x88aacc, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }),
    );
    pane.position.set(sx * 0.42, 0.68, -1.27);
    pane.rotation.x = -0.55;
    g.add(pane);
  }

  const cyclic = new THREE.Group();
  cyclic.position.set(EYE.x, -0.78, -1.0);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.62), black);
  stick.position.y = 0.31;
  cyclic.add(stick);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14), frame);
  grip.position.y = 0.66;
  cyclic.add(grip);
  g.add(cyclic);

  const collective = new THREE.Group();
  collective.position.set(0.05, -0.6, -0.35);
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6), black);
  lever.rotation.x = Math.PI / 2; lever.position.z = -0.3;
  collective.add(lever);
  const throttle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14), frame);
  throttle.rotation.x = Math.PI / 2; throttle.position.z = -0.62;
  collective.add(throttle);
  g.add(collective);

  const pedalMat = new THREE.MeshLambertMaterial({ color: 0x55595f });
  const pedalL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.03), pedalMat);
  const pedalR = pedalL.clone();
  pedalL.position.set(EYE.x - 0.15, -0.68, -1.55);
  pedalR.position.set(EYE.x + 0.15, -0.68, -1.55);
  g.add(pedalL, pedalR);

  return { cockpit: g, cyclic, collective, pedalL, pedalR, panel };
}

export function buildHeli(): HeliModel {
  const root = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  const dark = new THREE.MeshLambertMaterial({ color: 0x24272c });
  const exterior = buildExterior(paint, dark);
  root.add(exterior);
  root.add(buildSkids(dark));
  const { rotor, blades, disc } = buildRotor(dark);
  root.add(rotor, disc);
  const tailRotor = buildTailRotor(dark);
  exterior.add(tailRotor);
  const parts = buildCockpit();
  root.add(parts.cockpit);
  const head = new THREE.Group();
  head.position.copy(EYE);
  root.add(head);
  return { root, exterior, rotor, blades, disc, tailRotor, head, ...parts };
}
