# 06. 임무와 전장

## 6.1 전장 (카르다 산맥)

### 지형
- 현재 `Terrain`(`src/sim3d/terrain.ts`)은 4km×4km, 320×320 격자(12.5m), 시드 기반 절차 생성, 가장자리 산맥, 호수, 숲, 헬리패드, 집이다.
- 전투용 요구: 헬파이어 사거리 8km, SAM 10km를 담으려면 **최소 12km×12km** 가 필요하다.
- 결정: **임무마다 12km×12km 지도**, 격자 12.5m 유지 → 961×961 높이. 렌더는 **청크 LOD**(2km 청크 6×6, 가까운 청크 고해상도, 먼 청크 1/4 해상도). 물리·AI는 전체 높이 배열을 그대로 쓴다(메모리 약 3.7MB, 문제 없음).
- **시드 + 임무 데이터**로 지형을 만든다: 절차 생성으로 바탕을 만들고, 임무 JSON의 `terrain.features`(도로, 마을, 교량, 기지 부지, 강제 평탄화 영역)를 얹는다. 같은 임무는 항상 같은 지형이 나온다(시드 고정).
- 기존 생성 규칙(패드 평탄화, 나무 배치 규칙, 건물 배치 규칙)은 재사용한다.

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

### 임무 런타임 규칙
- 트리거는 **1Hz로 평가**한다(초당 1번이면 충분하고, 싸다).
- 목표는 `pending → active → done | failed`. 주 목표가 모두 `done`이고 플레이어가 FARP·기지에 착륙하면 임무 성공(착륙 없이도 끝낼 수 있게 일시정지 메뉴에 "임무 종료" — 이때 착륙 보너스 없음).
- 주 목표 중 하나라도 `failed`면 무전으로 알리고 10초 후 임무 실패.
- 무전(`radio`)은 화면 하단 자막 + 짧은 무전 잡음 효과음. 동시에 여러 개면 큐에 쌓아 순서대로 4초씩.

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
