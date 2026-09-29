export const PAGES = ['FLT', 'TSD', 'WPN', 'TADS'] as const;
export type PageId = typeof PAGES[number];
export type MpdSide = 'left' | 'right';
export const PAGE_LABELS: readonly PageId[] = PAGES;

export const MPD_SIZE = 512;
const BTN_X0 = 86, BTN_DX = 68, BTN_HALF = 22, BTN_Y = 480, BTN_H = 22;
const SCREEN = { x: 44, y: 44, w: 424, h: 424 };

export type BezelHit = { kind: 'page'; index: number } | { kind: 'screen' } | null;

export function bezelHitAt(u: number, v: number): BezelHit {
  const x = u * MPD_SIZE, y = (1 - v) * MPD_SIZE;
  if (y >= BTN_Y && y <= BTN_Y + BTN_H) {
    for (let i = 0; i < 6; i++) {
      const cx = BTN_X0 + i * BTN_DX;
      if (Math.abs(x - cx) <= BTN_HALF) return { kind: 'page', index: i };
    }
    return null;
  }
  if (x >= SCREEN.x && x <= SCREEN.x + SCREEN.w && y >= SCREEN.y && y <= SCREEN.y + SCREEN.h) return { kind: 'screen' };
  return null;
}

export class MpdState {
  left: PageId = 'FLT';
  right: PageId = 'TSD';

  next(side: MpdSide) {
    this[side] = PAGES[(PAGES.indexOf(this[side]) + 1) % PAGES.length];
    return this[side];
  }

  select(side: MpdSide, index: number) {
    const page = PAGES[index];
    if (page) this[side] = page;
    return this[side];
  }

  press(side: MpdSide, hit: BezelHit) {
    if (!hit) return false;
    if (hit.kind === 'page') { this.select(side, hit.index); return true; }
    this.next(side);
    return true;
  }
}
