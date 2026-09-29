export type FlightMode = '3d' | '2d';

export function Menu({ onPick }: { onPick: (m: FlightMode) => void }) {
  return (
    <div className="menu">
      <div className="card">
        <h1>헬기 조종</h1>
        <p className="sub">화물을 실어 목적지 헬리패드까지 날라 주세요.</p>
        <button className="mode primary" onClick={() => onPick('3d')}>
          <b>AH-64 아파치 조종석</b>
          <span>1인칭 3D 시뮬레이터 — 뒷좌석 조종사가 되어 콜렉티브·사이클릭·페달로 조종</span>
        </button>
        <button className="mode" onClick={() => onPick('2d')}>
          <b>측면 아케이드</b>
          <span>옆에서 보는 2D — 줄에 매단 화물 배달</span>
        </button>
      </div>
    </div>
  );
}
