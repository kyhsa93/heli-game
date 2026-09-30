# 06. 임무와 전장

> **2026-09-30 소유자 결정 — 방향 전환.** 캠페인(12임무)·훈련·즉시 출격 등 기존 아파치 조종 콘텐츠는 게임에서 제거했다. 게임은 봇과 함께 혼자 하는 배틀필드식 대규모 전투 **"전장"** 모드로 다시 만든다. 새 기획은 저장소 위키(https://github.com/kyhsa93/heli-game/wiki)가 기준이다. 아파치 기체(비행 모델·무장·센서·조종석)와 엔진(sim·render·audio·input)은 전장의 탈것·기반으로 재사용하려고 남겼다. 이 폴더의 문서는 남은 엔진의 설명과 옛 기획 기록으로만 읽는다.

## 6.1 전장 (카르다 산맥)

### 지형
- 현재 `Terrain`(`src/sim3d/terrain.ts`)은 4km×4km, 320×320 격자(12.5m), 시드 기반 절차 생성, 가장자리 산맥, 호수, 숲, 헬리패드, 집이다.
- 전투용 요구: 헬파이어 사거리 8km, SAM 10km를 담으려면 **최소 12km×12km** 가 필요하다.
- 결정: **임무마다 12km×12km 지도**, 격자 12.5m 유지 → 961×961 높이. 렌더는 **청크 LOD**(2km 청크 6×6, 가까운 청크 고해상도, 먼 청크 1/4 해상도). 물리·AI는 전체 높이 배열을 그대로 쓴다(메모리 약 3.7MB, 문제 없음).
- **시드 + 임무 데이터**로 지형을 만든다: 절차 생성으로 바탕을 만들고, 임무 JSON의 `terrain.features`(도로, 마을, 교량, 기지 부지, 강제 평탄화 영역)를 얹는다. 같은 임무는 항상 같은 지형이 나온다(시드 고정).
- 기존 생성 규칙(패드 평탄화, 나무 배치 규칙, 건물 배치 규칙)은 재사용한다.

구현(M4-3): `Terrain(seed, {size, features, roads, pads})`. 크기·격자 수·반폭은 인스턴스 값(`terrain.size/n/cell/half`)이고, 훈련·연습은 4km 기본값, 임무는 `missionTerrain(mission)`으로 12km(961²)를 만든다(생성 약 1초). 특징: `flatten`·`base`는 원형 평탄화, `village`는 평탄화 + 민가 배치, `forest`는 숲 밀도 올림, `bridge`는 교각·상판을 그리는 구조물 목록(지형은 안 바꿈). 도로는 25m 간격으로 샘플한 높이를 이동 평균한 단면으로 **중심에서 4m + 1.5격자(약 23m)까지 완전 평탄화**하고 15m 어깨로 섞는다(격자 12.5m라 8m 띠만 깎으면 삼각형 보간 때문에 단면이 기울기 때문). 흙색 띠는 지형 위 0.25m의 별도 리본 메시. 도로가 물을 건너면 1.5m 둑길이 된다(교량을 두려면 `bridge` 특징). 임무 FARP가 패드가 된다(첫 FARP가 기지). 나무는 면적에 비례하되 최대 5배(12km에서 약 2만 그루), 도로 8m 안에는 심지 않는다.

### 도로 그래프
- 임무 JSON에 폴리라인으로 정의(`roads: [[x,z], …][]`). 지형 생성 시 도로 폭 8m로 평탄화하고 흙색 띠로 그린다.
- 차량 이동은 도로 그래프 위에서만(야지 가능 유닛 제외). 교차점은 끝점 좌표가 2m 이내로 같으면 자동 연결.

### 시간·기상

| 설정 | 영향 |
| --- | --- |
| 주간 | 현재 조명. 시각 탐지 4,000m |
| 해질녘 | 태양 낮고 주황빛, 그림자 긺, 시각 탐지 3,000m |
| 야간 | 매우 어두움. 조종석 창밖은 거의 안 보임 → **PNVS 열상 오버레이**(IHADSS 영역에 흑백 열상 영상, 키 `N`으로 토글)와 TADS FLIR로 비행. 시각 탐지 1,500m. 계기판 조명 켜짐 |
| 안개 | `scene.fog` 가시거리 800m, 시각 탐지 × 0.5, TADS 주간 모드 가시거리 1,500m (FLIR는 3,000m) |
| 바람 | 현재 구현(방향 서서히 회전, 4±2.5m/s, 돌풍) + 임무별 기본 풍속·풍향 |

구현(M6-1, `src/render/timeOfDay.ts`·`scene.setTime`, `awareness.visualRange`): 임무 `environment.time`이 `world.conditions.time`이 되고, 렌더러가 바뀔 때마다 프리셋을 적용한다 — 태양 방향·색·세기(해질녘은 서쪽 6°, 새벽은 동쪽 7°, 야간은 약한 푸른 달빛), 반구광, 안개 색·거리(주간 500–3,600m, 해질녘 400–3,200, 새벽 300–2,800 아침 안개, 야간 150–2,000), 하늘 셰이더의 태양 위치·산란(야간엔 하늘 돔을 끄고 거의 검은 배경 + 점 1,400개 별), 착륙 패드 빛기둥은 야간에 더 밝게. 조종석엔 계기판 앞에 약한 조명(점광원)을 두고 해질녘 0.35·새벽 0.25·야간 1배로 켠다(MPD는 원래 자체 발광). 시각 탐지 거리는 주간 4,000m, 해질녘·새벽 3,000m, 야간 1,500m(안개 배율은 M6-3).

구현(M6-2): PNVS는 조종석 시점에서 머리 카메라와 같은 자세·시야로 장면을 절반 해상도로 다시 그려 TADS의 FLIR 후처리(초록 틴트, 불투명도 0.82)를 IHADSS 아래에 겹친다. 키 `N`으로 토글하고, 야간으로 바뀌는 순간 한 번 자동으로 켠다. 센서 계통이 파괴되면 안 나온다. IHADSS 왼쪽에 `PNVS` 표시. 열상 패스(TADS FLIR·PNVS)는 가시광과 무관하므로 시간대와 상관없이 주간 조명으로 그리고(하늘·별 숨김, 검은 배경, 짙은 회색 안개), 유닛은 열 재질로 바꿨다가 되돌린다. 야간에는 TADS가 FLIR로 고정된다(`world`가 매 스텝 강제, `V` 전환 무시).

구현(M6-3): 임무 `environment.fog`면 `world.conditions.fog`가 켜지고, 렌더러가 안개 색을 시간대 색과 회색(야간은 거의 그대로)으로 섞어 60–800m 안개를 두고 하늘 돔을 끈다. 시각 탐지는 **거리 한계를 절반으로**(주간 2,000m, 해질녘·새벽 1,500m, 야간 750m) — 예전의 탐지 속도 ×0.5는 없앴다(두 번 깎이지 않게). TADS 식별 거리는 TV 1,500m·FLIR 3,000m(`identifyRange`), TADS 영상의 안개도 TV 200–1,500m·FLIR 600–3,000m, PNVS는 600–3,000m. 안개 속 밝은 배경에서도 읽히게 IHADSS 그림자를 키웠다(#80).

## 6.2 임무 데이터 형식

임무는 **데이터 파일**이다. 코드 수정 없이 임무를 추가·수정할 수 있어야 한다. 파일: `src/content/missions/<id>.json`. 타입 정의는 `src/sim/mission/schema.ts`에 두고, 로드할 때 검증한다(잘못된 필드는 개발 모드에서 콘솔 에러 + 어떤 필드인지 표시).

```ts
interface MissionDef {
  id: string;                 // "m01"
  title: string;              // "첫 정찰"
  act: 1 | 2 | 3;
  kind: 'recon' | 'escort' | 'cas' | 'sead' | 'interdiction' | 'csar' | 'strike' | 'defense' | 'training' | 'instant';
  briefing: {
    summary: string;          // 2~3문장
    situation: string[];      // 상황 설명 문단들
    threats: string[];        // 알려진 위협 목록 (브리핑 화면 표시)
    recommendedLoadout: LoadoutDef;
  };
  environment: {
    seed: number;
    time: 'day' | 'dusk' | 'night' | 'dawn';
    fog: boolean;
    wind: { dirDeg: number; speed: number; gust: number };
  };
  terrain: {
    size: 12000;
    features: TerrainFeature[];   // 6.1절
    roads: [number, number][][];
  };
  start: {
    kind: 'farp_cold' | 'farp_hot' | 'air';   // 시동 꺼짐 / 로터 회전 중 / 공중
    position: [number, number];   // x, z
    headingDeg: number;
    altitudeAgl?: number;         // air일 때
    speedKt?: number;
  };
  farps: { id: string; position: [number, number]; services: ('fuel' | 'ammo' | 'repair')[] }[];
  waypoints: { id: string; name: string; position: [number, number] }[];  // TSD에 표시
  units: UnitSpawn[];
  groups: GroupDef[];             // 여러 유닛을 묶어 경로·행동 지정
  objectives: ObjectiveDef[];
  triggers: TriggerDef[];
  par: number;                    // S 평점 기준 점수
  parTimeSec: number;             // 시간 보너스 기준
  wingman: boolean;
  unlocks?: string[];             // 이 임무 시작 시 해금되는 것 (02장 2.5절 ID)
}

interface UnitSpawn {
  id: string;                     // 임무 안에서 고유. 트리거가 참조
  type: string;                   // 05장 유닛 ID
  position: [number, number];     // 높이는 지형에서
  headingDeg?: number;
  group?: string;
  hidden?: boolean;               // true면 트리거로 스폰될 때까지 없음
  skill?: number;                 // 0.5~1.5, 명중률·반응 배율
}

interface GroupDef {
  id: string;
  route?: [number, number][];     // 도로를 따라 이동할 경로 점
  loop?: boolean;
  speedScale?: number;
  behavior: 'hold' | 'patrol' | 'advance' | 'convoy' | 'defend';
  startTrigger?: string;          // 이 트리거가 발동하면 이동 시작
}

type ObjectiveDef =
  | { id: string; kind: 'destroy'; units: string[] | { group: string }; count?: number; primary: boolean; label: string }
  | { id: string; kind: 'protect'; units: string[] | { group: string }; minSurvive: number; untilTrigger: string; primary: boolean; label: string }
  | { id: string; kind: 'reach'; waypoint: string; radius: number; primary: boolean; label: string }
  | { id: string; kind: 'survive'; seconds: number; primary: boolean; label: string }
  | { id: string; kind: 'land'; farp: string; primary: boolean; label: string }
  | { id: string; kind: 'identify'; units: string[]; primary: boolean; label: string };  // TADS로 식별

interface TriggerDef {
  id: string;
  once: boolean;
  when: Condition;
  then: Action[];
}

type Condition =
  | { kind: 'time'; afterSec: number }
  | { kind: 'playerInZone'; center: [number, number]; radius: number }
  | { kind: 'unitDestroyed'; units: string[]; count?: number }
  | { kind: 'objectiveDone'; objective: string }
  | { kind: 'playerDetected'; byGroup?: string }
  | { kind: 'all'; of: Condition[] }
  | { kind: 'any'; of: Condition[] };

type Action =
  | { kind: 'radio'; from: 'control' | 'steel6' | 'hound2' | 'rescue'; text: string }
  | { kind: 'spawn'; units: string[] }
  | { kind: 'startGroup'; group: string }
  | { kind: 'remoteLaser'; unit: string; seconds: number }
  | { kind: 'smoke'; position: [number, number]; color: 'red' | 'green' | 'white' }   // 지상 통제관 표적 표시
  | { kind: 'objectiveAdd'; objective: string }
  | { kind: 'missionEnd'; result: 'success' | 'fail'; reason: string };
```

구현(M4-1, `src/sim/mission/schema.ts`): 위 타입 그대로에 몇 가지를 확정했다.
- `TerrainFeature` = `village {center, radius, houses?}` / `base {center, radius}` / `flatten {center, radius}` / `forest {center, radius, density?}` / `bridge {from, to}`.
- `recommendedLoadout`은 게임의 `LoadoutDef` 형식(`{ pylons: {L2, L1, R1, R2}, stingers, gunRounds, fuel }`)을 쓴다(위 예시의 평평한 형식이 아님).
- `initialObjectives?: string[]`: 시작부터 활성인 목표. 없으면 전부 활성, 있으면 나머지는 `objectiveAdd`로 연다.
- `unlocks` ID: `chaff`, `fcr`, `agm114l`, `night`, `stinger`, `wingmanMenu`, `liveries`(02장 2.5절).
- 검증: 필드 타입·범위·열거값·모르는 필드를 경로(`mission.triggers[0].when.kind`)와 함께 오류로 내고, 통과하면 참조 무결성(유닛·그룹·목표·트리거·웨이포인트·FARP ID, `units.json` 유형, 지도 안 좌표, 중복 ID)을 본다. 파일 40KB 초과는 오류, 활성 유닛 150 초과는 경고. `loadMission`은 개발 모드에서 콘솔에 경로별 오류를 찍고 예외를 던진다. 테스트는 `src/content/missions/*.json`을 전부 검증한다.

구현(M4-8): 임무 1~3(`m01`~`m03`)과 훈련(`t1`·`t3`·`t4`·`t5`)이 모두 이 형식이다(코드 훈련은 삭제). 훈련을 표현하려고 스키마를 넓혔다: `land.maxFpm`(착지 하강률 한계, 넘으면 조언만 하고 목표는 그대로), 조건 `playerHits {count}`·`laserBroken`(유도 중 레이저 점 상실)·`tadsActive`·`unitsIdentified {units, count?}`·`groupArrived {group, count?}`, 행동 `hint {text}`(화면 가운데 단계 지시 한 줄), 유닛 `passive`(인지·교전 안 함). `kind: 'training'`은 주 목표만 끝나면 착륙 없이 성공. FARP 중 `services`에 `fuel`이 있는 것만 재급유·FARP 메뉴가 되는 기지 패드이고, 없는 것은 착륙 패드(T1의 B). 교량(`bridge`) 아래는 도로 평탄화를 하지 않아 물이 남고, 지상 유닛은 상판 높이로 달린다(`terrain.driveHeightAt`). 콘텐츠 테스트: 모든 지상 유닛·FARP·BP가 물·급경사 위가 아닌지, 교전 임무는 BP 2곳·민간 요소·FARP가 적 무리에서 3~8km인지(임무 1 정찰은 경로가 길어 상한을 8km로), 임무마다 목표를 차례로 달성하는 스크립트 재생.

구현(M5-5·M5-7): 최상위 `wingman: true`면 런타임이 윙맨을 임무 유닛 ID `hound2`로 스폰해 목표·조건에서 참조할 수 있다. `steps: [{ text, touch?, done }]`는 **단계형 지시** — 화면 가운데에 `n/전체 text`(터치면 `touch`가 있으면 그것)를 띄우고, 현재 단계의 `done` 조건만 10Hz로 검사해 참이면 `✓ text`를 1.2초 보여 준 뒤 다음 단계로(앞 단계를 건너뛰지 않는다). `steps`가 있으면 `hint` 행동은 표시하지 않는다. 임무가 성공으로 끝날 때 이미 참인 남은 단계는 한꺼번에 완료 처리. 조건 추가: `engineReady`(시동 + 로터 97%), `playerAgl {above?, below?}`(m), `hover {seconds}`(지면 속도 2m/s 미만·지상 1.5m 위로 연속), `ringsPassed {objective, count}`. 목표 추가: `rings {rings: [x,z][], radius, maxAgl}` — 순서대로, 수평 반경 안·지상 `maxAgl` 아래로 지나야 통과(물리 스텝마다 검사), 통과 시 `ring` 이벤트, 활성 동안 `maxAgl`을 넘으면 4초마다 `tooHigh` 조언, 항법 목표는 다음 링. 링은 지상 `maxAgl/2` 높이에 진행 방향을 향한 고리(다음=노랑, 지난=초록 흐림, 앞=흰색 흐림)로 그린다. 유닛 옵션 `parked: true`는 지면에 세워 두고 인지·교전하지 않는 유닛(임무 9의 주기 헬기), `aam: true`는 적 헬기의 적외선 공대공 미사일 사용.

### 임무 런타임 규칙
- 트리거는 **1Hz로 평가**한다(초당 1번이면 충분하고, 싸다).
- 목표는 `pending → active → done | failed`. 주 목표가 모두 `done`이고 플레이어가 FARP·기지에 착륙하면 임무 성공(착륙 없이도 끝낼 수 있게 일시정지 메뉴에 "임무 종료" — 이때 착륙 보너스 없음).
- 주 목표 중 하나라도 `failed`면 무전으로 알리고 10초 후 임무 실패.
- 무전(`radio`)은 화면 하단 자막 + 짧은 무전 잡음 효과음. 동시에 여러 개면 큐에 쌓아 순서대로 4초씩.
- 구현(M4-2, `src/sim/mission/runtime.ts`): `MissionRuntime`이 `Objective` 인터페이스를 구현해 `FlightSession`에 그대로 꽂힌다(세션이 `tick`을 매 스텝 부른다). 시작 시 권장 로드아웃·시간/안개 조건 적용, 숨기지 않은 유닛 스폰(유닛 `skill`은 명중률 ×, 반응 시간 ÷), 시작 방식별 배치(`farp_cold` 착륙·시동 꺼짐, `farp_hot` 착륙·로터 100%, `air` 고도·속도). 목표는 1Hz 평가 + 착륙·파괴·식별 이벤트 때 즉시 재평가. 식별 목표는 식별했거나 이미 파괴된 유닛을 인정한다. 활성 `reach`/`land` 목표가 항법 목표(TSD·IHADSS 마름모)가 된다. 이벤트: `radio {from, text}`(4초 간격 큐, 무전 잡음 재생), `smoke {pos, color}`(90초 유지), `missionObjective {id, state, primary}`. `startGroup`은 시작된 그룹 목록만 기록한다(이동은 M4-4). 실패 사유 문자열(`missionEnd.reason`)은 실패 화면에 그대로 나온다.

### 임무 작성 예시 (임무 1 요약)

```json
{
  "id": "m01", "title": "첫 정찰", "act": 1, "kind": "recon",
  "briefing": {
    "summary": "국경 계곡에 VPA 기계화 부대가 집결 중이라는 첩보. 정찰 지점 셋을 돌며 확인하라.",
    "situation": ["…"],
    "threats": ["소화기", "기관총 차량"],
    "recommendedLoadout": { "L2": "hydra70", "L1": "agm114k", "R1": "agm114k", "R2": "hydra70", "gunRounds": 1200, "fuel": 80 }
  },
  "environment": { "seed": 1101, "time": "day", "fog": false, "wind": { "dirDeg": 240, "speed": 4, "gust": 2 } },
  "start": { "kind": "farp_hot", "position": [-4200, 3800], "headingDeg": 20 },
  "objectives": [
    { "id": "o1", "kind": "reach", "waypoint": "rp1", "radius": 300, "primary": true, "label": "정찰 지점 1 통과" },
    { "id": "o4", "kind": "identify", "units": ["t1", "t2"], "primary": true, "label": "적 기갑 식별" },
    { "id": "o5", "kind": "land", "farp": "farp_a", "primary": true, "label": "FARP 귀환" }
  ],
  "triggers": [
    { "id": "tr1", "once": true, "when": { "kind": "objectiveDone", "objective": "o4" },
      "then": [{ "kind": "radio", "from": "control", "text": "하운드 1, 확인했다. 교전을 허가한다." }, { "kind": "objectiveAdd", "objective": "o6" }] }
  ]
}
```

## 6.3 임무 스폰 배치 원칙 (레벨 디자인 가이드)

- **팝업 위치를 설계한다**: 모든 주요 표적 군집에는 1.5~5km 거리에 능선·숲 뒤 **엄폐 호버 위치가 최소 2곳** 있어야 한다. 임무 작성 시 `waypoints`에 `BP1`, `BP2`(Battle Position)로 표시해 TSD에 보여 준다.
- **대공 위협은 표적을 감싼다**: 대공포는 표적 군집 가장자리, SAM은 뒤쪽 고지. 정면 돌파는 불리하고 측면 우회는 가능하게.
- **민간 요소**: 대부분 임무에 민가·민간 차량을 표적 근처에 둔다. 로켓 난사를 억제하고 TADS 식별을 쓰게 한다(P3).
- **귀환 동선**: FARP는 출발점 근처, 교전 지역에서 3~6km.
- 임무 하나의 동시 활성 유닛은 **150개 이하**(08장 성능 예산).

## 6.4 무전 대사 원칙

- 짧고 건조하게. 한 줄 25자 안팎. 예: "하운드 1, 스틸 6. 적 기갑, 교량 동쪽 800. 붉은 연막." / "하운드 1, 레이더 경보. 북서쪽."
- 호칭: 플레이어는 항상 "하운드 1". 과장된 감탄사, 욕설, 적 비하 표현 금지.
- 모든 문자열은 `src/content/strings.ko.json` 또는 임무 JSON 안에. 코드에 한국어 문장을 하드코딩하지 않는다(현재 코드의 한국어 문자열도 M0에서 옮긴다).

## 6.5 FARP (전방 재보급 지점)

- 현재 기지 패드(`pads[0]`, 연료 보급)를 FARP로 일반화한다. 모델: 헬리패드 + 연료 블래더(검은 자루 모양 상자) + 탄약 상자 더미 + 텐트 1 + 연합군 트럭 1.
- 착륙하면 FARP 메뉴가 뜬다(엔진 켠 채로 가능): `재급유`(현재 8%/초 유지), `재무장`(로드아웃 화면이 뜨고, 변경 후 파일런당 15초), `수리`(60초). 모두 선택 시 동시에 진행하고 가장 긴 시간이 걸린다. 진행 중 이륙하면 중단.
- FARP는 파괴되지 않는다. 적은 FARP 반경 1.5km 안으로 들어오지 않는다(임무 설계 규칙).
- 구현(M4-5, `src/sim/farp.ts`, `src/ui/flight/FarpMenu.tsx`): FARP = `base` 패드(훈련의 기지 패드, 임무의 모든 `farps`). 재급유는 지금처럼 착륙해 있으면 자동(8%/초)이고 메뉴에 진행률만 보여 준다. 메뉴에서 `수리`(계통이 하나라도 손상됐을 때, 60초에 전 계통 100·변속기 카운트다운 해제)와 `재무장`(파일런 저장물 순환·기관포 탄 수 선택, 바뀌거나 덜 찬 파일런·기관포·스팅어마다 15초)을 골라 `시작`하면 동시에 진행하고 긴 쪽이 끝나면 완료. 재무장은 연료를 건드리지 않는다. 진행 중 이륙하거나 패드를 벗어나면 중단(끝나지 않은 수리·재무장은 적용 안 됨). 이벤트 `farp {state: started | done | cancelled}`. 로드아웃 전용 화면은 M4-6. 소품은 Quaternius 상자·드럼통·기름통·막사(텐트 대신)·모래주머니(CC0, 지연 로드 그룹 `farp`)와 코드 연료 블래더·호스·트럭. 임무의 `land` 목표는 시작 뒤 한 번 이륙한 다음에만 인정한다(#74).
