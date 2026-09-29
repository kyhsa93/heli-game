import { describe, expect, it, vi } from 'vitest';
import code from '../public/sw.js?raw';

type Listener = (event: any) => void;

function loadWorker() {
  const listeners: Record<string, Listener> = {};
  const fetchMock = vi.fn(async () => new Response('ok'));
  const cachesMock = { keys: vi.fn(async () => ['old-shell', 'old-assets']), delete: vi.fn(async () => true) };
  const self = {
    location: { origin: 'https://kyhsa93.github.io' },
    addEventListener: (type: string, fn: Listener) => { listeners[type] = fn; },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => {}) },
  };
  new Function('self', 'fetch', 'caches', code)(self, fetchMock, cachesMock);
  const dispatchFetch = (request: { url: string; method?: string; mode?: string }) => {
    let responded: Promise<Response> | undefined;
    listeners.fetch({ request: { method: 'GET', mode: 'cors', ...request }, respondWith: (p: Promise<Response>) => { responded = p; } });
    return responded;
  };
  return { listeners, fetchMock, cachesMock, self, dispatchFetch };
}

describe('service worker', () => {
  it('always fetches page navigations from the network, bypassing the HTTP cache', async () => {
    const { fetchMock, dispatchFetch } = loadWorker();
    const res = dispatchFetch({ url: 'https://kyhsa93.github.io/heli-game/', mode: 'navigate' });
    expect(res).toBeDefined();
    await res;
    expect(fetchMock).toHaveBeenCalledWith('https://kyhsa93.github.io/heli-game/', expect.objectContaining({ cache: 'no-store' }));
  });

  it('bypasses the cache for same-origin assets too', async () => {
    const { fetchMock, dispatchFetch } = loadWorker();
    const req = { url: 'https://kyhsa93.github.io/heli-game/assets/index.js' };
    await dispatchFetch(req);
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining(req), { cache: 'no-store' });
  });

  it('leaves cross-origin and non-GET requests alone', () => {
    const { fetchMock, dispatchFetch } = loadWorker();
    expect(dispatchFetch({ url: 'https://fonts.example.com/a.woff2' })).toBeUndefined();
    expect(dispatchFetch({ url: 'https://kyhsa93.github.io/heli-game/x', method: 'POST' })).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('activates immediately and deletes any existing caches', async () => {
    const { listeners, self, cachesMock } = loadWorker();
    listeners.install({});
    expect(self.skipWaiting).toHaveBeenCalled();
    let done: Promise<void> | undefined;
    listeners.activate({ waitUntil: (p: Promise<void>) => { done = p; } });
    await done;
    expect(cachesMock.delete).toHaveBeenCalledWith('old-shell');
    expect(cachesMock.delete).toHaveBeenCalledWith('old-assets');
    expect(self.clients.claim).toHaveBeenCalled();
  });
});
