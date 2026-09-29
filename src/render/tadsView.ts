import * as THREE from 'three';
import { tadsDirection, tadsFovDeg, tadsPosition, type Tads } from '../sim/sensors/tads';
import type { HeliState } from '../sim/heli/state';

const VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = `
uniform sampler2D tImage;
uniform float flir;
uniform float time;
uniform vec2 res;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tImage, vUv).rgb;
  float l = pow(clamp(dot(c, vec3(0.299, 0.587, 0.114)), 0.0, 1.0), 1.0 / 2.2);
  float v;
  if (flir > 0.5) {
    float heat = clamp((c.r - max(c.g, c.b)) * 1.6, 0.0, 1.0);
    v = 0.1 + 0.32 * l;
    if (heat > 0.05) v = max(v, 0.55 + 0.45 * heat);
  } else {
    v = clamp((l - 0.5) * 1.4 + 0.5, 0.0, 1.0);
  }
  vec2 px = floor(vUv * res);
  v += (hash(px + fract(time) * 91.0) - 0.5) * 0.07;
  v *= 0.93 + 0.07 * sin(vUv.y * res.y * 3.14159);
  float vig = smoothstep(1.25, 0.55, length(vUv - 0.5) * 1.6);
  gl_FragColor = vec4(vec3(v * vig), 1.0);
}
`;

export class TadsView {
  readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 9000);
  private target = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true });
  private post: THREE.ShaderMaterial;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private dir = new THREE.Vector3();

  constructor() {
    this.post = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: { tImage: { value: this.target.texture }, flir: { value: 0 }, time: { value: 0 }, res: { value: new THREE.Vector2(2, 2) } },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);
  }

  setSize(w: number, h: number) {
    const tw = Math.max(2, Math.round(w / 2)), th = Math.max(2, Math.round(h / 2));
    this.target.setSize(tw, th);
    (this.post.uniforms.res.value as THREE.Vector2).set(tw, th);
    this.camera.aspect = w / Math.max(1, h);
  }

  aim(h: HeliState, t: Tads) {
    tadsPosition(h, this.camera.position);
    tadsDirection(t, this.dir);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.dir.add(this.camera.position));
    const fovH = tadsFovDeg(t) * Math.PI / 180;
    this.camera.fov = 2 * Math.atan(Math.tan(fovH / 2) / this.camera.aspect) * 180 / Math.PI;
    this.camera.updateProjectionMatrix();
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, t: Tads, time: number, output: THREE.WebGLRenderTarget | null = null) {
    this.post.uniforms.flir.value = t.sensor === 'flir' ? 1 : 0;
    this.post.uniforms.time.value = time;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, this.camera);
    renderer.setRenderTarget(output);
    renderer.render(this.postScene, this.postCam);
    renderer.setRenderTarget(null);
  }

  dispose() {
    this.target.dispose();
    this.post.dispose();
    (this.postScene.children[0] as THREE.Mesh).geometry.dispose();
  }
}
