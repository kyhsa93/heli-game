import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent } from 'react';
import * as THREE from 'three';
import { RotorAudio } from '../sim3d/audio';
import { buildHeli } from '../sim3d/heliModel';
import { crashText, eventMessage, type Message } from './messages';
import { clamp } from '../core/math';
import { M_TO_FT, MS_TO_FPM, MS_TO_KT } from '../core/units';
import { FlightInput } from '../sim3d/input';
import { Instruments } from '../sim3d/instruments';
import { buildWorld } from '../sim3d/scene';
import { drawIhadss } from '../sim3d/ihadss';
import { BLADES, EYE, ROTOR_HZ } from '../sim/heli/airframe';
import { agl as aglOf, airspeed } from '../sim/heli/state';
import { FlightSession } from '../sim/session';
import { STEP } from '../sim/world';
import { VirtualStick } from './VirtualStick';

type View = 'cockpit' | 'chase';

export function Flight3D({ touch }: { touch: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const missionRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [session] = useState(() => new FlightSession((Math.random() * 1e9) | 0));
  const sim = session.world;
  const messagesRef = useRef<Message[]>([]);
  const [input] = useState(() => new FlightInput());
  const audioRef = useRef<RotorAudio | null>(null);
  const viewRef = useRef<View>('cockpit');
  const touchRef = useRef(touch);
  touchRef.current = touch;
  const [hud, setHud] = useState(true);
  const hudOnRef = useRef(true);
  hudOnRef.current = hud;
  const ihadssRef = useRef<HTMLCanvasElement>(null);
  const [help, setHelp] = useState(false);
  const [muted, setMuted] = useState(false);
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);

  const toggleView = () => { viewRef.current = viewRef.current === 'cockpit' ? 'chase' : 'cockpit'; };

  const begin = () => {
    if (!audioRef.current) {
      try { audioRef.current = new RotorAudio(); } catch { audioRef.current = null; }
    }
    void audioRef.current?.resume();
    input.centerView();
    messagesRef.current = [];
    session.start();
  };

  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scn = buildWorld(sim.terrain);
    const model = buildHeli();
    scn.scene.add(model.root);
    const inst = new Instruments(sim);
    const tex = inst.textures();
    for (const key of Object.keys(tex) as (keyof typeof tex)[]) {
      const mat = model.screens[key].material as THREE.MeshBasicMaterial;
      mat.map = tex[key];
      mat.needsUpdate = true;
    }
    const overlay = ihadssRef.current!;
    const og = overlay.getContext('2d')!;

    const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 7000);
    model.head.add(camera);
    const chasePos = new THREE.Vector3();
    let chaseInit = false;

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      overlay.width = w * dpr; overlay.height = h * dpr;
      og.setTransform(dpr, 0, 0, dpr, 0, 0);
      camera.aspect = w / h;
      camera.fov = w >= h ? 72 : Math.min(100, 2 * Math.atan(Math.tan(37 * Math.PI / 180) * h / w) * 180 / Math.PI);
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __flight: { session, world: sim, input, view: viewRef, model } });
    const offEvents = sim.events.onAny(e => {
      const m = eventMessage(e);
      if (!m) return;
      const list = messagesRef.current;
      if (list.some(x => x.text === m.text)) return;
      list.push({ ...m, life: 3 });
      if (list.length > 4) list.shift();
    });
    input.onEngine = () => sim.toggleEngine();
    input.onView = toggleView;

    let raf = 0, last = performance.now(), acc = 0, frame = 0, rotorAngle = 0, tailAngle = 0;
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      input.update(sim, dt);
      acc += dt;
      while (acc >= STEP) { session.step(STEP); acc -= STEP; }
      const h = sim.player, c = sim.controls;

      model.root.position.copy(h.pos);
      model.root.quaternion.copy(h.q);
      model.root.visible = h.alive || session.mode === 'brief';

      rotorAngle += h.rpm * Math.PI * 2 * ROTOR_HZ * dt;
      tailAngle += h.rpm * Math.PI * 2 * 23 * dt;
      model.rotor.rotation.y = rotorAngle;
      model.tailRotor.rotation.x = tailAngle;
      const blur = clamp((h.rpm - 0.25) / 0.5, 0, 1);
      for (const b of model.blades) (b.material as THREE.MeshLambertMaterial).opacity = 1 - blur * 0.85;
      (model.disc.material as THREE.MeshBasicMaterial).opacity = blur * 0.16;

      model.cyclic.rotation.set(-c.cyclicY * 0.25, 0, -c.cyclicX * 0.25);
      model.collective.rotation.x = h.collective * 0.45;
      model.pedalL.position.z = -3.18 + c.pedal * 0.05;
      model.pedalR.position.z = -3.18 - c.pedal * 0.05;

      const cockpit = viewRef.current === 'cockpit';
      model.shell.visible = !cockpit;
      if (cockpit) {
        if (camera.parent !== model.head) { model.head.add(camera); camera.position.set(0, 0, 0); }
        const vib = h.rpm * (0.0012 + airspeed(h, sim.wind) * 0.00003) * (h.landed ? 0.5 : 1);
        model.head.position.set(
          EYE.x + (Math.random() - 0.5) * vib,
          EYE.y + Math.sin(now * 0.001 * Math.PI * 2 * ROTOR_HZ * BLADES * h.rpm) * vib + (Math.random() - 0.5) * vib,
          EYE.z,
        );
        camera.rotation.set(input.headPitch, input.headYaw, 0, 'YXZ');
        chaseInit = false;
      } else {
        if (camera.parent !== scn.scene) scn.scene.add(camera);
        const yawDir = tmp.set(-Math.sin(h.yaw), 0, -Math.cos(h.yaw));
        const want = tmp2.copy(h.pos).addScaledVector(yawDir, -30);
        want.y += 9;
        want.y = Math.max(want.y, sim.terrain.surfaceAt(want.x, want.z) + 2);
        if (!chaseInit) { chasePos.copy(want); chaseInit = true; }
        chasePos.lerp(want, Math.min(1, dt * 3));
        camera.position.copy(chasePos);
        camera.lookAt(h.pos.x, h.pos.y + 1, h.pos.z);
      }

      const tp = sim.target;
      scn.beam.visible = !!tp;
      if (tp) scn.beam.position.set(tp.x, tp.y + 250, tp.z);
      const blink = Math.sin(now * 0.008) > 0;
      sim.pads.forEach((p, i) => {
        const pv = scn.pads[i];
        const target = !!tp && Math.hypot(p.x - tp.x, p.z - tp.z) < 1;
        for (const l of pv.lights) {
          const m = l.material as THREE.MeshBasicMaterial;
          m.color.set(target ? (blink ? 0x06d6a0 : 0x222222) : p.base ? 0x4cc9f0 : 0x886633);
        }
        const ws = sim.wind.length();
        pv.sock.rotation.set(0, Math.atan2(-sim.wind.z, sim.wind.x), -(1 - Math.min(1, ws / 8)) * 0.9);
      });

      const agl = aglOf(h, sim.terrain);
      const sy = sim.terrain.surfaceAt(h.pos.x, h.pos.z);
      scn.shadow.visible = h.alive && agl < 90;
      scn.shadow.position.set(h.pos.x, sy + 0.12, h.pos.z);
      scn.shadow.scale.setScalar(5.5 + Math.max(0, agl) * 0.03);
      (scn.shadow.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - clamp(agl / 90, 0, 1));

      camera.getWorldPosition(tmp);
      scn.sky.position.copy(tmp);

      inst.draw(sim, frame++ % 3);
      renderer.render(scn.scene, camera);

      og.clearRect(0, 0, overlay.width, overlay.height);
      if (cockpit && hudOnRef.current && h.alive && session.mode !== 'brief') drawIhadss(og, mount.clientWidth, mount.clientHeight, sim, camera);

      audioRef.current?.update({
        rpm: h.alive ? h.rpm : 0, collective: h.collective, airspeed: airspeed(h, sim.wind),
        warn: h.alive && session.mode === 'play' && ((h.rpm < 0.85 && !h.landed) || h.fuel < 10),
      });

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
      if (msgRef.current) {
        const list = messagesRef.current;
        for (const m of list) m.life -= dt;
        messagesRef.current = list.filter(m => m.life > 0);
        msgRef.current.replaceChildren(...messagesRef.current.map(m => {
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

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      scn.dispose();
      offEvents();
      inst.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [session, sim, input]);

  useEffect(() => {
    const prevent = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown']);
    const down = (e: KeyboardEvent) => {
      if (prevent.has(e.code)) e.preventDefault();
      input.keys.add(e.code);
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyI': sim.toggleEngine(); break;
        case 'KeyV': toggleView(); break;
        case 'KeyC': input.centerView(); break;
        case 'KeyU': setHud(v => !v); break;
        case 'KeyH': setHelp(v => !v); break;
        case 'KeyM': if (audioRef.current) setMuted(audioRef.current.toggleMute()); break;
        case 'KeyR': if (session.mode !== 'brief') begin(); break;
        case 'Enter': if (session.mode === 'brief' || session.mode === 'over') begin(); break;
      }
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
              <b>R</b><span>다시 시작</span>
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
              : <button className="go" onClick={() => setHelp(false)}>닫기</button>}
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
