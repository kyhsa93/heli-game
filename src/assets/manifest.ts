export type AssetKind = 'gltf' | 'audio' | 'texture' | 'font';

export interface AssetDef {
  id: string;
  kind: AssetKind;
  path: string;
  group: string;
  fontFamily?: string;
  fontWeight?: string;
}

export const BOOT_GROUP = 'boot';
export const UNITS_GROUP = 'units';
export const BOOT_BUDGET_BYTES = 600 * 1024;
export const MISSION_BUDGET_BYTES = 1024 * 1024;

export const HUD_FONT = 'B612 Mono';
export const UI_FONT = 'Karda Sans';

export const ASSETS: AssetDef[] = [
  { id: 'font.hud', kind: 'font', path: 'fonts/b612-mono.woff2', group: BOOT_GROUP, fontFamily: HUD_FONT },
  { id: 'font.ui', kind: 'font', path: 'fonts/karda-sans-regular.woff2', group: BOOT_GROUP, fontFamily: UI_FONT, fontWeight: '400' },
  { id: 'tex.particles', kind: 'texture', path: 'textures/particles.png', group: BOOT_GROUP },
  { id: 'font.ui.bold', kind: 'font', path: 'fonts/karda-sans-bold.woff2', group: BOOT_GROUP, fontFamily: UI_FONT, fontWeight: '700' },
  { id: 'model.tank', kind: 'gltf', path: 'models/tank.glb', group: UNITS_GROUP },
  { id: 'model.apc', kind: 'gltf', path: 'models/apc.glb', group: UNITS_GROUP },
  { id: 'model.truck', kind: 'gltf', path: 'models/truck.glb', group: UNITS_GROUP },
  { id: 'model.fuel_truck', kind: 'gltf', path: 'models/fuel_truck.glb', group: UNITS_GROUP },
  { id: 'model.technical', kind: 'gltf', path: 'models/technical.glb', group: UNITS_GROUP },
  { id: 'model.soldier', kind: 'gltf', path: 'models/soldier.glb', group: UNITS_GROUP },
  { id: 'model.civ_car', kind: 'gltf', path: 'models/civ_car.glb', group: UNITS_GROUP },
];

export function assetUrl(path: string) {
  return `${import.meta.env.BASE_URL}assets/${path}`;
}
