import { Terrain, type TerrainOptions } from '../terrain';
import type { BattleMapDef } from './schema';

export function battleTerrainOptions(def: BattleMapDef): TerrainOptions {
  const pads = def.farps.map(f => ({ x: f.position[0], z: f.position[1], name: f.id, base: def.bases.some(b => b.farp === f.id) }));
  return { size: def.terrain.size, lift: def.terrain.lift, features: def.terrain.features, roads: def.terrain.roads, pads };
}

export function battleTerrain(def: BattleMapDef, seed = def.environment.seed) {
  return new Terrain(seed, battleTerrainOptions(def));
}
