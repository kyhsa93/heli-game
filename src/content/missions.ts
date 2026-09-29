import { loadMission, type MissionDef } from '../sim/mission/schema';

const files = import.meta.glob('./missions/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export const MISSIONS: Record<string, MissionDef> = Object.fromEntries(Object.values(files).map(data => loadMission(data)).map(m => [m.id, m]));

export const MISSION_IDS = Object.keys(MISSIONS).filter(id => /^m\d\d$/.test(id)).sort();
export const TRAINING_IDS = Object.keys(MISSIONS).filter(id => /^t\d$/.test(id)).sort();
