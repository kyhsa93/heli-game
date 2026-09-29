import * as THREE from 'three';
import { BLADES, EYE, GEAR_Y, ROTOR_R, ROTOR_Y } from '../sim/heli/airframe';
import { PYLON_X, PYLONS, type Loadout, type PylonId } from '../sim/heli/loadout';
import { buildCockpit, type Screens } from './cockpit/cockpitModel';
import { add, bar, box, extrudeSide, lambert, MAT, mergeStatic, taperBox, tube, v } from './modelKit';

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
  stores: Record<PylonId, PylonStores>;
  stingers: THREE.Group[];
}

function buildExterior(root: THREE.Group) {
  const ext = new THREE.Group();
  root.add(ext);
  const { olive, oliveDark, black, metal, rubber } = MAT;

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

  for (const s of [-1, 1]) box(ext, 1.95, 0.1, 1.1, olive, s * 1.6, 0.35, 0.15);
  const stores = {} as Record<PylonId, PylonStores>;
  for (const id of PYLONS) stores[id] = buildPylon(ext, PYLON_X[id]);
  const stingers = [-1, 1].map(s => buildStingerLauncher(ext, s * 2.62));

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

  return { ext, tailRotor, stores, stingers };
}

export interface PylonStores { hellfire: THREE.Group; missiles: THREE.Object3D[]; pod: THREE.Group }

function buildPylon(ext: THREE.Group, x: number): PylonStores {
  const { oliveDark, black, missile } = MAT;
  box(ext, 0.12, 0.35, 0.6, oliveDark, x, 0.13, 0.15);
  const hellfire = add(ext, new THREE.Group());
  box(hellfire, 0.62, 0.06, 1.55, oliveDark, x, -0.08, 0.15);
  const missiles: THREE.Object3D[] = [];
  for (const dy of [-0.24, -0.5]) {
    for (const dx of [-0.17, 0.17]) {
      const m = add(hellfire, new THREE.Group());
      const body = add(m, new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.62, 10), missile));
      body.rotation.x = Math.PI / 2; body.position.set(x + dx, dy, 0.1);
      const tip = add(m, new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), black));
      tip.rotation.x = -Math.PI / 2; tip.position.set(x + dx, dy, -0.71);
      missiles.push(m);
    }
  }
  const pod = add(ext, new THREE.Group());
  const tube = add(pod, new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 1.6, 16), oliveDark));
  tube.rotation.x = Math.PI / 2; tube.position.set(x, -0.2, 0.15);
  const face = add(pod, new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), black));
  face.position.set(x, -0.2, -0.66); face.rotation.y = Math.PI;
  return { hellfire, missiles, pod };
}

function buildStingerLauncher(ext: THREE.Group, x: number) {
  const g = add(ext, new THREE.Group());
  box(g, 0.08, 0.2, 0.5, MAT.oliveDark, x, 0.3, 0.15);
  for (const dy of [0.2, 0.42]) {
    const m = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8), MAT.missile));
    m.rotation.x = Math.PI / 2; m.position.set(x, dy, 0.1);
  }
  return g;
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

export function buildHeliExterior(): THREE.Group {
  const root = new THREE.Group();
  buildExterior(root);
  const { disc } = buildRotor(root);
  root.remove(disc);
  return root;
}

export function buildHeli(): HeliModel {
  const root = new THREE.Group();
  const { ext, tailRotor, stores, stingers } = buildExterior(root);
  const { rotor, blades, disc } = buildRotor(root);
  const shell = buildShell(root);
  const parts = buildCockpit();
  root.add(parts.cockpit);
  mergeStatic(ext, [tailRotor, ...Object.values(stores).flatMap(st => [st.hellfire, st.pod]), ...stingers]);
  mergeStatic(parts.cockpit, [parts.cyclic, parts.collective, parts.pedalL, parts.pedalR, ...Object.values(parts.screens)]);
  const head = new THREE.Group();
  head.position.copy(EYE);
  root.add(head);
  return { root, shell, rotor, blades, disc, tailRotor, head, stores, stingers, ...parts };
}

export function applyLoadout(model: HeliModel, lo: Loadout) {
  for (const id of PYLONS) {
    const st = model.stores[id], store = lo.def.pylons[id];
    const hellfire = store === 'agm114k' || store === 'agm114l';
    st.hellfire.visible = hellfire;
    st.pod.visible = store === 'hydra70';
    st.missiles.forEach((m, i) => { m.visible = hellfire && i < lo.rounds[id]; });
  }
  model.stingers.forEach(g => { g.visible = lo.def.stingers; });
}
