# CLAUDE.md

브라우저 AH-64 아파치 1인칭 조종 시뮬레이터. 아파치 조종사로 전쟁을 수행하는 게임("아파치: 카르다 전선")으로 확장하는 중이다.

## 먼저 읽을 것

- 기획 전체: [docs/design/README.md](docs/design/README.md) — 읽는 순서와 문서 사용 규칙
- 코드 작업 전 필수: [docs/design/08-technical-architecture.md](docs/design/08-technical-architecture.md) — 현재 코드 지도, 목표 구조, 의존 규칙, 테스트 방법
- 할 일 고르기: [docs/design/09-roadmap.md](docs/design/09-roadmap.md) — 마일스톤 순서대로, 작업 ID 단위

## 명령

```sh
npm run dev      # 개발 서버
npm run check    # 타입체크 + 테스트 + 빌드 (push 전 필수, CI와 같음)
npm test         # vitest만
```

## 반드시 지킬 것

- `npm run check`가 통과해야 한다. 기존 테스트(`src/sim3d/sim.test.ts`, `src/sw.test.ts`)는 회귀 기준이다(로드맵 M0-2가 삭제하는 화물 배달 테스트만 예외).
- 게임 규칙(sim)은 렌더·DOM·React에 의존하지 않는다. 결정론 유지: sim 안에서 `Math.random` 금지, 월드 RNG만.
- `public/sw.js`는 아무것도 캐시하지 않고 항상 `cache: 'no-store'`로 받는다. 이 정책을 바꾸지 않는다.
- 외부 에셋 파일(모델·이미지·음원)을 추가하지 않는다. 모델은 코드 도형, 텍스처는 캔버스, 소리는 WebAudio 합성.
- 새 런타임 의존성은 추가하지 않는다(필요하면 이유를 커밋 메시지에).
- 사용자에게 보이는 문자열은 한국어, 코드 식별자는 영어. 주석은 거의 쓰지 않는다.
- 렌더·UI 변경은 헤드리스 스크린샷으로 직접 확인한다. `?debug`로 `window.__flight`가 노출되며, 소프트웨어 렌더링은 느리므로 sim을 직접 스텝해서 상황을 만든다(08장 8.8절).
- `main`에 push하면 GitHub Actions가 GitHub Pages(`/heli-game/`)로 배포한다.
- 기획과 다르게 구현했으면 해당 기획 문서도 같이 고친다. 로드맵 체크박스도 갱신한다.
