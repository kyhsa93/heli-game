import { useState } from 'react';
import { t } from '../../content/strings';
import { PYLONS, type LoadoutDef, type Store } from '../../sim/heli/loadout';
import { rearmSeconds, REPAIR_SECONDS, startService } from '../../sim/farp';
import { SYSTEMS } from '../../sim/heli/damage';
import type { World } from '../../sim/world';

const BASE_STORES: Store[] = ['empty', 'hydra70', 'agm114k'];
const GUN = [300, 600, 1200];

export function FarpMenu({ world }: { world: World }) {
  const [repair, setRepair] = useState(false);
  const [rearm, setRearm] = useState(false);
  const [def, setDef] = useState<LoadoutDef>(() => structuredClone(world.loadoutDef));
  const s = world.farpService;
  const damaged = SYSTEMS.some(k => world.player.damage[k] < 100);
  if (s) {
    const left = Math.ceil(Math.max(s.repairLeft, s.rearmLeft));
    return (
      <div className="farp-menu">
        <b>{t('farp.title')}</b>
        <span>{t('farp.working', { sec: left })}</span>
        {s.repairLeft > 0 && <span>{t('farp.repairLeft', { sec: Math.ceil(s.repairLeft) })}</span>}
        {s.rearmLeft > 0 && <span>{t('farp.rearmLeft', { sec: Math.ceil(s.rearmLeft) })}</span>}
        <span className="dim">{t('farp.fuel', { pct: Math.round(world.player.fuel) })}</span>
      </div>
    );
  }
  const STORES: Store[] = world.fcr.unlocked ? [...BASE_STORES, 'agm114l'] : BASE_STORES;
  const cycle = (p: typeof PYLONS[number]) => setDef(d => ({ ...d, pylons: { ...d.pylons, [p]: STORES[(STORES.indexOf(d.pylons[p]) + 1) % STORES.length] } }));
  const secs = Math.max(repair ? REPAIR_SECONDS : 0, rearm ? rearmSeconds(world, def) : 0);
  return (
    <div className="farp-menu">
      <b>{t('farp.title')}</b>
      <span className="dim">{t('farp.fuel', { pct: Math.round(world.player.fuel) })}</span>
      <div className="row">
        <button className={repair ? 'on' : ''} disabled={!damaged} onClick={() => setRepair(v => !v)}>{t('farp.repair', { sec: REPAIR_SECONDS })}</button>
        <button className={rearm ? 'on' : ''} onClick={() => setRearm(v => !v)}>{t('farp.rearm')}</button>
      </div>
      {rearm && (
        <div className="row">
          {PYLONS.map(p => <button key={p} onClick={() => cycle(p)}>{p} {t(`farp.store.${def.pylons[p]}`)}</button>)}
          <button onClick={() => setDef(d => ({ ...d, gunRounds: GUN[(GUN.indexOf(d.gunRounds) + 1) % GUN.length] ?? 1200 }))}>{t('farp.gun', { n: def.gunRounds })}</button>
        </div>
      )}
      <button className="go" disabled={!repair && !rearm} onClick={() => { startService(world, { repair, rearm: rearm ? def : null }); setRepair(false); setRearm(false); }}>
        {t('farp.start', { sec: secs })}
      </button>
    </div>
  );
}
