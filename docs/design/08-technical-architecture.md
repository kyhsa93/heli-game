# 08. 기술 구조

모든 코드 작업 전에 이 장을 읽는다.

## 8.1 기술 스택 (고정)

- React 19 + TypeScript 7 (strict) + Vite 8 + three.js 0.186. 테스트 vitest 5.
- 새 런타임 의존성은 추가하지 않는 것이 원칙이다. 꼭 필요하면 이유를 커밋 메시지에 쓴다. (ECS 라이브러리, 물리 엔진, 상태 관리 라이브러리 **쓰지 않음** — 필요한 만큼 직접 만든다.)
- 외부 에셋 파일(모델, 텍스처 이미지, 음원) 없음. 모델은 코드로 만든 기본 도형, 텍스처는 캔버스로 그림, 소리는 WebAudio 합성.
- 배포: `main` push → GitHub Actions(`.github/workflows/deploy.yml`)가 `npm ci && npm run check` 후 GitHub Pages에 배포. 경로 `base: '/heli-game/'`.
- PWA: `public/sw.js`는 **아무것도 캐시하지 않고 모든 요청을 `cache: 'no-store'`로** 받는다(소유자 요구사항). 캐시 전략을 바꾸지 말 것. 그 결과 첫 로드 용량이 매번 발생하므로 **번들 크기를 의식**한다(8.7절 예산).

## 8.2 현재 코드 지도

| 파일 | 줄 | 역할 | 전투 확장 시 문제 |
| --- | --- | --- | --- |
| `src/main.tsx` | 15 | React 마운트, 서비스 워커 등록 | — |
| `src/App.tsx` | 14 | 터치 감지 후 `Flight3D` 렌더 | 화면 상태 기계로 교체 |
| `src/components/Flight3D.tsx` | 352 | 렌더러 생성, 게임 루프(rAF + 고정 스텝), 카메라, 계기 갱신, HUD DOM 직접 갱신, 키 입력, 브리핑/추락 오버레이 | **너무 많은 책임.** 루프·렌더·입력·UI를 분리해야 함 |
| `src/components/VirtualStick.tsx` | 44 | 터치 가상 스틱 | 재사용 |
| `src/sim3d/sim.ts` | 361 | `Sim`: 비행 물리, 충돌·착륙 판정, 연료, 보급품 운송 임무, 메시지, 모드, 스냅샷 구독 | 비행 모델과 임무 규칙이 한 클래스에 섞여 있음 → 분리 |
| `src/sim3d/terrain.ts` | 185 | 절차 지형, 패드·건물·나무 배치, `heightAt`/`normalAt`, 나무 공간 격자 | 12km·임무 데이터 기반으로 확장 |
| `src/sim3d/scene.ts` | 237 | three 장면: 지형 메시, 하늘, 물, 나무 인스턴스, 건물, 패드, 목표 빔, 그림자 | 청크 LOD, 유닛 렌더러 추가 |
| `src/sim3d/heliModel.ts` | 459 | 아파치 외형·조종석 모델 생성 | 로드아웃 반영, 피해 표현 |
| `src/sim3d/instruments.ts` | 322 | MPD(FLT/TSD)·EUFD·예비계기 캔버스 텍스처 | 페이지 시스템으로 확장 |
| `src/sim3d/ihadss.ts` | 105 | 헬멧 심볼 오버레이 | 무장·위협 심볼 추가 |
| `src/sim3d/input.ts` | 59 | 키보드·게임패드·터치 → `Controls3` | 전투 입력 추가 |
| `src/sim3d/audio.ts` | 105 | 로터·터빈·바람·경고음 합성 | 효과음 추가 |
| `src/sim3d/math.ts` | 6 | `clamp`, `smooth`, `rng` | 유지 |
| `src/sim3d/sim.test.ts` | 170 | 비행·착륙·임무 테스트 10개 | **회귀 기준. 계속 통과해야 함** |
| `src/sw.test.ts` | 59 | 서비스 워커 무캐시 테스트 4개 | 유지 |

디버그 훅: URL에 `?debug`를 붙이면 `window.__flight = { sim, input, view, model }` 이 노출된다. 헤드리스 브라우저 검증에 쓴다(8.8절).

## 8.3 목표 구조

```
src/
  main.tsx, App.tsx
  core/                 # 어디서나 쓰는 순수 유틸
    math.ts             # (sim3d/math.ts 이동) clamp, smooth, rng, 각도 유틸
    events.ts           # 타입 있는 이벤트 버스
    grid.ts             # 2D 공간 격자 (유닛·나무 질의)
    units.ts            # 단위 변환 상수 (MS_TO_KT 등)
  sim/                  # 게임 규칙. three의 수학 타입(Vector3, Quaternion)만 import 허용. 렌더·DOM·React 금지
    world.ts            # World: 시간, rng, 엔티티 목록, 지형, 이벤트, step()
    terrain.ts          # (sim3d/terrain.ts 이동·확장)
    los.ts              # 가시선
    heli/
      flight.ts         # 현재 Sim.fly()·collide()의 비행 모델 (순수 함수 + 상태)
      systems.ts        # 연료, 엔진, 로터 회전수, 피해 계통, 무게
      assists.ts        # 보조 기능 (Controls3 → Controls3)
      loadout.ts        # 파일런·탄약·무게 계산
    weapons/
      projectile.ts     # 기관포·로켓 탄도, 선분 충돌
      missile.ts        # 헬파이어·스팅어·적 미사일 유도
      fire.ts           # 발사 규칙 (무장 선택, 잠금 조건, 발사 간격)
      damage.ts         # 피해 계산 (관통 vs 장갑, 폭발 반경)
    sensors/
      tads.ts           # TADS 시선, 줌, 레이저, 식별
      fcr.ts            # 레이더 스캔, 표적 목록
      ase.ts            # RWR, CMWS, 대응책
    ai/
      awareness.ts      # 탐지 모델 (05장 5.4절)
      brain.ts          # 상태 기계 (05장 5.5절)
      movement.ts       # 도로 그래프, A*, 헬기 이동
      wingman.ts
    mission/
      schema.ts         # MissionDef 타입 + 검증
      runtime.ts        # 목표·트리거·무전 큐
      scoring.ts        # 점수·평점
  render/               # three.js. sim 상태를 읽기만 함. sim에 쓰지 않음
    renderer.ts         # WebGLRenderer, 카메라, 프레임 렌더 조립
    scene.ts, sky.ts, water.ts
    terrainChunks.ts    # 청크 LOD 지형
    heliModel.ts        # (이동) + 로드아웃·피해 표현
    unitModels.ts       # 유닛 유형별 코드 모델
    unitRenderer.ts     # 유형별 InstancedMesh 갱신
    effects.ts          # 폭발, 연기, 불, 예광탄, 섬광 (풀링)
    tadsView.ts         # TADS 렌더 타깃 + TV/FLIR 셰이더
    cockpit/
      instruments.ts    # MPD 페이지 시스템
      pages/*.ts        # FLT, TSD, WPN, TADS, FCR, ASE, ENG
      eufd.ts
    ihadss.ts
  audio/
    rotor.ts            # (sim3d/audio.ts 이동)
    sfx.ts              # 효과음 합성, 이벤트 버스 구독
    voice.ts            # speechSynthesis 경고
  input/
    input.ts            # 키보드·패드·터치 → 비행 입력 + 전투 명령
    bindings.ts         # 07장 조작표
  ui/                   # React 화면
    state.ts            # 화면 상태 기계 + 해시 라우팅
    screens/Title.tsx, CampaignMap.tsx, Briefing.tsx, Loadout.tsx, Flight.tsx, Debrief.tsx, Settings.tsx, Training.tsx
    flight/Hud.tsx, RadioSubtitles.tsx, FarpMenu.tsx, PauseMenu.tsx, TouchControls.tsx
    components/VirtualStick.tsx
  content/              # 데이터. 코드 수정 없이 밸런스·임무 수정
    aircraft.json, weapons.json, units.json, sensors.json
    missions/m01.json … m12.json, t1.json … t5.json, instant.json
    campaign.json       # 임무 순서, 해금 표
    strings.ko.json
  save/
    storage.ts          # localStorage try/catch 래퍼, 버전 이관
```

### 의존 규칙 (지켜야 테스트가 가능하다)

```
ui ──→ render ──→ sim ──→ core
 │       │         ↑
 │       └─ audio ─┘ (이벤트 구독만)
 └──────→ input ──→ sim (명령 전달만)
content (JSON) ← sim, ui 가 읽음
```
- `sim/`은 `render/`, `ui/`, `audio/`, `input/`, DOM, `window`를 import하지 않는다. three에서는 `Vector3`, `Quaternion`, `Euler` 같은 **수학 타입만** 쓴다.
- `render/`는 sim 상태를 읽기만 한다. sim에 무언가 알리고 싶으면 **명령**(input 경유)이나 sim이 내는 **이벤트**를 쓴다.
- 검사: M0 작업에 `src/arch.test.ts`를 넣어, `src/sim/**` 파일 내용에 `from '../render` / `'react'` / `document.` / `window.` 가 없는지 정규식으로 확인한다.

## 8.4 월드와 엔티티

ECS 라이브러리 대신 **유형별 배열 + 숫자 ID** 로 단순하게 간다.

```ts
type Side = 'coalition' | 'veros' | 'civilian';

interface Unit {
  id: number;
  defId: string;              // units.json 키 ('tank', 'spaag', …)
  missionId?: string;         // 임무 JSON의 id (트리거 참조용)
  side: Side;
  pos: Vector3; yaw: number; vel: Vector3;
  hp: number; alive: boolean;
  group?: string;
  ai: AiState;                // awareness, state, target, timers, lastSeen …
  weaponCooldown: number;
  identified: boolean;        // 플레이어가 TADS로 식별했는지
}

interface Projectile { id: number; kind: 'gun30' | 'hydra70' | 'enemyTracer'; pos: Vector3; vel: Vector3; owner: number; life: number }
interface Missile { id: number; kind: 'agm114k' | 'agm114l' | 'stinger' | 'sam' | 'manpads' | 'aam'; pos: Vector3; vel: Vector3; owner: number; target: TargetRef; phase: 'boost' | 'cruise' | 'terminal' | 'lost'; fuel: number; seekerLocked: boolean }

class World {
  time: number;
  rng: () => number;            // 시드 고정. 모든 무작위는 여기서
  terrain: Terrain;
  player: PlayerHeli;           // 현재 Heli3 + systems + loadout + sensors
  units: Unit[];
  projectiles: Projectile[];
  missiles: Missile[];
  events: EventBus<SimEvent>;
  mission: MissionRuntime;
  step(dt: number, cmds: PlayerCommands): void;
}
```

- **ID는 증가하는 정수**, 재사용하지 않는다. 죽은 유닛은 `alive=false`로 두고 잔해 표현에 쓴다(배열에서 빼지 않음 — 렌더러 인스턴스 인덱스 안정).
- 발사체·미사일은 수명이 끝나면 배열에서 제거(스왑-팝).
- 공간 질의는 `core/grid.ts`(셀 100m)를 **매 AI 틱마다 재구축**한다(유닛 수백 개면 충분히 싸다).

### 스텝 순서 (`World.step`, 120Hz)

```
1. 플레이어 명령 적용 (무장 선택, 발사, 레이저, 대응책 …)
2. 보조 기능 → 비행 모델 → 충돌·착륙 (현재 Sim.fly 로직)
3. 계통 갱신 (연료, 엔진, 피해 증상, 무게)
4. 발사체 이동 + 충돌 (선분 검사)
5. 미사일 유도 + 이동 + 신관
6. [12스텝마다 = 10Hz] 공간 격자 재구축, 센서(FCR·RWR), AI 인지·결정, 유닛 이동 목표 갱신
7. 유닛 이동 적분 (매 스텝, 단순 운동학)
8. [120스텝마다 = 1Hz] 임무 트리거·목표 평가
9. 이벤트 버스 flush (렌더·오디오·UI가 구독)
```

### 이벤트

```ts
type SimEvent =
  | { t: 'fire'; weapon: string; pos: Vector3; dir: Vector3; owner: number }
  | { t: 'impact'; pos: Vector3; weapon: string; hitUnit?: number; ground: boolean }
  | { t: 'explosion'; pos: Vector3; size: number }
  | { t: 'unitDestroyed'; id: number; defId: string; side: Side; byPlayer: boolean }
  | { t: 'playerHit'; system: string; damage: number; from: Vector3 }
  | { t: 'rwr'; unit: number; state: 'search' | 'track' | 'launch' | 'off' }
  | { t: 'missileWarning'; missile: number; bearingDeg: number }
  | { t: 'countermeasure'; kind: 'flare' | 'chaff' }
  | { t: 'lock'; weapon: string; target: number }
  | { t: 'radio'; from: string; text: string }
  | { t: 'objective'; id: string; state: 'active' | 'done' | 'failed' }
  | { t: 'missionEnd'; result: 'success' | 'fail'; reason: string }
  | { t: 'warning'; code: string; on: boolean };   // EUFD·음성 경고
```
- 이벤트는 스텝 동안 큐에 쌓이고 스텝 끝에 한 번에 나간다. 렌더 프레임 하나에 여러 물리 스텝이 돌면 이벤트도 여러 번 나갈 수 있다 — 구독자는 이를 전제로 짠다.
- 테스트는 이벤트를 수집해서 검증한다("전차에 헬파이어 명중 → `unitDestroyed` 이벤트가 `byPlayer: true`로 1회").

## 8.5 루프와 React의 경계

- 현재처럼 **React는 화면 전환과 메뉴만** 담당하고, 비행 중 프레임 단위 갱신은 React 상태를 거치지 않는다(`Flight3D`의 ref 직접 갱신 방식 유지). React 리렌더는 모드·목표 변경 같은 드문 이벤트에서만.
- `render/renderer.ts`의 `FlightRenderer` 클래스가 rAF 루프, 고정 스텝 누적, 렌더를 가진다. React `Flight.tsx`는 이 클래스를 만들고 없애는 얇은 껍데기.
- sim → React 알림은 지금의 `subscribe/getSnapshot` 패턴(`useSyncExternalStore`)을 유지한다. 스냅샷은 **바뀔 때만 새 객체**.

## 8.6 렌더링 지침

- **유닛**: 유형별 `InstancedMesh` 1개(부품이 여럿이면 부품별 1개). 파괴된 유닛은 잔해용 인스턴스 메시로 옮김. 포탑 회전 같은 부품 움직임은 부품별 인스턴스 행렬로.
- **효과**: 폭발·연기·불·예광탄은 미리 만든 풀(각 64~256개)에서 꺼내 쓴다. 매 프레임 `new` 금지. 연기는 빌보드 스프라이트(캔버스로 그린 원형 그라디언트 텍스처).
- **TADS**: `WebGLRenderTarget` 하나, TADS 카메라는 기체의 TADS 터릿 위치에 붙인다. FLIR은 후처리 셰이더: 유닛은 `userData.heat`(엔진 켜짐 1.0, 보병 0.7, 잔해 불 1.0)로 흰색, 지형은 높이·경사 기반 회색 — **열상용 별도 머티리얼 오버라이드**(`scene.overrideMaterial` 대신 레이어 + 머티리얼 교체)로 구현.
- **지형 청크**: 2km 청크, 가까운 청크는 12.5m 격자(161×161 정점), 먼 청크는 50m. 청크 경계 틈은 스커트(아래로 내린 테두리)로 가린다.
- **조종석**은 기존처럼 기체 모델의 자식. 로그 깊이 버퍼(`logarithmicDepthBuffer: true`)는 유지 — 근평면 0.05m와 원평면 7km를 같이 쓰기 위해 필요.

## 8.7 성능 예산

| 항목 | 예산 | 측정 방법 |
| --- | --- | --- |
| 데스크톱 프레임 | 60fps (16.6ms), 물리+AI ≤ 4ms | `?debug&fps` 표시 |
| 중급 모바일(가로) | 30fps, quality=low | 실제 기기 |
| 드로우콜 | ≤ 200 (조종석 포함) | `renderer.info.render.calls` |
| 동시 유닛 | ≤ 150 | 임무 검증기가 경고 |
| 발사체 | ≤ 300, 미사일 ≤ 24 | 풀 크기 |
| JS 번들 (gzip) | ≤ 350KB (현재 약 230KB) | `vite build` 출력 |
| 임무 JSON | 개당 ≤ 40KB | 빌드 시 검사 |

## 8.8 테스트와 검증

### 자동 테스트 (vitest, `npm run check`)
- **sim 로직은 전부 헤드리스로 테스트한다.** `World`를 시드로 만들고, 명령을 넣고, 스텝을 돌리고, 상태·이벤트를 확인한다. 기존 `sim.test.ts`의 헬퍼 패턴(`run`, `holdClimb`, `descend`, `airborneAt`)을 `src/sim/testing.ts`로 옮겨 재사용한다.
- 각 로드맵 작업은 **완료 조건에 적힌 테스트를 추가**해야 끝난다.
- 테스트는 결정론적이어야 한다: `Math.random` 직접 호출 금지(sim 안에서). 월드 rng만.
- 콘텐츠 검증 테스트: `content/missions/*.json`을 전부 로드해 스키마 검증 + 참조 무결성(트리거가 참조하는 유닛·목표 ID 존재, 유닛 유형이 `units.json`에 존재, 스폰 위치가 지도 안).

### 눈으로 확인 (렌더·UI 작업)
- 렌더링 결과는 테스트 통과로 증명되지 않는다. **스크린샷으로 직접 본다.**
- 헤드리스 크롬은 소프트웨어 렌더링(SwiftShader)이라 3~4fps다. 실시간 조작으로 검증하지 말고, `?debug` 훅으로 sim을 직접 스텝해 원하는 상황을 만든 뒤 찍는다:
  ```js
  // page.evaluate 안에서
  const { sim } = window.__flight;           // M0 이후엔 world
  for (let i = 0; i < 120 * 10; i++) sim.step(1 / 120);
  ```
- 크롬 실행 옵션: `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
- 조종석 작업은 최소한 정면·아래·좌·우·뒤 5방향 + 외부 시점을 찍어서 확인한다(구멍·겹침·잘림 확인).
- 모바일은 뷰포트 844×390(가로)과 390×844(세로), `hasTouch: true`.

## 8.9 코드 관례

- 식별자·파일명은 영어, **사용자에게 보이는 문자열은 한국어**이고 `content/strings.ko.json` 또는 임무 JSON에 둔다.
- 주석은 거의 쓰지 않는다(현재 코드 관례). 이유가 코드로 드러나지 않는 수치·규칙에만 한 줄.
- 파일은 대략 400줄을 넘기면 나눈다. `heliModel.ts`(459줄)는 M0에서 외형/조종석으로 분리.
- `localStorage`·`sessionStorage` 접근은 전부 `save/storage.ts`의 try/catch 래퍼로.
- 매 프레임 할당 최소화: 임시 `Vector3`는 모듈 수준에 두고 재사용(현재 `tmpV` 패턴).
- 커밋 메시지는 영어, 제목은 명령형, 본문에 "왜"를 쓴다. 문서의 미정 항목을 기본안으로 결정했다면 본문에 명시.
- `npm run check`(타입체크 + 테스트 + 빌드)가 통과해야 push. CI도 같은 명령을 돈다.
