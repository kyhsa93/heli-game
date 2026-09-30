import { useEffect, useState, useSyncExternalStore } from 'react';
import { assets } from './assets/loader';
import { BOOT_GROUP } from './assets/manifest';
import { Credits } from './ui/screens/Credits';
import { Loading } from './ui/screens/Loading';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { Title } from './ui/screens/Title';
import { UiState } from './ui/state';
import { hasSave, loadSave, storeSave, withDeviceDefaults } from './save/save';

export function App() {
  const [ui] = useState(() => new UiState());
  const screen = useSyncExternalStore(ui.subscribe, ui.getSnapshot);
  const [save, setSave] = useState(() => (hasSave() ? loadSave() : withDeviceDefaults(loadSave(), { mobile: window.matchMedia('(pointer: coarse)').matches || Math.min(window.screen.width, window.screen.height) < 600 })));
  useEffect(() => { storeSave(save); }, [save]);
  const [boot, setBoot] = useState(0);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let alive = true;
    void assets.loadGroup(BOOT_GROUP, f => { if (alive) setBoot(f); }).then(() => { if (alive) setBooted(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const hashchange = () => ui.syncFromLocation();
    window.addEventListener('hashchange', hashchange);
    return () => window.removeEventListener('hashchange', hashchange);
  }, [ui]);

  if (!booted) return <Loading progress={boot} />;

  switch (screen.name) {
    case 'title':
      return <Title onSettings={() => ui.go({ name: 'settings' })} onCredits={() => ui.go({ name: 'credits' })} />;
    case 'settings':
      return <SettingsScreen settings={save.settings} onChange={settings => setSave(prev => ({ ...prev, settings }))} onCredits={() => ui.go({ name: 'credits' })} onBack={() => ui.go({ name: 'title' })} />;
    case 'credits':
      return <Credits onBack={() => ui.go({ name: 'title' })} />;
  }
}
