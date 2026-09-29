import type { UnlockId } from '../sim/mission/schema';
import data from './campaign.json';

type Point = [number, number];

export interface CampaignMission { id: string; act: number; title: string; kind: string; node: Point; summary: string; threats: string[] }
export interface CampaignUnlock { id: UnlockId; name: string; after?: string; sGrades?: number }
export interface CampaignRank { id: string; min: number; name: string }
export interface Campaign {
  seed: number;
  acts: { act: number; name: string }[];
  missions: CampaignMission[];
  front: { after: number; line: Point[] }[];
  unlocks: CampaignUnlock[];
  ranks: CampaignRank[];
}

export const CAMPAIGN = data as Campaign;
export const CAMPAIGN_IDS = CAMPAIGN.missions.map(m => m.id);

export function frontLine(completed: number, c: Campaign = CAMPAIGN): Point[] {
  const keys = c.front;
  const n = Math.max(keys[0].after, Math.min(keys[keys.length - 1].after, completed));
  const i = Math.max(0, keys.findIndex((k, j) => j === keys.length - 1 || keys[j + 1].after >= n && k.after <= n));
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
  const f = b.after === a.after ? 0 : (n - a.after) / (b.after - a.after);
  return a.line.map(([x, y], j) => [x + (b.line[j][0] - x) * f, y + (b.line[j][1] - y) * f]);
}
