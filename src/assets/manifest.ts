export type AssetKind = 'gltf' | 'audio' | 'texture' | 'font';

export interface AssetDef {
  id: string;
  kind: AssetKind;
  path: string;
  group: string;
  fontFamily?: string;
}

export const BOOT_GROUP = 'boot';
export const BOOT_BUDGET_BYTES = 600 * 1024;
export const MISSION_BUDGET_BYTES = 1024 * 1024;

export const ASSETS: AssetDef[] = [];

export function assetUrl(path: string) {
  return `${import.meta.env.BASE_URL}assets/${path}`;
}
