import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../sim/difficulty';
import { makeWorld, openPair, putPlayer } from '../sim/testing';
import { UNIT_DEFS } from '../sim/units';
import { MISSION_IDS, MISSIONS } from './missions';

export function parFor(id: string) {
  const m = MISSIONS[id];
  const kills = m.units.filter(u => UNIT_DEFS[u.type].side === 'veros').reduce((s, u) => s + UNIT_DEFS[u.type].score, 0);
  const secondary = m.objectives.filter(o => !o.primary).length;
  return Math.round((1000 + 300 * secondary + 0.85 * kills + 800) / 50) * 50;
}

function exposed(type: string, dist: number, seconds: number, seed: number) {
  const { world } = makeWorld(seed);
  world.clearCombat();
  world.difficulty = DIFFICULTIES.normal;
  const g = openPair(world, dist, 60);
  const u = world.spawnUnit(type, g.unit.x, g.unit.z);
  putPlayer(world, g.player.x, g.player.z, 60);
  const h = world.player;
  h.landed = false; h.engineOn = true; h.rpm = 1;
  const at = h.pos.clone();
  let firing = -1;
  for (let t = 0; t < 150; t += 1 / 120) {
    h.pos.copy(at); h.vel.set(0, 0, 0);
    world.step(1 / 120);
    if (firing < 0 && u.ai.state === 'engage' && u.ai.aimTimer <= 0) firing = t;
    const down = !h.alive || h.damage.rotor <= 0 || (h.damage.engine1 <= 0 && h.damage.engine2 <= 0);
    if (down) return { down: t - Math.max(0, firing), worst: 0 };
    if (firing >= 0 && t - firing >= seconds) return { down: Infinity, worst: Math.min(...Object.values(h.damage)) };
  }
  return { down: Infinity, worst: Math.min(...Object.values(h.damage)) };
}

describe('balance pass (M7-6)', () => {
  it('sets every campaign par to what an expert run scores', () => {
    for (const id of MISSION_IDS) expect(MISSIONS[id].par, id).toBe(parFor(id));
  });

  it('kills a helicopter that hovers in the open in front of a self-propelled AA gun (P2)', () => {
    const downs = [17, 34, 51, 68].map(seed => exposed('spaag', 1000, 60, seed).down);
    expect(downs.filter(t => t < 40).length).toBeGreaterThanOrEqual(3);
  }, 60000);

  it('lets a five-second pop-up at 2 km survive with its systems working', () => {
    const worst = [17, 34, 51, 68].map(seed => exposed('spaag', 2000, 5, seed).worst);
    expect(worst.filter(w => w > 0).length).toBeGreaterThanOrEqual(3);
  }, 60000);
});
