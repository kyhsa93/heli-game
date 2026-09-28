# 헬기 조종

브라우저에서 바로 하는 2D 헬기 조종 게임. 화물을 줄에 매달아 도착지 패드에 내려놓는다.

https://kyhsa93.github.io/heli-game/

React + TypeScript + Vite. `main`에 push하면 GitHub Actions가 테스트·빌드 후 Pages에 배포한다.

```sh
npm install
npm run dev     # 개발 서버
npm run check   # 타입체크 + 테스트 + 빌드
```

- `src/game/` — 물리·규칙(`game.ts`), 지형(`world.ts`), 캔버스 렌더(`render.ts`). React에 의존하지 않는다.
- `src/components/` — 캔버스 루프, 시작/추락 화면, 터치 버튼.

## 조작

| 키 | 동작 |
| --- | --- |
| ▲ / W / Space | 출력 올리기 (상승) |
| ▼ / S | 출력 내리기 (하강) |
| ◀ ▶ / A D | 기체 기울이기 (이동) |
| E | 화물 고리 걸기 / 풀기 |
| R | 다시 시작 |

터치 기기에서는 화면 버튼이 나타난다.

## 규칙

- 착륙은 천천히(수직 속도 130 이하), 수평으로. 로터나 꼬리가 지형에 닿으면 추락한다.
- H 패드에 착륙하면 연료가 채워진다.
- 화물을 세게 떨어뜨리면 파손(−50). 빨리 배달할수록 보너스.
