import { useMemo, useState } from 'react';
import { t } from '../../content/strings';
import { GUN_ROUND_OPTIONS, loadoutStats, PYLONS, type LoadoutDef, type Store } from '../../sim/heli/loadout';
import type { MissionDef } from '../../sim/mission/schema';

const STORE_CYCLE: Store[] = ['agm114k', 'agm114l', 'hydra70', 'empty'];

export function storeLocked(store: Store, unlocked: ReadonlySet<string>) {
  return store === 'agm114l' && !unlocked.has('agm114l');
}

export function Loadout({ mission, unlocked, onLaunch, onBack }: { mission: MissionDef; unlocked: ReadonlySet<string>; onLaunch: (def: LoadoutDef) => void; onBack: () => void }) {
  const [def, setDef] = useState<LoadoutDef>(() => structuredClone(mission.briefing.recommendedLoadout));
  const stats = useMemo(() => loadoutStats(def), [def]);
  const cycle = (p: typeof PYLONS[number]) => setDef(d => {
    let i = STORE_CYCLE.indexOf(d.pylons[p]);
    do { i = (i + 1) % STORE_CYCLE.length; } while (storeLocked(STORE_CYCLE[i], unlocked));
    return { ...d, pylons: { ...d.pylons, [p]: STORE_CYCLE[i] } };
  });
  const guns = GUN_ROUND_OPTIONS.filter(n => n > 0);
  const stingerLocked = !unlocked.has('stinger');
  const count = (s: Store) => (s === 'hydra70' ? 19 : s === 'empty' ? 0 : 4);
  return (
    <div className="menu room">
      <div className="room-card">
        <p className="kicker">{mission.title}</p>
        <h1>{t('loadout.title')}</h1>
        <div className="pylons">
          {PYLONS.map(p => (
            <button key={p} className={`pylon ${def.pylons[p]}`} onClick={() => cycle(p)}>
              <small>{p}</small><b>{t(`farp.store.${def.pylons[p]}`)}</b><span>{def.pylons[p] === 'empty' ? '—' : `×${count(def.pylons[p])}`}</span>
            </button>
          ))}
        </div>
        <div className="pylons">
          <button className="pylon" disabled={stingerLocked} onClick={() => setDef(d => ({ ...d, stingers: !d.stingers }))}>
            <small>{t('loadout.wingtips')}</small><b>{stingerLocked ? `🔒 ${t('loadout.stinger')}` : def.stingers ? t('loadout.stinger') : t('farp.store.empty')}</b>
            <span>{stingerLocked ? t('loadout.lockedStinger') : def.stingers ? '×2' : '—'}</span>
          </button>
          <button className="pylon" onClick={() => setDef(d => ({ ...d, gunRounds: guns[(guns.indexOf(d.gunRounds as typeof guns[number]) + 1) % guns.length] }))}>
            <small>{t('loadout.gun')}</small><b>{def.gunRounds}</b><span>30mm</span>
          </button>
        </div>
        <label className="fuel">{t('loadout.fuel', { pct: def.fuel })}
          <input type="range" min={20} max={100} step={5} value={def.fuel} onChange={e => setDef(d => ({ ...d, fuel: Number(e.target.value) }))} />
        </label>
        <div className="load-stats">
          <span>{t('loadout.weight', { kg: Math.round(stats.weight).toLocaleString('en-US') })}</span>
          <span className={`margin ${stats.margin}`}>{t('loadout.margin')} <b>{t(`loadout.marginLevel.${stats.margin}`)}</b> <i style={{ width: `${Math.max(8, Math.min(100, (1 - stats.collective) * 180))}%` }} /></span>
          <span>{t('loadout.endurance', { min: Math.round(stats.enduranceMin) })}</span>
        </div>
        <div className="room-buttons">
          <button className="go secondary" onClick={onBack}>{t('loadout.back')}</button>
          <button className="go secondary" onClick={() => setDef(structuredClone(mission.briefing.recommendedLoadout))}>{t('loadout.recommended')}</button>
          <button className="go" onClick={() => onLaunch(def)}>{t('loadout.launch')}</button>
        </div>
      </div>
    </div>
  );
}
