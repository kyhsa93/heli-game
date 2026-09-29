import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { assets } from './assets/loader';
import { BOOT_GROUP } from './assets/manifest';
import { Flight } from './ui/screens/Flight';
import { Credits } from './ui/screens/Credits';
import { Loading } from './ui/screens/Loading';
import { Title } from './ui/screens/Title';
import { Training } from './ui/screens/Training';
import { isMission, UiState } from './ui/state';
import { MISSION_IDS, MISSIONS } from './content/missions';
import { Briefing } from './ui/mission/Briefing';
import { Debrief } from './ui/mission/Debrief';
import { Loadout } from './ui/mission/Loadout';

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
  const [boot, setBoot] = useState(0);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let alive = true;
    void assets.loadGroup(BOOT_GROUP, f => { if (alive) setBoot(f); }).then(() => { if (alive) setBooted(true); });
    return () => { alive = false; };
  }, []);

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

  if (!booted) return <Loading progress={boot} />;

  switch (screen.name) {
    case 'title':
      return <Title trainingDone={completed.has('t1')} onCampaign={MISSION_IDS.length ? () => ui.go({ name: 'briefing', missionId: MISSION_IDS[0] }) : undefined} onTraining={() => ui.go({ name: 'training' })} onCredits={() => ui.go({ name: 'credits' })} />;
    case 'briefing':
      return <Briefing mission={MISSIONS[screen.missionId]} onBack={() => ui.go({ name: 'title' })} onNext={() => ui.go({ name: 'loadout', missionId: screen.missionId })} />;
    case 'loadout':
      return <Loadout mission={MISSIONS[screen.missionId]} unlocked={new Set(MISSIONS[screen.missionId].unlocks ?? [])} onBack={() => ui.go({ name: 'briefing', missionId: screen.missionId })} onLaunch={def => ui.go({ name: 'flight', missionId: screen.missionId, loadout: def })} />;
    case 'debrief':
      if (!screen.report) return <Briefing mission={MISSIONS[screen.missionId]} onBack={() => ui.go({ name: 'title' })} onNext={() => ui.go({ name: 'loadout', missionId: screen.missionId })} />;
      return <Debrief mission={MISSIONS[screen.missionId]} report={screen.report} onRetry={() => ui.go({ name: 'loadout', missionId: screen.missionId })} onDone={() => ui.go({ name: 'title' })} />;
    case 'credits':
      return <Credits onBack={() => ui.go({ name: 'title' })} />;
    case 'training':
      return <Training completed={completed} onBack={() => ui.go({ name: 'title' })} onPick={id => ui.go({ name: 'flight', missionId: id })} />;
    case 'flight':
      return <Flight key={screen.missionId} missionId={screen.missionId} touch={touch} loadout={screen.loadout}
        onExit={() => ui.go(isMission(screen.missionId) ? { name: 'briefing', missionId: screen.missionId } : { name: 'training' })}
        onComplete={complete}
        onMissionEnd={report => ui.go({ name: 'debrief', missionId: screen.missionId, report })} />;
  }
}
