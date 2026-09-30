import type { Obstacle } from '../obstacles';
import type { Terrain } from '../terrain';
import type { BattleMapDef, PropKind } from './schema';

export const PROP_BOX: Record<PropKind, { w: number; d: number; h: number }> = {
  sandbags: { w: 6, d: 1.2, h: 1 },
  crates: { w: 2.6, d: 2.6, h: 1.3 },
  barracks: { w: 9, d: 4.5, h: 3.2 },
  wall: { w: 6, d: 0.4, h: 1.1 },
};

export const VAULT_HEIGHT = 1.1;

export function mapObstacles(def: BattleMapDef, t: Terrain, points?: readonly string[]): Obstacle[] {
  const out: Obstacle[] = [];
  for (const p of def.points) {
    if (points && !points.includes(p.id)) continue;
    for (const pr of p.props) {
      const b = PROP_BOX[pr.kind];
      out.push({ x: pr.position[0], z: pr.position[1], y: t.surfaceAt(pr.position[0], pr.position[1]), w: b.w, d: b.d, h: b.h, yaw: (pr.yawDeg * Math.PI) / 180 });
    }
  }
  return out;
}
