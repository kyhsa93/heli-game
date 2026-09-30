import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { t, tList } from '../../content/strings';
import { Coach, deathTip, type CoachFacts } from './coach';
import type { Settings } from '../../save/save';
import { DIFFICULTIES } from '../../sim/difficulty';
import type { FlightSession } from '../../sim/session';
import { Flight } from '../screens/Flight';
import type { BattleChoice } from './BattleSetup';
import { loadBattle } from './loadBattle';
import { BattleHud } from './hud/BattleHud';
import { sideSymbol } from './hud/symbols';
import type { FlightRenderer } from '../../render/renderer';

type BattleModule = Awaited<ReturnType<typeof loadBattle>>;
type Runtime = ReturnType<BattleModule['createBattleSession']>['runtime'];
type KitId = BattleModule['KIT_IDS'][number];

export function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Battle({ choice, touch, settings, onSettings, onSetup, onTitle, tips, onTip }: {
  choice: BattleChoice; touch: boolean; settings: Settings; onSettings: (s: Settings) => void; onSetup: () => void; onTitle: () => void; tips: readonly string[]; onTip: (id: string) => void;
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
      <BattleOverlays game={game} side={choice.side} touch={touch} tips={tips} onTip={onTip} onAgain={() => setRound(r => r + 1)} onSetup={onSetup} onTitle={onTitle} />
    </Flight>
  );
}

const MISSILES = new Set(['sa_ir', 'sam_radar', 'heli_aam', 'jet_aam']);

function BattleOverlays({ game, side, touch, tips, onTip, onAgain, onSetup, onTitle }: { game: { mod: BattleModule; session: FlightSession; runtime: Runtime }; side: 'coalition' | 'veros'; touch: boolean; tips: readonly string[]; onTip: (id: string) => void; onAgain: () => void; onSetup: () => void; onTitle: () => void }) {
  const { session, runtime, mod } = game;
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [, tick] = useState(0);
  const tally = useRef({ kills: 0, deaths: 0, identified: 0, flips: 0, detected: 0, missileAt: -99, reason: undefined as string | undefined, missile: false });
  useEffect(() => session.world.events.onAny(e => {
    const T = tally.current, now = session.world.time;
    if (e.t === 'unitDestroyed' && e.byPlayer) T.kills++;
    else if (e.t === 'crash') { T.deaths++; T.reason = e.reason; T.missile = now - T.missileAt < 3; }
    else if (e.t === 'identified') T.identified++;
    else if (e.t === 'pointOwner') T.flips++;
    else if (e.t === 'detected') T.detected++;
    else if (e.t === 'playerHit' && MISSILES.has(e.weapon)) T.missileAt = now;
  }), [session]);
  const tipsRef = useRef(tips);
  tipsRef.current = tips;
  const [coach] = useState(() => new Coach(new Set(tips), undefined, onTip));
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const w = session.world, T = tally.current;
      const facts: CoachFacts = { agl: w.playerBody().agl, tads: w.tads.active, identified: T.identified, flips: T.flips, detected: T.detected, deaths: T.deaths, flying: session.mode === 'play' && w.playerBody().alive && !session.paused };
      setLine(coach.update(facts, facts.flying ? 0.1 : 0));
    }, 100);
    return () => clearInterval(id);
  }, [session, coach]);
  useEffect(() => {
    if (snap.mode !== 'deploy') return;
    const id = setInterval(() => tick(n => n + 1), 250);
    return () => clearInterval(id);
  }, [snap.mode]);
  const firstSortie = !tips.includes('card.apache');
  const heliReady = side === 'coalition';
  const [role, setRole] = useState<'heli' | 'soldier'>(heliReady ? 'heli' : 'soldier');
  const [spawnId, setSpawnId] = useState(heliReady ? (firstSortie ? 'baseAir' : 'base') : 'soldierBase');
  const [kit, setKit] = useState<KitId>('closeSupport');
  const c = runtime.conquest;
  const all = runtime.spawnPoints(session.world);
  const points = all.filter(p => p.role === role);
  const chosen = points.find(p => p.id === spawnId) ?? points[0];
  const spawnLabel = (p: typeof chosen) => p.role === 'heli' ? t(p.kind === 'pad' ? 'battle.deploy.spawnBase' : 'battle.deploy.spawnBaseAir') : p.label === 'base' ? t('battle.deploy.spawnSoldierBase') : p.label.startsWith('squad:') ? t('battle.deploy.spawnSquad', { id: p.label.slice(6) }) : t('battle.deploy.spawnPoint', { id: p.label });
  if (snap.mode === 'deploy') {
    const wait = session.deployIn();
    return (
      <div className="overlay deploy">
        <div className="card wide">
          <h1>{t('battle.deploy.title')}</h1>
          <p className="sub">{t('battle.deploy.tickets', { c: Math.floor(c.tickets.coalition), v: Math.floor(c.tickets.veros) })} · {t('battle.deploy.elapsed', { t: clock(c.elapsed), limit: clock(runtime.rules.timeLimitSec) })}</p>
          <p className="sub">{t('battle.deploy.points', { list: c.points.map(p => `${p.id}${p.owner === 'coalition' ? '■' : p.owner === 'veros' ? '▲' : '○'}`).join(' ') })}</p>
          <div className="setting-row"><span>{t('battle.deploy.role')}</span>
            <div className="choice">{(['soldier', 'heli'] as const).map(r => <button key={r} className={r === role ? 'on' : ''} disabled={r === 'heli' && !heliReady} onClick={() => { setRole(r); setSpawnId(r === 'heli' ? 'base' : 'soldierBase'); }}>{t(r === 'heli' && side === 'veros' ? 'battle.roles.vpaHeli' : `battle.roles.${r}`)}{r === 'heli' && !heliReady && <small>{t('battle.setup.soon')}</small>}</button>)}</div>
          </div>
          <div className="setting-row"><span>{t('battle.deploy.spawn')}</span>
            <div className="choice">{points.map(p => <button key={p.id} className={p === chosen ? 'on' : ''} onClick={() => setSpawnId(p.id)}>{spawnLabel(p)}</button>)}</div>
          </div>
          {role === 'heli' && (
            <div className="setting-row"><span>{t('battle.deploy.kit')}</span>
              <div className="choice">{mod.KIT_IDS.map(k => <button key={k} className={k === kit ? 'on' : ''} onClick={() => setKit(k)}>{t(`battle.kits.${k}`)}</button>)}</div>
            </div>
          )}
          {firstSortie && role === 'heli' && (
            <div className="control-card">
              <b>{t('battle.card.title')}</b>
              {tList(touch ? 'battle.card.touch' : 'battle.card.keyboard').map(l => <span key={l}>{l}</span>)}
            </div>
          )}
          {tally.current.deaths > 0 && <p className="sub tip">{t(deathTip(tally.current.reason, tally.current.missile))}</p>}
          {tally.current.deaths > 0 && !tips.includes('rules.dead') && <p className="sub tip">{t('battle.tips.dead')}</p>}
          <div className="pause-buttons">
            <button className="go secondary" onClick={onSetup}>{t('battle.deploy.quit')}</button>
            <button className="go" disabled={wait > 0} onClick={() => { if (chosen && session.deploy(runtime.spawnFor(chosen, mod.KITS[kit]))) { if (firstSortie && role === 'heli') onTip('card.apache'); if (tally.current.deaths > 0 && !tips.includes('rules.dead')) onTip('rules.dead'); } }}>
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
  return line && (snap.mode === 'play') ? <div className="coach">{t(`battle.coach.${line}`, { own: sideSymbol(side), enemy: sideSymbol(side === 'coalition' ? 'veros' : 'coalition') })}</div> : null;
}
