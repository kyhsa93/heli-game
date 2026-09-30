import { describe, expect, it } from 'vitest';
import { ADS_FOV, ADS_POS, ADS_TIME, fovFor, HIP_FOV, HIP_POS, Viewmodel } from './viewmodel';

describe('first-person viewmodel (wiki 12.6)', () => {
  it('eases between 80 deg hip and 55 deg aim in 0.2 s', () => {
    const v = new Viewmodel();
    v.update(0.016, false, 16 / 9, 0, 0);
    expect(v.camera.fov).toBe(HIP_FOV);
    expect(v.gun.position.distanceTo(HIP_POS)).toBeLessThan(1e-6);
    for (let t = 0; t < ADS_TIME / 2; t += 0.01) v.update(0.01, true, 16 / 9, 0, 0);
    expect(v.camera.fov).toBeGreaterThan(ADS_FOV);
    expect(v.camera.fov).toBeLessThan(HIP_FOV);
    for (let t = 0; t < ADS_TIME; t += 0.01) v.update(0.01, true, 16 / 9, 0, 0);
    expect(v.camera.fov).toBe(ADS_FOV);
    expect(v.gun.position.distanceTo(ADS_POS)).toBeLessThan(1e-6);
    expect(fovFor(0.5)).toBeCloseTo((HIP_FOV + ADS_FOV) / 2);
    v.dispose();
  });

  it('lives in its own scene with its own near plane so it is drawn over walls', () => {
    const v = new Viewmodel();
    expect(v.gun.parent).toBe(v.scene);
    expect(v.camera.near).toBeLessThan(0.05);
    let meshes = 0;
    v.gun.traverse(o => { if ((o as { isMesh?: boolean }).isMesh) meshes++; });
    expect(meshes).toBeGreaterThan(4);
    v.dispose();
  });
});
