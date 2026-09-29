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
export const FARP_GROUP = 'farp';
export const BOOT_BUDGET_BYTES = 600 * 1024;
export const MISSION_BUDGET_BYTES = 1024 * 1024;

export const HUD_FONT = 'B612 Mono';
export const UI_FONT = 'Karda Sans';

export const ASSETS: AssetDef[] = [
  { id: 'font.hud', kind: 'font', path: 'fonts/b612-mono.woff2', group: BOOT_GROUP, fontFamily: HUD_FONT },
  { id: 'font.ui', kind: 'font', path: 'fonts/karda-sans-regular.woff2', group: BOOT_GROUP, fontFamily: UI_FONT, fontWeight: '400' },
  { id: 'tex.particles', kind: 'texture', path: 'textures/particles.png', group: BOOT_GROUP },
  { id: 'tex.ground_detail', kind: 'texture', path: 'textures/ground_detail.png', group: BOOT_GROUP },
  { id: 'audio.rotor_loop', kind: 'audio', path: 'audio/rotor_interior_loop.mp3', group: BOOT_GROUP },
  { id: 'audio.engine_start', kind: 'audio', path: 'audio/engine_start.mp3', group: BOOT_GROUP },
  { id: 'audio.gun_shot', kind: 'audio', path: 'audio/gun_shot.mp3', group: BOOT_GROUP },
  { id: 'audio.rocket_launch', kind: 'audio', path: 'audio/rocket_launch.mp3', group: BOOT_GROUP },
  { id: 'audio.hellfire_launch', kind: 'audio', path: 'audio/hellfire_launch.mp3', group: BOOT_GROUP },
  { id: 'audio.explosion_near', kind: 'audio', path: 'audio/explosion_near.mp3', group: BOOT_GROUP },
  { id: 'audio.explosion_fire', kind: 'audio', path: 'audio/explosion_fire.mp3', group: BOOT_GROUP },
  { id: 'audio.impact_metal', kind: 'audio', path: 'audio/impact_metal.mp3', group: BOOT_GROUP },
  { id: 'audio.impact_ground', kind: 'audio', path: 'audio/impact_ground.mp3', group: BOOT_GROUP },
  { id: 'audio.hit_metal_0', kind: 'audio', path: 'audio/hit_metal_0.mp3', group: BOOT_GROUP },
  { id: 'audio.hit_metal_1', kind: 'audio', path: 'audio/hit_metal_1.mp3', group: BOOT_GROUP },
  { id: 'audio.hit_metal_2', kind: 'audio', path: 'audio/hit_metal_2.mp3', group: BOOT_GROUP },
  { id: 'audio.radio_squelch', kind: 'audio', path: 'audio/radio_squelch.mp3', group: BOOT_GROUP },
  { id: 'font.ui.bold', kind: 'font', path: 'fonts/karda-sans-bold.woff2', group: BOOT_GROUP, fontFamily: UI_FONT, fontWeight: '700' },
  { id: 'model.tank', kind: 'gltf', path: 'models/tank.glb', group: UNITS_GROUP },
  { id: 'model.apc', kind: 'gltf', path: 'models/apc.glb', group: UNITS_GROUP },
  { id: 'model.truck', kind: 'gltf', path: 'models/truck.glb', group: UNITS_GROUP },
  { id: 'model.fuel_truck', kind: 'gltf', path: 'models/fuel_truck.glb', group: UNITS_GROUP },
  { id: 'model.technical', kind: 'gltf', path: 'models/technical.glb', group: UNITS_GROUP },
  { id: 'model.soldier', kind: 'gltf', path: 'models/soldier.glb', group: UNITS_GROUP },
  { id: 'model.civ_car', kind: 'gltf', path: 'models/civ_car.glb', group: UNITS_GROUP },
  { id: 'model.prop_crate', kind: 'gltf', path: 'models/prop_crate.glb', group: FARP_GROUP },
  { id: 'model.prop_barrel', kind: 'gltf', path: 'models/prop_barrel.glb', group: FARP_GROUP },
  { id: 'model.prop_gas_can', kind: 'gltf', path: 'models/prop_gas_can.glb', group: FARP_GROUP },
  { id: 'model.prop_barracks', kind: 'gltf', path: 'models/prop_barracks.glb', group: FARP_GROUP },
  { id: 'model.prop_sandbags', kind: 'gltf', path: 'models/prop_sandbags.glb', group: FARP_GROUP },
];

export function assetUrl(path: string) {
  return `${import.meta.env.BASE_URL}assets/${path}`;
}
