import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent } from 'react';
import { assets } from '../../assets/loader';
import { GameAudio } from '../../audio/game';
import { hasString, t, tList, tPairs } from '../../content/strings';
import { clamp } from '../../core/math';
import { M_TO_FT, MS_TO_FPM, MS_TO_KT } from '../../core/units';
import { FlightRenderer } from '../../render/renderer';
import { LAND_DESCENT } from '../../sim/heli/airframe';
import { airspeed } from '../../sim/heli/state';
import { FlightSession } from '../../sim/session';
import { farpUnder } from '../../sim/farp';
import { FarpMenu } from '../flight/FarpMenu';
import { MISSIONS } from '../../content/missions';
import { missionSession, type MissionRuntime } from '../../sim/mission/runtime';
import { WINGMAN_ORDERS } from '../../sim/ai/wingman';
import type { UnlockId } from '../../sim/mission/schema';
import type { LoadoutDef } from '../../sim/heli/loadout';
import type { MissionDef } from '../../sim/mission/schema';
import { reportFrom, type MissionReport } from '../report';
import { DIFFICULTIES } from '../../sim/difficulty';
import { freshSave, type Settings } from '../../save/campaign';
import { zoomTads } from '../../sim/sensors/tads';
import { sightPoint } from '../../sim/weapons/ballistics';
import { hellfireSolution } from '../../sim/weapons/hellfire';
import { rocketSolution } from '../../sim/weapons/rockets';
import { commandForKey, PREVENT_DEFAULT, type Command } from '../../input/bindings';
import { FlightInput } from '../../input/input';
import { SettingsPanel } from './SettingsScreen';
import { crashText, eventMessage, MessageLog } from '../flight/messages';
import { VirtualStick } from '../components/VirtualStick';
import { Pinch } from '../../input/pinch';

const COACH_SECONDS = 7;
const STICK_RADIUS = { S: 46, M: 56, L: 70 } as const;

interface FlightProps { missionId: string; mission?: MissionDef; touch: boolean; loadout?: LoadoutDef; settings?: Settings; unlocked?: ReadonlySet<UnlockId>; tips?: ReadonlySet<string> | null; onTip?: (tip: string) => void; onSettings?: (s: Settings) => void; onExit: () => void; onComplete: (id: string) => void; onMissionEnd?: (report: MissionReport) => void }

export function Flight({ missionId, mission: given, touch, loadout, settings = freshSave().settings, unlocked, tips = null, onTip, onSettings, onExit, onComplete, onMissionEnd }: FlightProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const missionRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const mission = given ?? MISSIONS[missionId];
  const [session] = useState(() => mission ? missionSession(mission, loadout ?? null, unlocked, tips) : new FlightSession((Math.random() * 1e9) | 0));
  const training = mission?.kind === 'training';
  const runtime = mission ? session.objective as MissionRuntime : null;
  const radioRef = useRef<HTMLDivElement>(null);
  const coachRef = useRef<{ text: string; until: number } | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onTipRef = useRef(onTip);
  onTipRef.current = onTip;
  const [showKeys, setShowKeys] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const sim = session.world;
  sim.difficulty = DIFFICULTIES[settings.difficulty];
  sim.assists.autoIdentify = settings.assists.autoIdentify;
  sim.assists.autoCountermeasures = settings.assists.autoCountermeasures;
  const logRef = useRef(new MessageLog());
  const rendererRef = useRef<FlightRenderer | null>(null);
  const [input] = useState(() => new FlightInput());
  const audioRef = useRef<GameAudio | null>(null);
  useEffect(() => {
    rendererRef.current?.applySettings(settings);
    input.lookScale = settings.controls.lookSensitivity;
    input.tadsScale = settings.controls.tadsSensitivity;
    input.invertY = settings.controls.invertLookY;
    audioRef.current?.setVolume(settings.audio.master);
    if (audioRef.current) audioRef.current.voice.enabled = settings.voiceWarnings;
  }, [settings]);
  const touchRef = useRef(touch);
  touchRef.current = touch;
  const [hud, setHud] = useState(true);
  const hudOnRef = useRef(true);
  hudOnRef.current = hud;
  const ihadssRef = useRef<HTMLCanvasElement>(null);
  const [help, setHelp] = useState(false);
  const [muted, setMuted] = useState(false);
  const voiceOn = settings.voiceWarnings;
  const toggleVoice = () => { const on = !voiceOn; onSettings?.({ ...settings, voiceWarnings: on }); if (audioRef.current) audioRef.current.voice.enabled = on; };
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);

  const toggleView = () => rendererRef.current?.toggleView();
  const toggleSensor = () => { if (sim.conditions.time !== 'night') sim.tads.sensor = sim.tads.sensor === 'tv' ? 'flir' : 'tv'; };
  const [tadsOn, setTadsOn] = useState(false);
  const [, setTouchKey] = useState('');
  const [atFarp, setAtFarp] = useState(false);
  const [, setFarpTick] = useState(0);

  const [radioOpen, setRadioOpen] = useState(false);
  const radioOpenRef = useRef(false);
  radioOpenRef.current = radioOpen;
  const runCommand = (cmd: Command) => {
    const slot = { weapon1: 0, weapon2: 1, weapon3: 2, weapon4: 3, menu5: 4 }[cmd as string];
    if (radioOpenRef.current && slot !== undefined) {
      sim.orderWingman(WINGMAN_ORDERS[slot]);
      setRadioOpen(false);
      return;
    }
    switch (cmd) {
      case 'radioMenu':
        if (!sim.wingman) logRef.current.push({ text: t('wingman.none'), color: '#ffd166' });
        else if (!sim.wingmanMenu) logRef.current.push({ text: t('wingman.locked'), color: '#ffd166' });
        else setRadioOpen(v => !v);
        break;
      case 'engine': sim.toggleEngine(); break;
      case 'weapon1': sim.selectWeapon(1); break;
      case 'weapon2': sim.selectWeapon(2); break;
      case 'weapon3': sim.selectWeapon(3); break;
      case 'weapon4': sim.selectWeapon(4); break;
      case 'weaponNext': sim.nextWeapon(); break;
      case 'weaponPrev': sim.nextWeapon(-1); break;
      case 'padA': if (sim.player.landed || !sim.player.engineOn) sim.toggleEngine(); else sim.dropFlare(); break;
      case 'padRB': if (sim.tads.active) zoomTads(sim.tads, 1); else sim.nextWeapon(); break;
      case 'padLB': if (sim.tads.active) zoomTads(sim.tads, -1); else sim.nextFcrTarget(); break;
      case 'view': if (sim.tads.active) toggleSensor(); else toggleView(); break;
      case 'tads': sim.toggleTads(); break;
      case 'flare': sim.dropFlare(); break;
      case 'pnvs': if (rendererRef.current) rendererRef.current.pnvs = !rendererRef.current.pnvs; break;
      case 'chaff': sim.dropChaff(); break;
      case 'fcr': sim.fcrScan(); break;
      case 'fcrMode': sim.setFcrMode(); break;
      case 'targetNext': sim.nextFcrTarget(); break;
      case 'mpdLeftNext': rendererRef.current?.mpd.next('left'); break;
      case 'mpdRightNext': rendererRef.current?.mpd.next('right'); break;
      case 'zoomIn': zoomTads(sim.tads, 1); break;
      case 'zoomOut': zoomTads(sim.tads, -1); break;
      case 'centerView': input.centerView(); break;
      case 'toggleHud': setHud(v => !v); break;
      case 'help': case 'pause': if (session.mode === 'play') setHelp(v => !v); break;
      case 'mute': if (audioRef.current) setMuted(audioRef.current.toggleMute()); break;
      default: break;
    }
  };
  const runCommandRef = useRef(runCommand);
  runCommandRef.current = runCommand;

  const begin = () => {
    if (!audioRef.current) {
      try {
        audioRef.current = new GameAudio();
        audioRef.current.voice.enabled = settings.voiceWarnings;
        audioRef.current.setVolume(settings.audio.master);
        void audioRef.current.loadSamples(id => assets.get<ArrayBuffer>(id));
      } catch { audioRef.current = null; }
    }
    if (rendererRef.current) rendererRef.current.audio = audioRef.current;
    void audioRef.current?.resume();
    input.centerView();
    logRef.current.clear();
    session.start();
  };

  useEffect(() => {
    if (rendererRef.current) rendererRef.current.hud = hud;
  }, [hud]);

  useEffect(() => {
    session.paused = help && snap.mode === 'play';
  }, [session, help, snap.mode]);

  useEffect(() => {
    if (snap.mode === 'done') onComplete(missionId);
    if (runtime && onMissionEnd && (snap.mode === 'done' || snap.mode === 'over')) {
      const report = reportFrom(runtime);
      if (snap.mode === 'over' && snap.crash) { report.success = false; report.reason = crashText(snap.crash.reason, snap.crash.value); report.score = runtime.computeScore(false); }
      const id = setTimeout(() => onMissionEnd(report), 600);
      return () => clearTimeout(id);
    }
  }, [snap.mode, snap.crash, missionId, onComplete, onMissionEnd, runtime]);

  useEffect(() => {
    const check = () => setPortrait(touchRef.current && window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);


  useEffect(() => {
    const log = logRef.current;
    const offEvents = sim.events.onAny(e => {
      const m = eventMessage(e);
      if (m) log.push(m);
      if (e.t === 'coach') { coachRef.current = { text: t(`coach.${e.tip}`), until: sim.time + COACH_SECONDS }; onTipRef.current?.(e.tip); }
    });
    const r = new FlightRenderer({
      mount: mountRef.current!,
      overlay: ihadssRef.current!,
      session,
      input,
      onFrame: ({ simDt, cockpit, agl }) => {
        const h = sim.player, tp = sim.target;
        if (hudRef.current) {
          hudRef.current.style.display = !cockpit && hudOnRef.current ? '' : 'none';
          hudRef.current.textContent =
            `RAD ALT ${Math.round(Math.max(0, agl) * M_TO_FT)} ft · VS ${Math.round(h.vel.y * MS_TO_FPM)} fpm · ${Math.round(airspeed(h, sim.wind) * MS_TO_KT)} kt · COLL ${Math.round(h.collective * 100)}% · ROTOR ${Math.round(h.rpm * 100)}%`;
        }
        if (radioRef.current) {
          const line = runtime?.radioNow;
          const coach = coachRef.current && coachRef.current.until > sim.time ? coachRef.current.text : null;
          radioRef.current.style.display = line || coach ? '' : 'none';
          if (line) radioRef.current.textContent = `${t(`radio.${line.from}`)}: ${line.text}`;
          else if (coach) radioRef.current.textContent = `${t('radio.control')}: ${coach}`;
        }
        if (missionRef.current && runtime) {
          const prim = runtime.objectives.filter(o => o.def.primary && o.state !== 'pending');
          const done = prim.filter(o => o.state === 'done').length;
          const next = runtime.objectives.find(o => o.state === 'active');
          const dist = tp ? Math.round(Math.hypot(tp.x - h.pos.x, tp.z - h.pos.z)) : null;
          missionRef.current.textContent = `◆ ${t('hud.objectives', { done, total: prim.length })}${next ? `\n${next.def.label}${dist !== null && (next.def.kind === 'reach' || next.def.kind === 'land') ? ` · ${dist >= 1000 ? (dist / 1000).toFixed(1) + 'km' : dist + 'm'}` : ''}` : ''}`;
        } else if (missionRef.current) {
          missionRef.current.textContent = tp
            ? t(tp.area ? 'hud.targetArea' : 'hud.target', { name: tp.area && !tp.raw ? t(`targets.${tp.name}`) : tp.name, dist: Math.round(Math.hypot(tp.x - h.pos.x, tp.z - h.pos.z)) })
            : t('hud.practice');
          missionRef.current.style.color = '#06d6a0';
        }
        log.tick(simDt);
        setTadsOn(sim.tads.active);
        if (touchRef.current) setTouchKey(`${sim.player.engineOn}|${sim.player.landed}|${sim.arms.selected}|${sim.fcr.unlocked}|${sim.cm.chaffUnlocked}|${!!sim.wingman}`);
        const farp = session.mode === 'play' && h.alive && h.landed && farpUnder(sim) >= 0;
        setAtFarp(farp);
        if (farp) setFarpTick(n => (n + 1) % 1000);
        if (msgRef.current) {
          msgRef.current.replaceChildren(...log.items.map(m => {
            const el = document.createElement('div');
            el.textContent = m.text; el.style.color = m.color; el.style.opacity = String(clamp(m.life, 0, 1));
            return el;
          }));
        }
        if (hintRef.current) {
          let hint = '';
          const steps = runtime?.steps;
          if (steps && runtime && session.mode === 'play' && h.alive) {
            const i = runtime.stepIndex;
            const shown = runtime.stepFlash > 0 ? steps[i - 1] : steps[i];
            const text = shown ? (touchRef.current && shown.touch) || shown.text : '';
            hint = !shown ? '' : runtime.stepFlash > 0 ? `✓ ${text}` : `${i + 1}/${steps.length}  ${text}`;
            hintRef.current.classList.toggle('done', runtime.stepFlash > 0);
          } else if (session.mode === 'play' && h.alive) {
            if (!h.engineOn && h.landed && h.fuel > 0) hint = t(touchRef.current ? 'hint.startEngineTouch' : 'hint.startEngineKey');
            else if (h.engineOn && h.rpm < 0.95 && h.landed) hint = t('hint.spooling', { pct: Math.round(h.rpm * 100) });
            else if (h.landed && h.rpm >= 0.95 && h.collective < 0.3) hint = t(touchRef.current ? 'hint.liftTouch' : 'hint.liftKey');
          }
          const step = runtime?.step;
          if (!hint && !steps && step && session.mode === 'play' && h.alive) hint = step;
          hintRef.current.textContent = hint;
        }
      },
    });
    rendererRef.current = r;
    r.applySettings(settingsRef.current);
    if (new URLSearchParams(location.search).has('fps')) { r.showFps = true; r.logStats = true; }
    input.onCommand = cmd => runCommandRef.current(cmd);
    if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __flight: { session, world: sim, input, renderer: r, model: r.model, weapons: { rocketSolution, sightPoint, hellfireSolution } } });
    return () => {
      offEvents();
      r.dispose();
      rendererRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [session, sim, input]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      input.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Enter' && (session.mode === 'brief' || session.mode === 'over')) { begin(); return; }
      const cmd = commandForKey(e.code);
      if (cmd) runCommand(cmd);
    };
    const up = (e: KeyboardEvent) => { input.keys.delete(e.code); };
    const blur = () => input.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  });

  const drag = useRef<{ id: number; x: number; y: number; sx: number; sy: number } | null>(null);
  const pinch = useRef(new Pinch());
  const onPointerDown = (e: RPointerEvent) => {
    if (pinch.current.down(e.pointerId, e.clientX, e.clientY)) { drag.current = null; return; }
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
  };
  const onPointerMove = (e: RPointerEvent) => {
    const step = pinch.current.move(e.pointerId, e.clientX, e.clientY);
    if (step) { if (sim.tads.active) zoomTads(sim.tads, step); return; }
    const d = drag.current;
    if (!d || d.id !== e.pointerId || pinch.current.active) return;
    input.look(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX; d.y = e.clientY;
  };
  const onPointerUp = (e: RPointerEvent) => {
    pinch.current.up(e.pointerId);
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    drag.current = null;
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) rendererRef.current?.clickAt(e.clientX, e.clientY);
  };
  const press = (fn: () => void) => (e: RPointerEvent) => { e.preventDefault(); e.stopPropagation(); fn(); };
  const hold = (set: (on: boolean) => void) => ({
    onPointerDown: (e: RPointerEvent) => { e.preventDefault(); e.stopPropagation(); set(true); },
    onPointerUp: () => set(false), onPointerCancel: () => set(false), onPointerLeave: () => set(false),
  });

  return (
    <div className={touch ? 'flight3d touch' : 'flight3d'}>
      <div
        ref={mountRef}
        className="viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={e => { drag.current = null; pinch.current.up(e.pointerId); }}
        onDoubleClick={() => input.centerView()}
        onWheel={e => { if (sim.tads.active) zoomTads(sim.tads, e.deltaY < 0 ? 1 : -1); }}
      />
      <canvas className="ihadss" ref={ihadssRef} />
      {snap.mode !== 'brief' && (
        <div className="hud3d">
          <div className="mission" ref={missionRef} />
          <div className="telemetry" ref={hudRef} />
          {muted && <div className="score3d">{t('hud.muted')}</div>}
        </div>
      )}
      <div className="messages" ref={msgRef} />
      <div className="radio-sub" ref={radioRef} style={{ display: 'none' }} />
      {radioOpen && snap.mode === 'play' && (
        <div className="radio-menu">
          <b>{t('wingman.title')}</b>
          {WINGMAN_ORDERS.map((o, i) => <button key={o} className={sim.wingman?.order === o ? 'on' : ''} onClick={() => { sim.orderWingman(o); setRadioOpen(false); }}>{i + 1}. {t(`wingman.order.${o}`)}</button>)}
          <small>{t('wingman.close')}</small>
        </div>
      )}
      {portrait && snap.mode === 'play' && <div className="overlay"><div className="card"><h1>↻</h1><p className="sub">{t('flight.rotate')}</p></div></div>}
      {atFarp && <FarpMenu world={sim} />}
      <div className="hint" ref={hintRef} />

      {touch && snap.mode === 'play' && (
        <div className="sticks">
          <VirtualStick className={`stick left size-${settings.controls.touchStickSize}`} radius={STICK_RADIUS[settings.controls.touchStickSize]} label={t('touch.leftStick')} onMove={(x, y) => { input.touch.lx = x; input.touch.ly = y; }} />
          <VirtualStick className={`stick right size-${settings.controls.touchStickSize}`} radius={STICK_RADIUS[settings.controls.touchStickSize]} label={t('touch.rightStick')} onMove={(x, y) => { input.touch.rx = x; input.touch.ry = y; }} />
          <button className="tbtn pause" aria-label={t('touch.pause')} onPointerDown={press(() => setHelp(true))}>≡</button>
          {(!sim.player.engineOn || sim.player.landed) && <button className="tbtn engine" onPointerDown={press(() => sim.toggleEngine())}>{t('touch.engine')}</button>}
          <div className="tcol">
            <button className={`tbtn${tadsOn ? ' on' : ''}`} onPointerDown={press(() => sim.toggleTads())}>{t('touch.tads')}</button>
            {sim.fcr.unlocked && <button className="tbtn" onPointerDown={press(() => sim.fcrScan())}>{t('touch.fcr')}</button>}
            {sim.fcr.unlocked && <button className="tbtn" onPointerDown={press(() => sim.nextFcrTarget())}>{t('touch.target')}</button>}
            <button className="tbtn" onPointerDown={press(() => sim.nextWeapon())}>{t(`touch.weapon.${sim.arms.selected}`)}</button>
            {sim.wingman && sim.wingmanMenu && <button className="tbtn" onPointerDown={press(() => setRadioOpen(v => !v))}>{t('touch.radio')}</button>}
          </div>
          <div className="tcm">
            <button className="tbtn" onPointerDown={press(() => sim.dropFlare())}>{t('touch.flare')}</button>
            {sim.cm.chaffUnlocked && <button className="tbtn" onPointerDown={press(() => sim.dropChaff())}>{t('touch.chaff')}</button>}
          </div>
          {tadsOn && (
            <div className="tads-row">
              <button className="tbtn" onPointerDown={press(() => zoomTads(sim.tads, -1))}>{t('touch.zoomOut')}</button>
              <button className="tbtn" onPointerDown={press(() => zoomTads(sim.tads, 1))}>{t('touch.zoomIn')}</button>
              <button className="tbtn" onPointerDown={press(toggleSensor)}>{t('touch.sensor')}</button>
            </div>
          )}
          <button className="tbtn laser" {...hold(on => { input.touchLaser = on; })}>{t('touch.laser')}</button>
          <button className="tbtn fire" {...hold(on => { input.touchFire = on; })}>{t('touch.fire')}</button>
        </div>
      )}

      {snap.mode === 'brief' && (
        <div className="overlay">
          <div className="card wide">
            <h1>{mission ? mission.title : t('hud.practice')}</h1>
            {mission && !training ? (
              <ul className="objs">{runtime!.mission.objectives.filter(o => !runtime!.mission.initialObjectives || runtime!.mission.initialObjectives.includes(o.id)).map(o => <li key={o.id} className={o.primary ? 'primary' : ''}>{o.primary ? '◆' : '◇'} {o.label}</li>)}</ul>
            ) : (
              <>
                <p className="sub">{mission?.briefing.summary}<br />{t('brief.introCollective')}</p>
                <div className="keys">
                  {tPairs(touch ? 'brief.keysTouch' : 'brief.keysKeyboard').filter(([k]) => touch || !hasString(`brief.keysFor.${missionId}`) || tList(`brief.keysFor.${missionId}`).includes(k)).map(([k, d]) => <Fragment key={k}><b>{k}</b><span>{d}</span></Fragment>)}
                </div>
                <ul className="rules">
                  {tList('brief.rules', { fpm: Math.round(LAND_DESCENT * MS_TO_FPM) }).map(r => <li key={r}>{r}</li>)}
                </ul>
              </>
            )}
            <button className="go" onClick={begin}>{t('brief.start')}</button> <button className="go secondary" onClick={onExit}>{t(mission?.kind === 'instant' ? 'instant.back' : mission && !training ? 'pause.toBriefing' : 'brief.toList')}</button>
          </div>
        </div>
      )}
      {help && snap.mode === 'play' && (
        <div className="overlay">
          <div className="card wide">
            <h1>{t('pause.title')}</h1>
            <div className="pause-buttons">
              <button className="go" onClick={() => setHelp(false)}>{t('brief.continue')}</button>
              <button className="go secondary" onClick={() => setShowKeys(v => !v)}>{t('pause.controls')}</button>
              <button className="go secondary" onClick={() => setShowSettings(v => !v)}>{t('pause.settings')}</button>
              {touch && <button className="go secondary" onClick={() => { toggleView(); setHelp(false); }}>{t('pause.view')}</button>}
              {touch && <button className="go secondary" onClick={() => sim.toggleEngine()}>{t(sim.player.engineOn ? 'pause.engineOff' : 'pause.engineOn')}</button>}
              <button className="go secondary" onClick={toggleVoice}>{t(voiceOn ? 'brief.voiceOff' : 'brief.voiceOn')}</button>
              <button className="go secondary" onClick={() => { setHelp(false); begin(); }}>{t('brief.restart')}</button>
              {runtime && !training && <button className="go secondary" onClick={() => { setHelp(false); runtime.endNow(); }}>{t('pause.endMission')}</button>}
              {(!runtime || training) && <button className="go secondary" onClick={onExit}>{t('brief.toList')}</button>}
            </div>
            {showSettings && <SettingsPanel settings={settings} onChange={s2 => onSettings?.(s2)} />}
            {showKeys && (
              <div className="keys">
                {tPairs(touch ? 'brief.keysTouch' : 'brief.keysKeyboard').map(([k, d]) => <Fragment key={k}><b>{k}</b><span>{d}</span></Fragment>)}
              </div>
            )}
          </div>
        </div>
      )}

      {snap.mode === 'over' && !help && !runtime && (
        <div className="overlay">
          <div className="card">
            <h1>{t(snap.failure ? 'fail.title' : 'crash.title')}</h1>
            <p className="sub">{snap.failure ? t(`fail.${snap.failure}`) : snap.crash ? crashText(snap.crash.reason, snap.crash.value) : ''}</p>
            <button className="go" onClick={begin}>{t('crash.retry')}</button> <button className="go secondary" onClick={onExit}>{t('brief.toList')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
