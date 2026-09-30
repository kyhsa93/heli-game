import { describe, expect, it } from 'vitest';
import { Flags, FLAG_SIZE, POLE_HEIGHT, type FlagPoint } from './flags';

describe('flag poles (wiki 3.3)', () => {
  it('flies a square for the coalition, a triangle for the VPA, nothing when neutral, raised by the capture value', () => {
    const pts: FlagPoint[] = [
      { id: 'A', x: 0, z: 0, owner: 'coalition', v: 100 },
      { id: 'D', x: 50, z: 0, owner: 'neutral', v: 0 },
      { id: 'G', x: 100, z: 0, owner: 'veros', v: -50 },
    ];
    const f = new Flags(pts, () => 10);
    expect(f.flagHeight(0)).toBeCloseTo(10 + POLE_HEIGHT);
    expect(f.flagHeight(1)).toBe(null);
    expect(f.flagHeight(2)).toBeCloseTo(10 + FLAG_SIZE[1] + (POLE_HEIGHT - FLAG_SIZE[1]) * 0.5);
    pts[1].v = 30;
    f.update(pts, () => 10);
    expect(f.flagHeight(1)).toBeGreaterThan(10 + FLAG_SIZE[1]);
    expect(f.group.children.length).toBe(9);
    f.dispose();
  });
});
