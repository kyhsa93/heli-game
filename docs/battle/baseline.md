# 전장 작업 기준선 (B1-1)

제거 커밋 `439ab27`(2026-09-30) 기준. 전장 로드맵(위키 `10-로드맵`)의 모든 작업은 아래 회귀 기준을 깨지 않아야 한다.

## 빌드 크기

`vite build` gzip 기준.

| 산출물 | 제거 전 `def4383` | 제거 후 `439ab27` | 차이 |
| --- | --- | --- | --- |
| 첫 JS 번들(`index`) | 206.2 KB | 128.5 KB | −77.7 KB |
| 비행 청크(`Flight`) | 132.4 KB | 없음(화면 미연결) | −132.4 KB |
| `GLTFLoader` | 13.2 KB | 13.5 KB | +0.3 KB |
| `BufferGeometryUtils` | 1.4 KB | 없음 | −1.4 KB |
| `meshopt_decoder` | 7.3 KB | 7.3 KB | 0 |
| CSS | 3.5 KB | 3.5 KB | 0 |
| **JS 합계** | **360.5 KB** | **149.2 KB** | **−211.3 KB** |

- 비행 셸이 다시 연결되면(B1-12) 비행 청크가 돌아온다. 캠페인 콘텐츠가 빠진 만큼 제거 전보다 작아야 한다.
- 첫 번들 128.5 KB에는 `assets/loader`가 끌고 오는 three 일부가 들어 있다(타이틀 화면이 로딩 화면을 쓰기 때문).
- `public/assets`: 오디오 240 KB · 모델 372 KB · 텍스처 212 KB · 글꼴 108 KB(한국어 서브셋 두 벌 각 약 47 KB).

## 테스트

| | 제거 전 | 제거 후 |
| --- | --- | --- |
| 테스트 파일 | 61 | 50 |
| 테스트 | 471 | 325 |

## 회귀 기준

모든 전장 작업에서 통과해야 하는 테스트. 전장 코드가 이 파일들을 고쳐야 한다면 커밋 메시지에 이유를 쓴다.

1. **아파치 계통** — 비행·계통·피해·로드아웃·자동 호버·무장·센서
   - `src/sim/sim.test.ts`(비행 모델·결정론)
   - `src/sim/heli/damage.test.ts`, `src/sim/heli/loadout.test.ts`
   - `src/sim/weapons/{ballistics,gun,rockets,hellfire,stinger,enemyMissile,damage}.test.ts`
   - `src/sim/sensors/{tads,fcr,laser,ase}.test.ts`
   - `src/sim/farp.test.ts`, `src/sim/difficulty.test.ts`
2. **적 AI(대 플레이어)** — `src/sim/ai/{awareness,brain,air,airDefense,movement,searchlight,lethality}.test.ts`
3. **지형·가시선·유닛** — `src/sim/{terrain,los,units}.test.ts`
4. **PWA 무캐시** — `src/sw.test.ts`
5. **구조 규칙** — `src/arch.test.ts`
6. **전장 결정론** — B1-2부터 추가(같은 시드 → 같은 결과 해시)

## 위키 9.0 대비 확인한 사실

- 9.0 모듈 표의 제거·남음 목록은 코드와 일치한다.
- `world.player`를 직접 읽는 적 AI는 `sim/ai/awareness.ts`·`brain.ts`·`air.ts`·`searchlight.ts`다. `sim/weapons/enemyMissile.ts`는 표적 위치·속도를 인자로 받으므로 B1-7(`PlayerBody`)의 교체 대상이 아니다. 플레이어 무장(`rockets`·`hellfire`·`ballistics`)은 헬기 아바타 전용이라 그대로 둔다.
- `sim/objective.ts`의 `Objective` 인터페이스(`start`·`tick`·`onEvent`)는 남아 있고 구현체는 없다. `BattleRuntime`이 첫 구현이 된다.
