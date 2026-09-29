import { describe, expect, it } from 'vitest';
import { freshSave, recordMission, unlockedFor, type CampaignSave } from '../save/campaign';
import { CAMPAIGN, CAMPAIGN_IDS, frontLine } from './campaign';
import { MISSION_IDS, MISSIONS } from './missions';
import { Terrain } from '../sim/terrain';
import { hasString } from './strings';

const clear = (ids: string[], grade: 'S' | 'A' = 'A') => ids.reduce<CampaignSave>((s, id) => recordMission(s, id, true, 2000, grade).save, freshSave());

describe('campaign (02 2.3, 2.5)', () => {
  it('lists twelve missions in three acts of four', () => {
    expect(CAMPAIGN_IDS).toEqual(Array.from({ length: 12 }, (_, i) => `m${String(i + 1).padStart(2, '0')}`));
    for (const act of [1, 2, 3]) expect(CAMPAIGN.missions.filter(m => m.act === act)).toHaveLength(4);
    expect(CAMPAIGN.acts.map(a => a.act)).toEqual([1, 2, 3]);
  });

  it('agrees with every built mission', () => {
    for (const id of MISSION_IDS) {
      const c = CAMPAIGN.missions.find(m => m.id === id)!;
      expect(c, id).toBeDefined();
      expect(MISSIONS[id].title).toBe(c.title);
      expect(MISSIONS[id].act).toBe(c.act);
      expect(MISSIONS[id].kind).toBe(c.kind);
    }
    for (const m of CAMPAIGN.missions) {
      expect(hasString(`briefing.kind.${m.kind}`), m.kind).toBe(true);
      for (const v of m.node) expect(v).toBeGreaterThan(0.02), expect(v).toBeLessThan(0.98);
    }
  });

  it('puts every node on dry land of the theater map', () => {
    const t = new Terrain(CAMPAIGN.seed);
    for (const m of CAMPAIGN.missions) expect(t.heightAt(-t.half + m.node[0] * t.size, -t.half + m.node[1] * t.size), m.id).toBeGreaterThan(0);
  });

  it('refers only to campaign missions from unlocks', () => {
    for (const u of CAMPAIGN.unlocks) if (u.after) expect(CAMPAIGN_IDS).toContain(u.after);
  });

  it('unlocks equipment by the 2.5 table', () => {
    expect([...unlockedFor(clear(['m01', 'm02', 'm03']))]).toEqual([]);
    expect([...unlockedFor(clear(['m01', 'm02', 'm03', 'm04']))]).toEqual(['chaff']);
    expect([...unlockedFor(clear(CAMPAIGN_IDS.slice(0, 5)))]).toEqual(['chaff', 'fcr', 'agm114l']);
    expect(unlockedFor(clear(CAMPAIGN_IDS.slice(0, 7))).has('night')).toBe(true);
    expect(unlockedFor(clear(CAMPAIGN_IDS.slice(0, 8))).has('stinger')).toBe(true);
    expect(unlockedFor(clear(CAMPAIGN_IDS.slice(0, 9))).has('wingmanMenu')).toBe(false);
    expect(unlockedFor(clear(CAMPAIGN_IDS.slice(0, 10))).has('wingmanMenu')).toBe(true);
    expect(unlockedFor(clear(CAMPAIGN_IDS)).has('liveries')).toBe(false);
    expect(unlockedFor(clear(CAMPAIGN_IDS.slice(0, 5), 'S')).has('liveries')).toBe(false);
    expect(unlockedFor(clear(CAMPAIGN_IDS.slice(0, 6), 'S')).has('liveries')).toBe(true);
  });

  it('does not unlock from a failed attempt', () => {
    const s = recordMission(clear(['m01', 'm02', 'm03']), 'm04', false, 500, 'F').save;
    expect(unlockedFor(s).has('chaff')).toBe(false);
  });

  it('moves the front north as missions are completed', () => {
    const mean = (n: number) => frontLine(n).reduce((a, [, y]) => a + y, 0) / frontLine(n).length;
    for (let n = 0; n < 12; n++) expect(mean(n + 1)).toBeLessThan(mean(n));
    expect(frontLine(-3)).toEqual(frontLine(0));
    expect(frontLine(40)).toEqual(frontLine(12));
    expect(frontLine(4)).toEqual(CAMPAIGN.front[1].line);
    for (const k of CAMPAIGN.front) expect(k.line).toHaveLength(CAMPAIGN.front[0].line.length);
  });
});
