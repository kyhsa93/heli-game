import { describe, expect, it } from 'vitest';
import { EventBus } from './events';
import { Grid } from './grid';
import { rng, wrapDeg360, wrapPi } from './math';

type Ev = { t: 'hit'; n: number } | { t: 'miss' };

describe('EventBus', () => {
  it('delivers nothing until flush, then everything in order', () => {
    const bus = new EventBus<Ev>();
    const seen: string[] = [];
    bus.on('hit', e => seen.push(`hit${e.n}`));
    bus.on('miss', () => seen.push('miss'));
    bus.emit({ t: 'hit', n: 1 });
    bus.emit({ t: 'miss' });
    bus.emit({ t: 'hit', n: 2 });
    expect(seen).toEqual([]);
    expect(bus.pending).toBe(3);
    bus.flush();
    expect(seen).toEqual(['hit1', 'miss', 'hit2']);
    expect(bus.pending).toBe(0);
  });

  it('stops calling a handler after off', () => {
    const bus = new EventBus<Ev>();
    let count = 0;
    const off = bus.on('miss', () => { count++; });
    bus.emit({ t: 'miss' }); bus.flush();
    off();
    bus.emit({ t: 'miss' }); bus.flush();
    expect(count).toBe(1);
  });

  it('events emitted during flush wait for the next flush', () => {
    const bus = new EventBus<Ev>();
    const seen: number[] = [];
    bus.on('hit', e => { seen.push(e.n); if (e.n === 1) bus.emit({ t: 'hit', n: 2 }); });
    bus.emit({ t: 'hit', n: 1 });
    bus.flush();
    expect(seen).toEqual([1]);
    bus.flush();
    expect(seen).toEqual([1, 2]);
  });

  it('onAny sees every event', () => {
    const bus = new EventBus<Ev>();
    const types: string[] = [];
    bus.onAny(e => types.push(e.t));
    bus.emit({ t: 'miss' }); bus.emit({ t: 'hit', n: 0 }); bus.flush();
    expect(types).toEqual(['miss', 'hit']);
  });
});

describe('Grid', () => {
  const pts = [{ x: 0, z: 0 }, { x: 99, z: 0 }, { x: 101, z: 0 }, { x: -250, z: 40 }, { x: 60, z: 80 }];

  it('finds items across cell boundaries and excludes items outside the radius', () => {
    const g = new Grid<typeof pts[number]>(100);
    g.rebuild(pts);
    const found = g.query(50, 0, 60).map(p => p.x).sort((a, b) => a - b);
    expect(found).toEqual([0, 99, 101]);
    expect(g.query(50, 0, 49).map(p => p.x)).toEqual([99]);
  });

  it('handles negative coordinates and matches a brute-force search', () => {
    const r = rng(3);
    const items = Array.from({ length: 500 }, () => ({ x: (r() - 0.5) * 4000, z: (r() - 0.5) * 4000 }));
    const g = new Grid<typeof items[number]>(50);
    g.rebuild(items);
    for (let k = 0; k < 20; k++) {
      const x = (r() - 0.5) * 4000, z = (r() - 0.5) * 4000, rad = r() * 300;
      const brute = items.filter(p => Math.hypot(p.x - x, p.z - z) <= rad).length;
      expect(g.query(x, z, rad).length).toBe(brute);
    }
  });
});

describe('math', () => {
  it('wraps angles', () => {
    expect(wrapPi(Math.PI * 3)).toBeCloseTo(-Math.PI);
    expect(wrapPi(-Math.PI * 0.5)).toBeCloseTo(-Math.PI * 0.5);
    expect(wrapDeg360(-30)).toBe(330);
    expect(wrapDeg360(725)).toBe(5);
  });
});
