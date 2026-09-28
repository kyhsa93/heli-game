import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent } from 'react';
import * as THREE from 'three';
import { STEP } from '../game/constants';
import { clamp } from '../game/math';
import { RotorAudio } from '../sim3d/audio';
import { buildHeli } from '../sim3d/heliModel';
import { FlightInput } from '../sim3d/input';
import { Instruments } from '../sim3d/instruments';
import { buildWorld } from '../sim3d/scene';
import { EYE, M_TO_FT, MS_TO_FPM, MS_TO_KT, Sim, type BestStore3 } from '../sim3d/sim';
import { VirtualStick } from './VirtualStick';

const bestStore: BestStore3 = {
  load() {
    try { return Number(localStorage.getItem('heli3d-best')) || 0; } catch { return 0; }
  },
  save(v) {
    try { localStorage.setItem('heli3d-best', String(v)); } catch { /* storage unavailable */ }
  },
};

type View = 'cockpit' | 'chase';

export default function Flight3D({ onExit, touch }: { onExit: () => void; touch: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const missionRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [sim] = useState(() => new Sim({ store: bestStore }));
  const [input] = useState(() => new FlightInput());
  const audioRef = useRef<RotorAudio | null>(null);
  const viewRef = useRef<View>('cockpit');
  const touchRef = useRef(touch);
  touchRef.current = touch;
  const [hud, setHud] = useState(true);
  const [help, setHelp] = useState(false);
  const [muted, setMuted] = useState(false);
  const snap = useSyncExternalStore(sim.subscribe, sim.getSnapshot);

  const toggleView = () => { viewRef.current = viewRef.current === 'cockpit' ? 'chase' : 'cockpit'; };

  const begin = () => {
    if (!audioRef.current) {
      try { audioRef.current = new RotorAudio(); } catch { audioRef.current = null; }
    }
    void audioRef.current?.resume();
    input.centerView();
    sim.start();
  };

  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const world = buildWorld(sim.terrain);
    const model = buildHeli();
    world.scene.add(model.root);
    const inst = new Instruments(sim);
    (model.panel.material as THREE.MeshBasicMaterial).map = inst.texture;
    (model.panel.material as THREE.MeshBasicMaterial).needsUpdate = true;

    const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 7000);
    model.head.add(camera);
    const chasePos = new THREE.Vector3();
    let chaseInit = false;

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.fov = w >= h ? 72 : Math.min(100, 2 * Math.atan(Math.tan(37 * Math.PI / 180) * h / w) * 180 / Math.PI);
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __flight: { sim, input, view: viewRef } });
    input.onEngine = () => sim.toggleEngine();
    input.onView = toggleView;

    let raf = 0, last = performance.now(), acc = 0, frame = 0, rotorAngle = 0, tailAngle = 0;
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      input.update(sim, dt);
      acc += dt;
      while (acc >= STEP) { sim.step(STEP); acc -= STEP; }
      const h = sim.heli, c = sim.controls;

      model.root.position.copy(h.pos);
      model.root.quaternion.copy(h.q);
      model.root.visible = h.alive || sim.mode === 'brief';

      rotorAngle += h.rpm * Math.PI * 2 * 6.6 * dt;
      tailAngle += h.rpm * Math.PI * 2 * 40 * dt;
      model.rotor.rotation.y = rotorAngle;
      model.tailRotor.rotation.x = tailAngle;
      const blur = clamp((h.rpm - 0.25) / 0.5, 0, 1);
      for (const b of model.blades) (b.material as THREE.MeshLambertMaterial).opacity = 1 - blur * 0.85;
      (model.disc.material as THREE.MeshBasicMaterial).opacity = blur * 0.16;

      model.cyclic.rotation.set(-c.cyclicY * 0.25, 0, -c.cyclicX * 0.25);
      model.collective.rotation.x = h.collective * 0.45;
      model.pedalL.position.z = -1.55 + c.pedal * 0.06;
      model.pedalR.position.z = -1.55 - c.pedal * 0.06;

      const cockpit = viewRef.current === 'cockpit';
      model.exterior.visible = !cockpit;
      model.cockpit.visible = cockpit;
      if (cockpit) {
        if (camera.parent !== model.head) { model.head.add(camera); camera.position.set(0, 0, 0); }
        const vib = h.rpm * (0.0012 + sim.airspeed() * 0.00003) * (h.landed ? 0.5 : 1);
        model.head.position.set(
          EYE.x + (Math.random() - 0.5) * vib,
          EYE.y + Math.sin(now * 0.001 * Math.PI * 2 * 13 * h.rpm) * vib + (Math.random() - 0.5) * vib,
          EYE.z,
        );
        camera.rotation.set(input.headPitch, input.headYaw, 0, 'YXZ');
        chaseInit = false;
      } else {
        if (camera.parent !== world.scene) world.scene.add(camera);
        const yawDir = tmp.set(-Math.sin(h.yaw), 0, -Math.cos(h.yaw));
        const want = tmp2.copy(h.pos).addScaledVector(yawDir, -18);
        want.y += 6;
        want.y = Math.max(want.y, sim.terrain.surfaceAt(want.x, want.z) + 2);
        if (!chaseInit) { chasePos.copy(want); chaseInit = true; }
        chasePos.lerp(want, Math.min(1, dt * 3));
        camera.position.copy(chasePos);
        camera.lookAt(h.pos.x, h.pos.y + 1, h.pos.z);
      }

      const tp = sim.targetPad();
      world.beam.position.set(tp.x, tp.y + 250, tp.z);
      (world.beam.material as THREE.MeshBasicMaterial).color.set(sim.mission.stage === 'pickup' ? 0xffd166 : 0x06d6a0);
      const blink = Math.sin(now * 0.008) > 0;
      sim.pads.forEach((p, i) => {
        const pv = world.pads[i];
        const target = p === tp;
        for (const l of pv.lights) {
          const m = l.material as THREE.MeshBasicMaterial;
          m.color.set(target ? (blink ? (sim.mission.stage === 'pickup' ? 0xffd166 : 0x06d6a0) : 0x222222) : p.base ? 0x4cc9f0 : 0x886633);
        }
        const ws = sim.wind.length();
        pv.sock.rotation.set(0, Math.atan2(-sim.wind.z, sim.wind.x), -(1 - Math.min(1, ws / 8)) * 0.9);
      });

      const agl = sim.agl();
      const sy = sim.terrain.surfaceAt(h.pos.x, h.pos.z);
      world.shadow.visible = h.alive && agl < 90;
      world.shadow.position.set(h.pos.x, sy + 0.12, h.pos.z);
      world.shadow.scale.setScalar(3.2 + Math.max(0, agl) * 0.02);
      (world.shadow.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - clamp(agl / 90, 0, 1));

      camera.getWorldPosition(tmp);
      world.sky.position.copy(tmp);

      if (frame++ % 2 === 0) inst.draw(sim);
      renderer.render(world.scene, camera);

      audioRef.current?.update({
        rpm: h.alive ? h.rpm : 0, collective: h.collective, airspeed: sim.airspeed(),
        warn: h.alive && sim.mode === 'play' && ((h.rpm < 0.85 && !h.landed) || h.fuel < 10),
      });

      if (hudRef.current) {
        hudRef.current.textContent =
          `RAD ALT ${Math.round(Math.max(0, agl) * M_TO_FT)} ft · VS ${Math.round(h.vel.y * MS_TO_FPM)} fpm · ${Math.round(sim.airspeed() * MS_TO_KT)} kt · COLL ${Math.round(h.collective * 100)}% · ROTOR ${Math.round(h.rpm * 100)}%`;
      }
      if (missionRef.current) {
        const m = sim.mission;
        const d = Math.round(Math.hypot(tp.x - h.pos.x, tp.z - h.pos.z));
        missionRef.current.textContent = m.stage === 'pickup'
          ? `화물 픽업: ${tp.name} 패드 (${d} m)${m.timer > 0 ? ` — 적재 중 ${Math.ceil(3 - m.timer)}` : ''}`
          : `화물 배달: ${tp.name} 패드 (${d} m)${m.timer > 0 ? ` — 하역 중 ${Math.ceil(2 - m.timer)}` : ''}`;
        missionRef.current.style.color = m.stage === 'pickup' ? '#ffd166' : '#06d6a0';
      }
      if (msgRef.current) {
        msgRef.current.replaceChildren(...sim.messages.map(m => {
          const el = document.createElement('div');
          el.textContent = m.text; el.style.color = m.color; el.style.opacity = String(clamp(m.life, 0, 1));
          return el;
        }));
      }
      if (hintRef.current) {
        let hint = '';
        if (sim.mode === 'play' && h.alive) {
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
      world.dispose();
      inst.texture.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [sim, input]);

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
        case 'KeyR': if (sim.mode !== 'brief') begin(); break;
        case 'Enter': if (sim.mode === 'brief' || sim.mode === 'over') begin(); break;
        case 'Escape': onExit(); break;
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
      {snap.mode !== 'brief' && (
        <div className="hud3d">
          <div className="mission" ref={missionRef} />
          <div className="telemetry" ref={hudRef} style={{ display: hud ? undefined : 'none' }} />
          <div className="score3d">점수 {snap.score} · 배달 {snap.delivered}{muted ? ' · 음소거' : ''}</div>
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
            <h1>조종석</h1>
            <p className="sub">베이스(H)에서 시동을 걸고, 화물을 실어 목적지 패드에 내려놓으세요.<br />
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
              <b>V · U · M</b><span>외부 시점 · 계기 HUD · 소리</span>
              <b>R · Esc</b><span>다시 시작 · 메뉴</span>
            </div>
            )}
            <ul className="rules">
              <li>착륙: 하강률 {Math.round(3 * MS_TO_FPM)} fpm 이하, 거의 멈춘 채로, 수평으로.</li>
              <li>픽업 패드에 3초, 목적지 패드에 2초 머무르면 적재·하역됩니다.</li>
              <li>계기판 GPS와 방위계의 화살표가 목표를 가리킵니다. 연료는 H 패드에서.</li>
              <li>엔진이 꺼지면 콜렉티브를 내려 로터를 살리고(오토로테이션), 지면 직전에 올리세요.</li>
              <li>게임패드: 왼쪽 스틱 콜렉티브·페달, 오른쪽 스틱 사이클릭, A 시동, Y 시점.</li>
            </ul>
            {snap.mode === 'brief'
              ? <><button className="go" onClick={begin}>비행 시작</button> <button className="ghost" onClick={onExit}>메뉴</button></>
              : <button className="go" onClick={() => setHelp(false)}>닫기</button>}
          </div>
        </div>
      )}

      {snap.mode === 'over' && !help && (
        <div className="overlay">
          <div className="card">
            <h1>추락</h1>
            <p className="sub">{snap.crashReason}</p>
            <div className="big">{snap.score}</div>
            <p className="sub">배달 {snap.delivered}건 · 최고 기록 {snap.best}</p>
            <button className="go" onClick={begin}>다시 비행</button> <button className="ghost" onClick={onExit}>메뉴</button>
          </div>
        </div>
      )}
    </div>
  );
}
