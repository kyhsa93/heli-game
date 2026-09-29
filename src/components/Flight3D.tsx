import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent } from 'react';
import { RotorAudio } from '../audio/rotor';
import { clamp } from '../core/math';
import { M_TO_FT, MS_TO_FPM, MS_TO_KT } from '../core/units';
import { FlightRenderer } from '../render/renderer';
import { airspeed } from '../sim/heli/state';
import { FlightSession } from '../sim/session';
import { commandForKey, PREVENT_DEFAULT, type Command } from '../input/bindings';
import { FlightInput } from '../input/input';
import { crashText, eventMessage, MessageLog } from './messages';
import { VirtualStick } from './VirtualStick';

export function Flight3D({ touch }: { touch: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const missionRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [session] = useState(() => new FlightSession((Math.random() * 1e9) | 0));
  const sim = session.world;
  const logRef = useRef(new MessageLog());
  const rendererRef = useRef<FlightRenderer | null>(null);
  const [input] = useState(() => new FlightInput());
  const audioRef = useRef<RotorAudio | null>(null);
  const touchRef = useRef(touch);
  touchRef.current = touch;
  const [hud, setHud] = useState(true);
  const hudOnRef = useRef(true);
  hudOnRef.current = hud;
  const ihadssRef = useRef<HTMLCanvasElement>(null);
  const [help, setHelp] = useState(false);
  const [muted, setMuted] = useState(false);
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);

  const toggleView = () => rendererRef.current?.toggleView();

  const runCommand = (cmd: Command) => {
    switch (cmd) {
      case 'engine': sim.toggleEngine(); break;
      case 'view': toggleView(); break;
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
      try { audioRef.current = new RotorAudio(); } catch { audioRef.current = null; }
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
            ? `목표: ${tp.name} 패드 (${Math.round(Math.hypot(tp.x - h.pos.x, tp.z - h.pos.z))} m)`
            : '비행 연습';
          missionRef.current.style.color = '#06d6a0';
        }
        log.tick(simDt);
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
            if (!h.engineOn && h.landed && h.fuel > 0) hint = touchRef.current ? '시동 버튼으로 엔진을 켜세요' : 'I 키로 엔진 시동';
            else if (h.engineOn && h.rpm < 0.95 && h.landed) hint = `로터 가속 중… ${Math.round(h.rpm * 100)}%`;
            else if (h.landed && h.rpm >= 0.95 && h.collective < 0.3) hint = touchRef.current ? '왼쪽 스틱을 위로 — 콜렉티브를 올려 이륙' : 'W 키로 콜렉티브를 올려 이륙';
          }
          hintRef.current.textContent = hint;
        }
      },
    });
    rendererRef.current = r;
    input.onCommand = cmd => runCommandRef.current(cmd);
    if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __flight: { session, world: sim, input, renderer: r, model: r.model } });
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

  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const onPointerDown = (e: RPointerEvent) => { drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; };
  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    input.look(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX; d.y = e.clientY;
  };
  const onPointerUp = (e: RPointerEvent) => { if (drag.current?.id === e.pointerId) drag.current = null; };

  return (
    <div className="flight3d">
      <div
        ref={mountRef}
        className="viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => input.centerView()}
      />
      <canvas className="ihadss" ref={ihadssRef} />
      {snap.mode !== 'brief' && (
        <div className="hud3d">
          <div className="mission" ref={missionRef} />
          <div className="telemetry" ref={hudRef} />
          {muted && <div className="score3d">음소거</div>}
        </div>
      )}
      <div className="messages" ref={msgRef} />
      <div className="hint" ref={hintRef} />

      {touch && snap.mode === 'play' && (
        <div className="sticks">
          <VirtualStick className="stick left" label="콜렉티브 · 페달" onMove={(x, y) => { input.touch.lx = x; input.touch.ly = y; }} />
          <VirtualStick className="stick right" label="사이클릭" onMove={(x, y) => { input.touch.rx = x; input.touch.ry = y; }} />
          <button className="tbtn engine" onPointerDown={e => { e.preventDefault(); sim.toggleEngine(); }}>시동</button>
          <button className="tbtn view" onPointerDown={e => { e.preventDefault(); toggleView(); }}>시점</button>
        </div>
      )}

      {(help || snap.mode === 'brief') && (
        <div className="overlay">
          <div className="card wide">
            <h1>AH-64 조종석</h1>
            <p className="sub">아파치 뒷좌석(조종사석)에 앉았습니다. 베이스(H)에서 시동을 걸고 자유롭게 비행 연습을 하세요.<br />
              콜렉티브는 놓아도 그 자리에 머뭅니다 — 실제 헬기처럼요.</p>
            {touch ? (
              <div className="keys">
                <b>시동 버튼</b><span>엔진 시동 / 정지 (로터가 100%까지 오를 때까지 대기)</span>
                <b>왼쪽 스틱 ↕</b><span>콜렉티브 올리기 / 내리기 — 놓으면 그 자리 유지</span>
                <b>왼쪽 스틱 ↔</b><span>페달 — 기수 좌우 회전</span>
                <b>오른쪽 스틱</b><span>사이클릭 — 기수 숙이기·들기, 좌우 기울이기</span>
                <b>화면 드래그</b><span>고개 돌리기 (더블탭: 정면) · 시점 버튼: 외부 시점</span>
              </div>
            ) : (
            <div className="keys">
              <b>I</b><span>엔진 시동 / 정지 (로터가 100%까지 오를 때까지 대기)</span>
              <b>W / S</b><span>콜렉티브 올리기 / 내리기 (Shift: 미세 조정)</span>
              <b>방향키</b><span>사이클릭 — 기수 숙이기·들기, 좌우 기울이기</span>
              <b>A / D</b><span>페달 — 기수 좌우 회전</span>
              <b>마우스 드래그</b><span>고개 돌리기 (C 또는 더블클릭: 정면)</span>
              <b>V · U · M</b><span>외부 시점 · 헬멧 심볼(IHADSS) · 소리</span>
              <b>Esc</b><span>일시정지 (다시 시작)</span>
            </div>
            )}
            <ul className="rules">
              <li>착륙: 하강률 {Math.round(3 * MS_TO_FPM)} fpm 이하, 거의 멈춘 채로, 수평으로.</li>
              <li>H 패드에 착륙하면 연료가 채워집니다.</li>
              <li>헬멧 심볼의 방위 화살표·마름모와 오른쪽 MPD 지도(TSD)가 목표를 가리킵니다. 가운데 선은 기체가 흘러가는 방향(호버 벡터)입니다.</li>
              <li>엔진이 꺼지면 콜렉티브를 내려 로터를 살리고(오토로테이션), 지면 직전에 올리세요.</li>
              <li>게임패드: 왼쪽 스틱 콜렉티브·페달, 오른쪽 스틱 사이클릭, A 시동, Y 시점.</li>
            </ul>
            {snap.mode === 'brief'
              ? <button className="go" onClick={begin}>비행 시작</button>
              : <><button className="go" onClick={() => setHelp(false)}>계속</button> <button className="go secondary" onClick={() => { setHelp(false); begin(); }}>다시 시작</button></>}
          </div>
        </div>
      )}

      {snap.mode === 'over' && !help && (
        <div className="overlay">
          <div className="card">
            <h1>추락</h1>
            <p className="sub">{snap.crash ? crashText(snap.crash.reason, snap.crash.value) : ''}</p>
            <button className="go" onClick={begin}>다시 비행</button>
          </div>
        </div>
      )}
    </div>
  );
}
