import { describe, expect, it } from 'vitest';
import { SETTLE_MS, watchViewport } from './viewport';

function fakeWindow() {
  const listeners = new Map<string, Set<() => void>>();
  const vv = new Set<() => void>();
  const scrolls: [number, number][] = [];
  return {
    listeners, vv, scrolls,
    addEventListener: (t: string, f: () => void) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t)!.add(f); },
    removeEventListener: (t: string, f: () => void) => listeners.get(t)?.delete(f),
    scrollTo: (x: number, y: number) => { scrolls.push([x, y]); },
    visualViewport: { addEventListener: (_t: string, f: () => void) => vv.add(f), removeEventListener: (_t: string, f: () => void) => vv.delete(f) },
  };
}

describe('viewport watcher (#85)', () => {
  it('snaps the page back to the origin and re-measures now and after the rotation settles', () => {
    const w = fakeWindow();
    const later: [() => void, number][] = [];
    let calls = 0;
    const stop = watchViewport(() => { calls++; }, w as never, (fn, ms) => later.push([fn, ms]));
    for (const f of w.listeners.get('orientationchange')!) f();
    expect(calls).toBe(1);
    expect(w.scrolls).toEqual([[0, 0]]);
    expect(later.map(([, ms]) => ms)).toEqual([SETTLE_MS]);
    later[0][0]();
    expect(calls).toBe(2);
    for (const f of w.vv) f();
    for (const f of w.listeners.get('resize')!) f();
    expect(calls).toBe(4);
    stop();
    expect(w.listeners.get('resize')!.size + w.listeners.get('orientationchange')!.size + w.vv.size).toBe(0);
  });
});
