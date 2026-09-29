import { loadMission, type MissionDef } from '../sim/mission/schema';

const files = import.meta.glob('./missions/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export const MISSIONS: Record<string, MissionDef> = Object.fromEntries(
  Object.values(files).map(data => loadMission(data)).filter(m => /^m\d\d$/.test(m.id)).map(m => [m.id, m]),
);

export const MISSION_IDS = Object.keys(MISSIONS).sort();
