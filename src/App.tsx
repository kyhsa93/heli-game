import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import Flight2D from './components/Flight2D';
import { Menu, type FlightMode } from './components/Menu';

const Flight3D = lazy(() => import('./components/Flight3D'));

export function App() {
  const [mode, setMode] = useState<FlightMode | null>(null);
  const [touch, setTouch] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const exit = useCallback(() => setMode(null), []);

  useEffect(() => {
    const touchstart = () => setTouch(true);
    window.addEventListener('touchstart', touchstart, { passive: true });
    return () => window.removeEventListener('touchstart', touchstart);
  }, []);

  if (mode === '3d') {
    return (
      <Suspense fallback={<div className="menu"><p className="sub">조종석 불러오는 중…</p></div>}>
        <Flight3D onExit={exit} touch={touch} />
      </Suspense>
    );
  }
  if (mode === '2d') return <Flight2D onExit={exit} touch={touch} />;
  return <Menu onPick={setMode} />;
}
