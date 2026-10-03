import { describe, expect, it } from 'vitest';
import { AssetLoader, type Fetchers } from './loader';
import type { AssetDef } from './manifest';

const defs: AssetDef[] = [
  { id: 'ok', kind: 'audio', path: 'audio/ok.mp3', group: 'boot' },
  { id: 'missing', kind: 'gltf', path: 'models/missing.glb', group: 'boot' },
  { id: 'later', kind: 'texture', path: 'textures/later.png', group: 'm01' },
];

function fakeFetchers(calls: string[]): Fetchers {
  const ok = async (url: string) => { calls.push(url); return `data:${url}`; };
  return {
    audio: ok,
    texture: ok,
    font: ok,
    gltf: async url => { calls.push(url); throw new Error(`404 ${url}`); },
  };
}

describe('AssetLoader', () => {
  it('records failures so callers fall back instead of crashing', async () => {
    const calls: string[] = [];
    const loader = new AssetLoader(fakeFetchers(calls), defs);
    const report = await loader.loadGroup('boot');
    expect(report.loaded).toEqual(['ok']);
    expect(report.failed).toEqual(['missing']);
    expect(loader.get('missing')).toBeUndefined();
    expect(loader.didFail('missing')).toBe(true);
    expect(loader.get<string>('ok')).toContain('assets/audio/ok.mp3');
  });

  it('only loads the requested group and reports monotonic progress to 1', async () => {
    const calls: string[] = [];
    const loader = new AssetLoader(fakeFetchers(calls), defs);
    const progress: number[] = [];
    await loader.loadGroup('boot', f => progress.push(f));
    expect(calls.some(c => c.includes('later'))).toBe(false);
    expect(progress[progress.length - 1]).toBe(1);
    for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
  });

  it('does not refetch cached or failed assets', async () => {
    const calls: string[] = [];
    const loader = new AssetLoader(fakeFetchers(calls), defs);
    await loader.loadGroup('boot');
    await loader.loadGroup('boot');
    expect(calls).toHaveLength(2);
  });

  it('fetches an asset once when two callers ask for its group at the same time', async () => {
    const calls: string[] = [];
    const loader = new AssetLoader(fakeFetchers(calls), defs);
    await Promise.all([loader.loadGroup('m01'), loader.loadGroup('m01')]);
    expect(calls.filter(c => c.includes('later'))).toHaveLength(1);
  });

  it('reports completion immediately for an empty group', async () => {
    const loader = new AssetLoader(fakeFetchers([]), defs);
    const progress: number[] = [];
    const report = await loader.loadGroup('nothing', f => progress.push(f));
    expect(report).toEqual({ loaded: [], failed: [] });
    expect(progress).toEqual([1]);
  });
});
