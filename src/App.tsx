import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Flight } from './ui/screens/Flight';
import { Title } from './ui/screens/Title';
import { Training } from './ui/screens/Training';
import { UiState } from './ui/state';

const COMPLETED_KEY = 'heli-training-done';

function loadCompleted(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(COMPLETED_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}

function saveCompleted(done: Set<string>) {
  try { localStorage.setItem(COMPLETED_KEY, JSON.stringify([...done])); } catch { /* storage unavailable */ }
}

export function App() {
  const [ui] = useState(() => new UiState());
  const screen = useSyncExternalStore(ui.subscribe, ui.getSnapshot);
  const [touch, setTouch] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const [completed, setCompleted] = useState(loadCompleted);

  useEffect(() => {
    const touchstart = () => setTouch(true);
    const hashchange = () => ui.syncFromLocation();
    window.addEventListener('touchstart', touchstart, { passive: true });
    window.addEventListener('hashchange', hashchange);
    return () => {
      window.removeEventListener('touchstart', touchstart);
      window.removeEventListener('hashchange', hashchange);
    };
  }, [ui]);

  const complete = useCallback((id: string) => setCompleted(prev => {
    if (prev.has(id)) return prev;
    const next = new Set(prev).add(id);
    saveCompleted(next);
    return next;
  }), []);

  switch (screen.name) {
    case 'title':
      return <Title trainingDone={completed.has('t1')} onTraining={() => ui.go({ name: 'training' })} />;
    case 'training':
      return <Training completed={completed} onBack={() => ui.go({ name: 'title' })} onPick={id => ui.go({ name: 'flight', missionId: id })} />;
    case 'flight':
      return <Flight key={screen.missionId} missionId={screen.missionId} touch={touch} onExit={() => ui.go({ name: 'training' })} onComplete={complete} />;
  }
}
