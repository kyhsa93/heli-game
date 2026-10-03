import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { climbable, waterDepth } from '../infantry/movement';
import { FootField } from './footpath';
import { createBattleSession } from './runtime';
import type { BattleMapDef, BattleSide } from './schema';

export const RALLY_REACH = 600;

const MAPS = join(__dirname, '../../content/battle/maps');
const maps = readdirSync(MAPS).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(MAPS, f), 'utf8')) as BattleMapDef);

describe('a soldier deployed at the rally point can reach the fight (#192)', () => {
  for (const def of maps) for (const mode of ['quick', 'conquest'] as const) {
    const rally = def.modes[mode]?.rally;
    if (!rally) continue;
    for (const side of Object.keys(rally) as BattleSide[]) {
      it(`${def.id} ${mode} ${side}: within ${RALLY_REACH} m of the nearest point it does not hold, on walkable ground, with a path in`, () => {
        const [x, z] = rally[side]!;
        const { session, runtime } = createBattleSession(def, mode, { side, seed: 1 });
        session.start();
        const t = session.world.terrain;
        const goal = runtime.conquest.points.filter(p => p.owner !== side).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
        expect(Math.hypot(goal.x - x, goal.z - z)).toBeLessThanOrEqual(RALLY_REACH);
        expect(waterDepth(t, x, z)).toBe(0);
        for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) expect(climbable(t, x + i * 4, z + j * 4), `ground at ${x + i * 4},${z + j * 4}`).toBe(true);
        const f = new FootField(t, goal.x, goal.z, { minX: Math.min(x, goal.x) - 300, maxX: Math.max(x, goal.x) + 300, minZ: Math.min(z, goal.z) - 300, maxZ: Math.max(z, goal.z) + 300 });
        const walk = f.dist[f.index(x, z)];
        expect(walk).toBeLessThanOrEqual(RALLY_REACH * 1.3);
        expect(runtime.spawnPoints(session.world).some(p => p.id === 'rally')).toBe(true);
      }, 30_000);
    }
  }
});
