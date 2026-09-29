import * as THREE from 'three';

export const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });

export const MAT = {
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

export function add<T extends THREE.Object3D>(g: THREE.Object3D, o: T): T { g.add(o); return o; }

export function box(g: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = add(g, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
  m.position.set(x, y, z);
  return m;
}

export function bar(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, t: number, mat: THREE.Material) {
  const m = add(g, new THREE.Mesh(new THREE.BoxGeometry(t, a.distanceTo(b), t), mat));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

export function tube(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, seg = 10) {
  const m = add(g, new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg), mat));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

export function quad(g: THREE.Object3D, pts: THREE.Vector3[], mat: THREE.Material) {
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  geo.setIndex(pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]);
  geo.computeVertexNormals();
  const uv = pts.length === 4 ? [0, 0, 1, 0, 1, 1, 0, 1] : [0, 0, 1, 0, 0.5, 1];
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return add(g, new THREE.Mesh(geo, mat));
}

export function taperBox(z0: number, z1: number, w0: number, h0: number, w1: number, h1: number, y0: number, y1: number, mat: THREE.Material) {
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

export function extrudeSide(points: [number, number][], thickness: number, mat: THREE.Material) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.y = -Math.PI / 2;
  return m;
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  if (typeof document === 'undefined') return new THREE.CanvasTexture(null as unknown as HTMLCanvasElement);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
