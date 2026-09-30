export type Screen =
  | { name: 'title' }
  | { name: 'settings' }
  | { name: 'credits' };

export function parseHash(hash: string): Screen {
  const first = hash.replace(/^#\/?/, '').split('/').filter(Boolean)[0];
  if (first === 'settings') return { name: 'settings' };
  if (first === 'credits') return { name: 'credits' };
  return { name: 'title' };
}

export function toHash(screen: Screen): string {
  return `#/${screen.name}`;
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
