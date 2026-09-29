export type Screen =
  | { name: 'title' }
  | { name: 'training' }
  | { name: 'flight'; missionId: string };

export const TRAININGS = ['t1', 't2', 't3', 't4', 't5'] as const;
export const AVAILABLE_MISSIONS = new Set(['t1']);

export function parseHash(hash: string): Screen {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'training') return { name: 'training' };
  if (parts[0] === 'flight' && parts[1] && AVAILABLE_MISSIONS.has(parts[1])) return { name: 'flight', missionId: parts[1] };
  return { name: 'title' };
}

export function toHash(screen: Screen): string {
  switch (screen.name) {
    case 'title': return '#/title';
    case 'training': return '#/training';
    case 'flight': return `#/flight/${screen.missionId}`;
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
    const next = parseHash(this.location.hash);
    if (toHash(next) !== toHash(this.screen)) {
      this.screen = next;
      for (const fn of this.listeners) fn();
    }
  }
}
