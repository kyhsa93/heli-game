import { useSyncExternalStore } from 'react';
import { LAND_VY } from '../game/constants';
import type { Game } from '../game/game';

export function Overlay({ game }: { game: Game }) {
  const snap = useSyncExternalStore(game.subscribe, game.getSnapshot);
  if (snap.mode === 'play' || snap.mode === 'crashed') return null;

  return (
    <div className="overlay">
      <div className="card">
        {snap.mode === 'title' ? (
          <>
            <h1>헬기 조종</h1>
            <p className="sub">화물을 줄에 매달아 도착지 패드에 내려놓으세요.<br />흔들리는 화물을 다루는 게 핵심입니다.</p>
            <div className="keys">
              <b>▲ / W / Space</b><span>출력 올리기 (상승)</span>
              <b>▼ / S</b><span>출력 내리기 (하강)</span>
              <b>◀ ▶ / A D</b><span>기체 기울이기 (전진·후진)</span>
              <b>E</b><span>화물 고리 걸기 / 풀기</span>
              <b>R</b><span>다시 시작</span>
            </div>
            <ul className="rules">
              <li>착륙은 천천히(수직 {LAND_VY} 이하), 수평으로.</li>
              <li>로터나 꼬리가 지형에 닿으면 추락합니다.</li>
              <li><b className="fuel">H</b> 패드에 착륙하면 연료가 채워집니다.</li>
              <li>화물을 세게 떨어뜨리면 파손(−50). 빨리 배달할수록 보너스.</li>
            </ul>
            <button className="go" onClick={() => game.start()}>시작</button>
          </>
        ) : (
          <>
            <h1>추락</h1>
            <p className="sub">{snap.crashReason}</p>
            <div className="big">{snap.score}</div>
            <p className="sub">배달 {snap.delivered}건 · 최고 기록 {snap.best}</p>
            <button className="go" onClick={() => game.start()}>다시 비행</button>
          </>
        )}
      </div>
    </div>
  );
}
