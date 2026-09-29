import { useEffect, useState } from 'react';
import { Flight3D } from './components/Flight3D';

export function App() {
  const [touch, setTouch] = useState(() => window.matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    const touchstart = () => setTouch(true);
    window.addEventListener('touchstart', touchstart, { passive: true });
    return () => window.removeEventListener('touchstart', touchstart);
  }, []);

  return <Flight3D touch={touch} />;
}
