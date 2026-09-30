import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { t } from '../../content/strings';
import type { Settings } from '../../save/save';
import { DIFFICULTIES } from '../../sim/difficulty';
import type { FlightSession } from '../../sim/session';
import { Flight } from '../screens/Flight';
import type { BattleChoice } from './BattleSetup';
import { loadBattle } from './loadBattle';
import { BattleHud } from './hud/BattleHud';
import type { FlightRenderer } from '../../render/renderer';

type BattleModule = Awaited<ReturnType<typeof loadBattle>>;
type Runtime = ReturnType<BattleModule['createBattleSession']>['runtime'];
type KitId = BattleModule['KIT_IDS'][number];

export function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Battle({ choice, touch, settings, onSettings, onSetup, onTitle }: {
  choice: BattleChoice; touch: boolean; settings: Settings; onSettings: (s: Settings) => void; onSetup: () => void; onTitle: () => void;
}) {
  const [game, setGame] = useState<{ mod: BattleModule; session: FlightSession; runtime: Runtime } | null>(null);
  const [round, setRound] = useState(0);
  const [renderer, setRenderer] = useState<FlightRenderer | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const mod = await loadBattle();
      const map = await mod.loadMap('harek');
      if (!alive) return;
      const { session, runtime } = mod.createBattleSession(map, 'quick', { side: choice.side, seed: (Date.now() & 0xffff) + round });
      session.world.difficulty = DIFFICULTIES[settings.difficulty];
      session.world.conditions.time = choice.time;
      session.start();
      setGame({ mod, session, runtime });
    })();
    return () => { alive = false; };
  }, [choice, round]);
  if (!game) return <div className="menu"><div className="card"><p className="sub">{t('battle.deploy.loading')}</p></div></div>;
  return (
    <Flight key={round} session={game.session} touch={touch} settings={settings} onSettings={onSettings} onExit={onSetup} onRenderer={setRenderer}>
      <BattleHud session={game.session} runtime={game.runtime} side={choice.side} renderer={renderer} touch={touch} />
      <BattleOverlays game={game} side={choice.side} onAgain={() => setRound(r => r + 1)} onSetup={onSetup} onTitle={onTitle} />
    </Flight>
  );
}

function BattleOverlays({ game, side, onAgain, onSetup, onTitle }: { game: { mod: BattleModule; session: FlightSession; runtime: Runtime }; side: 'coalition' | 'veros'; onAgain: () => void; onSetup: () => void; onTitle: () => void }) {
  const { session, runtime, mod } = game;
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [, tick] = useState(0);
  const tally = useRef({ kills: 0, deaths: 0 });
  useEffect(() => session.world.events.onAny(e => {
    if (e.t === 'unitDestroyed' && e.byPlayer) tally.current.kills++;
    if (e.t === 'crash') tally.current.deaths++;
  }), [session]);
  useEffect(() => {
    if (snap.mode !== 'deploy') return;
    const id = setInterval(() => tick(n => n + 1), 250);
    return () => clearInterval(id);
  }, [snap.mode]);
  const [spawn, setSpawn] = useState(0);
  const [kit, setKit] = useState<KitId>('closeSupport');
  const c = runtime.conquest;
  const points = runtime.spawnPoints(session.world);
  if (snap.mode === 'deploy') {
    const wait = session.deployIn();
    return (
      <div className="overlay deploy">
        <div className="card wide">
          <h1>{t('battle.deploy.title')}</h1>
          <p className="sub">{t('battle.deploy.tickets', { c: Math.floor(c.tickets.coalition), v: Math.floor(c.tickets.veros) })} · {t('battle.deploy.elapsed', { t: clock(c.elapsed), limit: clock(runtime.rules.timeLimitSec) })}</p>
          <p className="sub">{t('battle.deploy.points', { list: c.points.map(p => `${p.id}${p.owner === 'coalition' ? '■' : p.owner === 'veros' ? '▲' : '○'}`).join(' ') })}</p>
          <div className="setting-row"><span>{t('battle.deploy.spawn')}</span>
            <div className="choice">{points.map((p, i) => <button key={p.id} className={i === spawn ? 'on' : ''} onClick={() => setSpawn(i)}>{t(p.kind === 'pad' ? 'battle.deploy.spawnBase' : 'battle.deploy.spawnBaseAir')}</button>)}</div>
          </div>
          <div className="setting-row"><span>{t('battle.deploy.kit')}</span>
            <div className="choice">{mod.KIT_IDS.map(k => <button key={k} className={k === kit ? 'on' : ''} onClick={() => setKit(k)}>{t(`battle.kits.${k}`)}</button>)}</div>
          </div>
          <div className="pause-buttons">
            <button className="go secondary" onClick={onSetup}>{t('battle.deploy.quit')}</button>
            <button className="go" disabled={wait > 0} onClick={() => session.deploy(runtime.spawnFor(points[spawn], mod.KITS[kit]))}>
              {wait > 0 ? t('battle.deploy.wait', { s: Math.ceil(wait) }) : `${t('battle.deploy.go')} ▶`}
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (snap.mode === 'done') {
    const r = runtime.result;
    const outcome = r.winner > 0 ? 'win' : r.winner < 0 ? 'loss' : 'draw';
    const own = side === 'coalition' ? r.coalition : r.veros, enemy = side === 'coalition' ? r.veros : r.coalition;
    return (
      <div className="overlay report">
        <div className="card">
          <h1>{t(`battle.report.${outcome}`)}</h1>
          <p className="sub">{r.byTime ? t('battle.report.time') : t(r.winner > 0 ? 'battle.report.ticketsWon' : 'battle.report.ticketsLost')}</p>
          <p className="sub">{t('battle.report.score', { own, enemy })} · {t('battle.report.length', { t: clock(r.seconds) })}</p>
          <p className="sub">{t('battle.report.kills', { n: tally.current.kills })} · {t('battle.report.deaths', { n: tally.current.deaths })}</p>
          <div className="pause-buttons">
            <button className="go" onClick={onAgain}>{t('battle.report.again')}</button>
            <button className="go secondary" onClick={onSetup}>{t('battle.report.setup')}</button>
            <button className="go secondary" onClick={onTitle}>{t('battle.report.title')}</button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
