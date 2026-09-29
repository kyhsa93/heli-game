import { SRGBColorSpace, TextureLoader } from 'three';
import { ASSETS, assetUrl, type AssetDef, type AssetKind } from './manifest';

export type Fetcher = (url: string, def: AssetDef) => Promise<unknown>;
export type Fetchers = Record<AssetKind, Fetcher>;

export interface LoadReport { loaded: string[]; failed: string[] }

export const defaultFetchers: Fetchers = {
  async gltf(url) {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    ]);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    return loader.loadAsync(url);
  },
  async audio(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.arrayBuffer();
  },
  async texture(url) {
    const tex = await new TextureLoader().loadAsync(url);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  },
  async font(url, def) {
    const face = new FontFace(def.fontFamily ?? def.id, `url(${url})`, def.fontWeight ? { weight: def.fontWeight } : {});
    await face.load();
    document.fonts.add(face);
    return face;
  },
};

export class AssetLoader {
  private cache = new Map<string, unknown>();
  private failed = new Set<string>();

  constructor(private readonly fetchers: Fetchers = defaultFetchers, private readonly defs: AssetDef[] = ASSETS) {}

  async loadGroup(group: string, onProgress?: (fraction: number) => void): Promise<LoadReport> {
    const todo = this.defs.filter(d => d.group === group);
    const report: LoadReport = { loaded: [], failed: [] };
    let done = 0;
    onProgress?.(todo.length ? 0 : 1);
    await Promise.all(todo.map(async def => {
      if (!this.cache.has(def.id) && !this.failed.has(def.id)) {
        try {
          this.cache.set(def.id, await this.fetchers[def.kind](assetUrl(def.path), def));
        } catch {
          this.failed.add(def.id);
        }
      }
      (this.cache.has(def.id) ? report.loaded : report.failed).push(def.id);
      onProgress?.(++done / todo.length);
    }));
    return report;
  }

  get<T>(id: string): T | undefined {
    return this.cache.get(id) as T | undefined;
  }

  didFail(id: string) {
    return this.failed.has(id);
  }
}

export const assets = new AssetLoader();
