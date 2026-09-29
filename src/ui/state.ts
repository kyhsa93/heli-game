import { MISSION_IDS, TRAINING_IDS } from '../content/missions';
import type { LoadoutDef } from '../sim/heli/loadout';
import type { MissionReport } from './report';

export type Screen =
  | { name: 'title' }
  | { name: 'training' }
  | { name: 'credits' }
  | { name: 'briefing'; missionId: string }
  | { name: 'loadout'; missionId: string }
  | { name: 'flight'; missionId: string; loadout?: LoadoutDef }
  | { name: 'debrief'; missionId: string; report?: MissionReport };

export const TRAININGS = ['t1', 't2', 't3', 't4', 't5'] as const;
export const AVAILABLE_MISSIONS = new Set([...TRAINING_IDS, ...MISSION_IDS]);
export const isMission = (id: string) => MISSION_IDS.includes(id);

export function parseHash(hash: string): Screen {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const id = parts[1];
  if (parts[0] === 'training') return { name: 'training' };
  if (parts[0] === 'credits') return { name: 'credits' };
  if (id && isMission(id) && (parts[0] === 'briefing' || parts[0] === 'flight' || parts[0] === 'debrief')) return { name: 'briefing', missionId: id };
  if (id && parts[0] === 'debrief' && AVAILABLE_MISSIONS.has(id)) return { name: 'training' };
  if (id && isMission(id) && parts[0] === 'loadout') return { name: 'loadout', missionId: id };
  if (parts[0] === 'flight' && id && AVAILABLE_MISSIONS.has(id)) return { name: 'flight', missionId: id };
  return { name: 'title' };
}

export function toHash(screen: Screen): string {
  switch (screen.name) {
    case 'title': return '#/title';
    case 'training': return '#/training';
    case 'credits': return '#/credits';
    case 'briefing': return `#/briefing/${screen.missionId}`;
    case 'loadout': return `#/loadout/${screen.missionId}`;
    case 'flight': return `#/flight/${screen.missionId}`;
    case 'debrief': return `#/debrief/${screen.missionId}`;
  }
}

export class UiState {
  private screen: Screen;
  private listeners = new Set<() => void>();

  constructor(private readonly location: { hash: string } = window.location) {
    this.screen = parseHash(location.hash);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getSnapshot = () => this.screen;

  go(screen: Screen) {
    this.screen = screen;
    const hash = toHash(screen);
    if (this.location.hash !== hash) this.location.hash = hash;
    for (const fn of this.listeners) fn();
  }

  syncFromLocation() {
    if (toHash(parseHash(this.location.hash)) === toHash(this.screen) || this.location.hash === toHash(this.screen)) return;
    this.screen = parseHash(this.location.hash);
    for (const fn of this.listeners) fn();
  }
}
