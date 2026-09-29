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
import { InstantSetup } from './ui/mission/InstantSetup';
import { generateInstant } from './sim/mission/instant';
import { loadInstantBest, saveInstantBest } from './ui/settings';

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
      return <Title trainingDone={completed.has('t1')} onInstant={() => ui.go({ name: 'instant' })} onCampaign={MISSION_IDS.length ? () => ui.go({ name: 'briefing', missionId: MISSION_IDS[0] }) : undefined} onTraining={() => ui.go({ name: 'training' })} onCredits={() => ui.go({ name: 'credits' })} />;
    case 'instant':
      return <InstantSetup best={loadInstantBest()} onBack={() => ui.go({ name: 'title' })} onGo={threat => ui.go({ name: 'flight', missionId: 'instant', mission: generateInstant({ seed: (Math.random() * 1e9) | 0, threat, time: 'day' }) })} />;
    case 'briefing':
      return <Briefing mission={MISSIONS[screen.missionId]} onBack={() => ui.go({ name: 'title' })} onNext={() => ui.go({ name: 'loadout', missionId: screen.missionId })} />;
    case 'loadout':
      return <Loadout mission={MISSIONS[screen.missionId]} unlocked={new Set(MISSIONS[screen.missionId].unlocks ?? [])} onBack={() => ui.go({ name: 'briefing', missionId: screen.missionId })} onLaunch={def => ui.go({ name: 'flight', missionId: screen.missionId, loadout: def })} />;
    case 'debrief':
      if (screen.missionId === 'instant' && screen.report && screen.mission) return <Debrief mission={screen.mission} report={screen.report} newBest={screen.newBest} onRetry={() => ui.go({ name: 'instant' })} onDone={() => ui.go({ name: 'title' })} />;
      if (!screen.report) return <Briefing mission={MISSIONS[screen.missionId]} onBack={() => ui.go({ name: 'title' })} onNext={() => ui.go({ name: 'loadout', missionId: screen.missionId })} />;
      return <Debrief mission={MISSIONS[screen.missionId]} report={screen.report}
        onRetry={() => ui.go(isMission(screen.missionId) ? { name: 'loadout', missionId: screen.missionId } : { name: 'flight', missionId: screen.missionId })}
        onDone={() => ui.go(isMission(screen.missionId) ? { name: 'title' } : { name: 'training' })} />;
    case 'credits':
      return <Credits onBack={() => ui.go({ name: 'title' })} />;
    case 'training':
      return <Training completed={completed} onBack={() => ui.go({ name: 'title' })} onPick={id => ui.go({ name: 'flight', missionId: id })} />;
    case 'flight':
      return <Flight key={screen.mission ? `instant-${screen.mission.environment.seed}` : screen.missionId} missionId={screen.missionId} mission={screen.mission} touch={touch} loadout={screen.loadout}
        onExit={() => ui.go(screen.mission ? { name: 'instant' } : isMission(screen.missionId) ? { name: 'briefing', missionId: screen.missionId } : { name: 'training' })}
        onComplete={complete}
        onMissionEnd={report => {
          if (screen.mission) { const newBest = report.success && saveInstantBest({ score: report.score.total, grade: report.score.grade }); ui.go({ name: 'debrief', missionId: 'instant', report, mission: screen.mission, newBest }); return; }
          if (report.success && !isMission(screen.missionId)) complete(screen.missionId);
          ui.go({ name: 'debrief', missionId: screen.missionId, report });
        }} />;
  }
}
