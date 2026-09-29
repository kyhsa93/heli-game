export const SETTLE_MS = 300;

type Target = Pick<Window, 'addEventListener' | 'removeEventListener' | 'scrollTo'> & { visualViewport?: Pick<VisualViewport, 'addEventListener' | 'removeEventListener'> | null };

export function watchViewport(onChange: () => void, win: Target = window, later: (fn: () => void, ms: number) => unknown = setTimeout) {
  const run = () => { win.scrollTo(0, 0); onChange(); };
  const handler = () => { run(); later(run, SETTLE_MS); };
  win.addEventListener('resize', handler);
  win.addEventListener('orientationchange', handler);
  win.visualViewport?.addEventListener('resize', handler);
  return () => {
    win.removeEventListener('resize', handler);
    win.removeEventListener('orientationchange', handler);
    win.visualViewport?.removeEventListener('resize', handler);
  };
}
