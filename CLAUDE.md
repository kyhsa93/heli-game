# CLAUDE.md

브라우저 3D 전쟁 게임. 기존 AH-64 아파치 조종 콘텐츠(캠페인·훈련·즉시 출격)는 2026-09-30 제거했고, 봇과 함께 혼자 하는 배틀필드식 **"전장"** 모드로 다시 만드는 중이다. 새 기획은 저장소 위키(https://github.com/kyhsa93/heli-game/wiki), 기획 작업은 `.claude/agents/game-designer.md` 에이전트.

## 먼저 읽을 것

- 기획 전체: [docs/design/README.md](docs/design/README.md) — 읽는 순서와 문서 사용 규칙
- 코드 작업 전 필수: [docs/design/08-technical-architecture.md](docs/design/08-technical-architecture.md) — 현재 코드 지도, 목표 구조, 의존 규칙, 테스트 방법
- 할 일 고르기: 위키의 전장 로드맵(작업 ID `B…`)과 그것을 옮긴 GitHub 이슈, 체크 목록은 [docs/design/09-roadmap.md](docs/design/09-roadmap.md). 끝나면 커밋에 `Closes #번호`하고 체크박스 갱신
- 헤드리스 도구: `npm run battle:map` · `battle:bench` · `battle:harness` ([scripts/README.md](scripts/README.md))

## 명령

```sh
npm run dev      # 개발 서버
npm run check    # 타입체크 + 테스트 + 빌드 (push 전 필수, CI와 같음)
npm test         # vitest만
```

## 반드시 지킬 것

- `npm run check`가 통과해야 한다. 회귀 기준 테스트 목록과 빌드 크기 기준선은 [docs/battle/baseline.md](docs/battle/baseline.md).
- 게임 규칙(sim)은 렌더·DOM·React에 의존하지 않는다. 결정론 유지: sim 안에서 `Math.random` 금지, 월드 RNG만.
- `public/sw.js`는 아무것도 캐시하지 않고 항상 `cache: 'no-store'`로 받는다. 이 정책을 바꾸지 않는다.
- 외부 에셋은 [docs/design/10-external-assets.md](docs/design/10-external-assets.md)에서 **채택된 것만** 쓴다(권장안 전체 채택). 추가 시 상세 페이지에서 라이선스를 재확인하고 `public/assets/CREDITS.md`에 기재, 가공(압축·서브셋) 후 용량 예산 안에서, 로드 실패 시 코드 도형·합성음 폴백. 자기 기체 아파치 외형·조종석·계기는 계속 코드로 만든다.
- 새 런타임 의존성은 추가하지 않는다(필요하면 이유를 커밋 메시지에).
- 사용자에게 보이는 문자열은 한국어, 코드 식별자는 영어. 주석은 거의 쓰지 않는다.
- 렌더·UI 변경은 헤드리스 스크린샷으로 직접 확인한다. `?debug`로 `window.__flight`가 노출되며, 소프트웨어 렌더링은 느리므로 sim을 직접 스텝해서 상황을 만든다(08장 8.8절).
- `main`에 push하면 GitHub Actions가 GitHub Pages(`/heli-game/`)로 배포한다.
- 기획과 다르게 구현했으면 해당 기획 문서도 같이 고친다. 로드맵 체크박스도 갱신한다.
