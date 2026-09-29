import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent } from 'react';
import { assets } from '../../assets/loader';
import { GameAudio } from '../../audio/game';
import { loadVoiceEnabled, saveVoiceEnabled } from '../../audio/voice';
import { t, tList, tPairs } from '../../content/strings';
import { clamp } from '../../core/math';
import { M_TO_FT, MS_TO_FPM, MS_TO_KT } from '../../core/units';
import { FlightRenderer } from '../../render/renderer';
import { LAND_DESCENT } from '../../sim/heli/airframe';
import { airspeed } from '../../sim/heli/state';
import { FlightSession } from '../../sim/session';
import { zoomTads } from '../../sim/sensors/tads';
import { sightPoint } from '../../sim/weapons/ballistics';
import { hellfireSolution } from '../../sim/weapons/hellfire';
import { rocketSolution } from '../../sim/weapons/rockets';
import { createObjective } from '../../sim/training';
import { T1_MAX_FPM, TrainingT1 } from '../../sim/training/t1';
import { T3_GUN_NEED, T3_NEED, T3_TARGETS } from '../../sim/training/t3';
import { T4_NEED, TrainingT4 } from '../../sim/training/t4';
import { commandForKey, PREVENT_DEFAULT, type Command } from '../../input/bindings';
import { FlightInput } from '../../input/input';
import { crashText, eventMessage, MessageLog } from '../flight/messages';
import { VirtualStick } from '../components/VirtualStick';

interface FlightProps { missionId: string; touch: boolean; onExit: () => void; onComplete: (id: string) => void }

export function Flight({ missionId, touch, onExit, onComplete }: FlightProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const missionRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [session] = useState(() => new FlightSession((Math.random() * 1e9) | 0, createObjective(missionId)));
  const sim = session.world;
  const logRef = useRef(new MessageLog());
  const rendererRef = useRef<FlightRenderer | null>(null);
  const [input] = useState(() => new FlightInput());
  const audioRef = useRef<GameAudio | null>(null);
  const touchRef = useRef(touch);
  touchRef.current = touch;
  const [hud, setHud] = useState(true);
  const hudOnRef = useRef(true);
  hudOnRef.current = hud;
  const ihadssRef = useRef<HTMLCanvasElement>(null);
  const [help, setHelp] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceOn, setVoiceOn] = useState(() => loadVoiceEnabled());
  const toggleVoice = () => { const on = !voiceOn; setVoiceOn(on); saveVoiceEnabled(on); if (audioRef.current) audioRef.current.voice.enabled = on; };
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);

  const toggleView = () => rendererRef.current?.toggleView();
  const toggleSensor = () => { sim.tads.sensor = sim.tads.sensor === 'tv' ? 'flir' : 'tv'; };
  const [tadsOn, setTadsOn] = useState(false);

  const runCommand = (cmd: Command) => {
    switch (cmd) {
      case 'engine': sim.toggleEngine(); break;
      case 'weapon1': sim.selectWeapon(1); break;
      case 'weapon2': sim.selectWeapon(2); break;
      case 'weapon3': sim.selectWeapon(3); break;
      case 'weapon4': sim.selectWeapon(4); break;
      case 'weaponNext': sim.nextWeapon(); break;
      case 'view': if (sim.tads.active) toggleSensor(); else toggleView(); break;
      case 'tads': sim.toggleTads(); break;
      case 'flare': sim.dropFlare(); break;
      case 'chaff': sim.dropChaff(); break;
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
  }, [snap.mode, missionId, onComplete]);

  const t1Pad = sim.pads[TrainingT1.nearestPad(sim)];

  useEffect(() => {
    const log = logRef.current;
    const offEvents = sim.events.onAny(e => {
      const m = eventMessage(e);
      if (m) log.push(m);
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
        if (missionRef.current) {
          missionRef.current.textContent = tp
            ? t(tp.area ? 'hud.targetArea' : 'hud.target', { name: tp.area ? t(`targets.${tp.name}`) : tp.name, dist: Math.round(Math.hypot(tp.x - h.pos.x, tp.z - h.pos.z)) })
            : t('hud.practice');
          missionRef.current.style.color = '#06d6a0';
        }
        log.tick(simDt);
        setTadsOn(sim.tads.active);
        if (msgRef.current) {
          msgRef.current.replaceChildren(...log.items.map(m => {
            const el = document.createElement('div');
            el.textContent = m.text; el.style.color = m.color; el.style.opacity = String(clamp(m.life, 0, 1));
            return el;
          }));
        }
        if (hintRef.current) {
          let hint = '';
          if (session.mode === 'play' && h.alive) {
            if (!h.engineOn && h.landed && h.fuel > 0) hint = t(touchRef.current ? 'hint.startEngineTouch' : 'hint.startEngineKey');
            else if (h.engineOn && h.rpm < 0.95 && h.landed) hint = t('hint.spooling', { pct: Math.round(h.rpm * 100) });
            else if (h.landed && h.rpm >= 0.95 && h.collective < 0.3) hint = t(touchRef.current ? 'hint.liftTouch' : 'hint.liftKey');
          }
          const step = session.objective?.step;
          if (!hint && step && session.mode === 'play' && h.alive) hint = t(`training.${missionId}.steps.${step}`);
          hintRef.current.textContent = hint;
        }
      },
    });
    rendererRef.current = r;
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
  const onPointerDown = (e: RPointerEvent) => { drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }; };
  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    input.look(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX; d.y = e.clientY;
  };
  const onPointerUp = (e: RPointerEvent) => {
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    drag.current = null;
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) rendererRef.current?.clickAt(e.clientX, e.clientY);
  };

  return (
    <div className="flight3d">
      <div
        ref={mountRef}
        className="viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
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
      <div className="hint" ref={hintRef} />

      {touch && snap.mode === 'play' && (
        <div className="sticks">
          <VirtualStick className="stick left" label={t('touch.leftStick')} onMove={(x, y) => { input.touch.lx = x; input.touch.ly = y; }} />
          <VirtualStick className="stick right" label={t('touch.rightStick')} onMove={(x, y) => { input.touch.rx = x; input.touch.ry = y; }} />
          <button className="tbtn engine" onPointerDown={e => { e.preventDefault(); sim.toggleEngine(); }}>{t('touch.engine')}</button>
          <button className="tbtn view" onPointerDown={e => { e.preventDefault(); toggleView(); }}>{t('touch.view')}</button>
          <button className="tbtn tads" onPointerDown={e => { e.preventDefault(); sim.toggleTads(); }}>{t('touch.tads')}</button>
          {tadsOn && (
            <div className="tads-row">
              <button className="tbtn" onPointerDown={e => { e.preventDefault(); zoomTads(sim.tads, -1); }}>{t('touch.zoomOut')}</button>
              <button className="tbtn" onPointerDown={e => { e.preventDefault(); zoomTads(sim.tads, 1); }}>{t('touch.zoomIn')}</button>
              <button className="tbtn" onPointerDown={e => { e.preventDefault(); toggleSensor(); }}>{t('touch.sensor')}</button>
              <button
                className="tbtn laser"
                onPointerDown={e => { e.preventDefault(); input.touchLaser = true; }}
                onPointerUp={() => { input.touchLaser = false; }}
                onPointerCancel={() => { input.touchLaser = false; }}
                onPointerLeave={() => { input.touchLaser = false; }}
              >{t('touch.laser')}</button>
            </div>
          )}
          <button
            className="tbtn fire"
            onPointerDown={e => { e.preventDefault(); input.touchFire = true; }}
            onPointerUp={e => { e.preventDefault(); input.touchFire = false; }}
            onPointerCancel={() => { input.touchFire = false; }}
            onPointerLeave={() => { input.touchFire = false; }}
          >{t('touch.fire')}</button>
        </div>
      )}

      {(help || snap.mode === 'brief') && (
        <div className="overlay">
          <div className="card wide">
            <h1>{t(`training.${missionId}.name`)}</h1>
            <p className="sub">{t(`training.${missionId}.brief`, { pad: missionId === 't4' ? sim.pads[TrainingT4.farPad(sim)].name : t1Pad.name, max: T1_MAX_FPM, need: missionId === 't4' ? T4_NEED : T3_NEED, gunNeed: T3_GUN_NEED, total: T3_TARGETS.length })}<br />{t('brief.introCollective')}</p>
            <div className="keys">
              {tPairs(touch ? 'brief.keysTouch' : 'brief.keysKeyboard').map(([k, d]) => <Fragment key={k}><b>{k}</b><span>{d}</span></Fragment>)}
            </div>
            <ul className="rules">
              {tList('brief.rules', { fpm: Math.round(LAND_DESCENT * MS_TO_FPM) }).map(r => <li key={r}>{r}</li>)}
            </ul>
            {snap.mode === 'brief'
              ? <><button className="go" onClick={begin}>{t('brief.start')}</button> <button className="go secondary" onClick={onExit}>{t('brief.toList')}</button></>
              : <><button className="go" onClick={() => setHelp(false)}>{t('brief.continue')}</button> <button className="go secondary" onClick={toggleVoice}>{t(voiceOn ? 'brief.voiceOff' : 'brief.voiceOn')}</button> <button className="go secondary" onClick={() => { setHelp(false); begin(); }}>{t('brief.restart')}</button> <button className="go secondary" onClick={onExit}>{t('brief.toList')}</button></>}
          </div>
        </div>
      )}

      {snap.mode === 'over' && !help && (
        <div className="overlay">
          <div className="card">
            <h1>{t(snap.failure ? 'fail.title' : 'crash.title')}</h1>
            <p className="sub">{snap.failure ? t(`fail.${snap.failure}`) : snap.crash ? crashText(snap.crash.reason, snap.crash.value) : ''}</p>
            <button className="go" onClick={begin}>{t('crash.retry')}</button> <button className="go secondary" onClick={onExit}>{t('brief.toList')}</button>
          </div>
        </div>
      )}
      {snap.mode === 'done' && (
        <div className="overlay">
          <div className="card">
            <h1>{t('result.title')}</h1>
            <div className="result">
              {Object.entries(snap.result ?? {}).filter(([k]) => RESULT_FORMAT[k]).map(([k, v]) => (
                <Fragment key={k}><b>{t(`result.keys.${k}`)}</b><span>{RESULT_FORMAT[k](v, snap.result ?? {})}</span></Fragment>
              ))}
            </div>
            <button className="go" onClick={begin}>{t('result.again')}</button> <button className="go secondary" onClick={onExit}>{t('result.toList')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const RESULT_FORMAT: Record<string, (v: number, all: Record<string, number>) => string> = {
  timeSec: v => formatTime(v),
  fpm: v => `${Math.round(v)} fpm`,
  destroyed: (v, all) => `${v} / ${all.targets ?? v}`,
  accuracy: v => `${Math.round(v)}%`,
  missiles: v => `${v}`,
  loal: v => `${v}`,
};

function formatTime(sec: number) {
  const m = Math.floor(sec / 60), r = Math.round(sec % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
