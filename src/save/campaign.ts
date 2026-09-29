import { isDifficulty, type DifficultyLevel } from '../sim/difficulty';
import type { Grade } from '../sim/mission/scoring';
import type { UnlockId } from '../sim/mission/schema';
import { CAMPAIGN, CAMPAIGN_IDS, type Campaign, type CampaignRank } from '../content/campaign';
import { browserStorage, read, remove, write, type KeyValue } from './storage';

export const SAVE_KEY = 'heli-campaign-v1';
export const BACKUP_KEY = 'heli-campaign-backup';
export const LEGACY = { training: 'heli-training-done', difficulty: 'heli-difficulty', voice: 'heli-voice-warnings', instant: 'heli-instant-best' };

export interface Settings {
  difficulty: DifficultyLevel;
  voiceWarnings: boolean;
  assists: { autoIdentify: boolean; autoCountermeasures: boolean };
}

export interface MissionRecord { completed: boolean; bestScore: number; bestGrade: Exclude<Grade, 'F'> | null }

export interface CampaignSave {
  version: 1;
  missions: Record<string, MissionRecord>;
  training: Record<string, boolean>;
  totalScore: number;
  instantBest: { score: number; grade: string } | null;
  settings: Settings;
}

export function freshSave(): CampaignSave {
  return {
    version: 1, missions: {}, training: {}, totalScore: 0, instantBest: null,
    settings: { difficulty: 'normal', voiceWarnings: true, assists: { autoIdentify: false, autoCountermeasures: false } },
  };
}

const GRADES = new Set(['S', 'A', 'B', 'C']);

function sanitize(raw: unknown): CampaignSave | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return null;
  const save = freshSave();
  if (r.missions && typeof r.missions === 'object') {
    for (const [id, v] of Object.entries(r.missions as Record<string, unknown>)) {
      const m = v as Partial<MissionRecord> | null;
      if (!m || typeof m !== 'object') continue;
      save.missions[id] = {
        completed: m.completed === true,
        bestScore: typeof m.bestScore === 'number' && Number.isFinite(m.bestScore) ? m.bestScore : 0,
        bestGrade: typeof m.bestGrade === 'string' && GRADES.has(m.bestGrade) ? m.bestGrade as MissionRecord['bestGrade'] : null,
      };
    }
  }
  if (r.training && typeof r.training === 'object') for (const [id, v] of Object.entries(r.training as Record<string, unknown>)) if (v === true) save.training[id] = true;
  const ib = r.instantBest as CampaignSave['instantBest'];
  if (ib && typeof ib.score === 'number' && typeof ib.grade === 'string') save.instantBest = { score: ib.score, grade: ib.grade };
  const s = r.settings as Partial<Settings> | undefined;
  if (s) {
    if (isDifficulty(s.difficulty)) save.settings.difficulty = s.difficulty;
    if (typeof s.voiceWarnings === 'boolean') save.settings.voiceWarnings = s.voiceWarnings;
    if (s.assists) {
      save.settings.assists.autoIdentify = s.assists.autoIdentify === true;
      save.settings.assists.autoCountermeasures = s.assists.autoCountermeasures === true;
    }
  }
  save.totalScore = totalOf(save);
  return save;
}

function migrateLegacy(store: KeyValue | null): CampaignSave {
  const save = freshSave();
  try { for (const id of JSON.parse(read(store, LEGACY.training) ?? '[]') as string[]) save.training[id] = true; } catch { /* ignore */ }
  const d = read(store, LEGACY.difficulty);
  if (isDifficulty(d)) save.settings.difficulty = d;
  if (read(store, LEGACY.voice) === 'off') save.settings.voiceWarnings = false;
  try { const ib = JSON.parse(read(store, LEGACY.instant) ?? 'null'); if (ib && typeof ib.score === 'number') save.instantBest = ib; } catch { /* ignore */ }
  return save;
}

export function loadSave(store: KeyValue | null = browserStorage()): CampaignSave {
  const raw = read(store, SAVE_KEY);
  if (raw === null) return migrateLegacy(store);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  const save = sanitize(parsed);
  if (save) return save;
  write(store, BACKUP_KEY, raw);
  remove(store, SAVE_KEY);
  return freshSave();
}

export function storeSave(save: CampaignSave, store: KeyValue | null = browserStorage()) {
  return write(store, SAVE_KEY, JSON.stringify(save));
}

export function totalOf(save: CampaignSave) {
  return Object.values(save.missions).reduce((sum, m) => sum + m.bestScore, 0);
}

export function recordMission(save: CampaignSave, id: string, success: boolean, score: number, grade: Grade): { save: CampaignSave; newBest: boolean } {
  const prev = save.missions[id] ?? { completed: false, bestScore: 0, bestGrade: null };
  const better = success && score > prev.bestScore;
  const next: MissionRecord = {
    completed: prev.completed || success,
    bestScore: better ? score : prev.bestScore,
    bestGrade: better && grade !== 'F' ? grade : prev.bestGrade,
  };
  const out = { ...save, missions: { ...save.missions, [id]: next } };
  out.totalScore = totalOf(out);
  return { save: out, newBest: better };
}

export function recordTraining(save: CampaignSave, id: string): CampaignSave {
  return save.training[id] ? save : { ...save, training: { ...save.training, [id]: true } };
}

export function recordInstant(save: CampaignSave, score: number, grade: string): { save: CampaignSave; newBest: boolean } {
  if (save.instantBest && save.instantBest.score >= score) return { save, newBest: false };
  return { save: { ...save, instantBest: { score, grade } }, newBest: true };
}

export function unlockedFor(save: CampaignSave, c: Campaign = CAMPAIGN): Set<UnlockId> {
  const grades = Object.values(save.missions).filter(m => m.bestGrade === 'S').length;
  return new Set(c.unlocks.filter(u => (u.after ? !!save.missions[u.after]?.completed : true) && (u.sGrades ? grades >= u.sGrades : true)).map(u => u.id));
}

export function rankFor(total: number, c: Campaign = CAMPAIGN): CampaignRank {
  return [...c.ranks].sort((x, y) => y.min - x.min).find(r => total >= r.min) ?? c.ranks[0];
}

export function missionAvailable(save: CampaignSave, id: string, ids: readonly string[] = CAMPAIGN_IDS) {
  const i = ids.indexOf(id);
  return i === 0 || (i > 0 && !!save.missions[ids[i - 1]]?.completed);
}

export function campaignProgress(save: CampaignSave, c: Campaign = CAMPAIGN) {
  const completed = c.missions.filter(m => save.missions[m.id]?.completed).length;
  const next = c.missions.find(m => !save.missions[m.id]?.completed) ?? c.missions[c.missions.length - 1];
  return { completed, total: c.missions.length, act: next.act, next: next.id, rank: rankFor(save.totalScore, c) };
}
