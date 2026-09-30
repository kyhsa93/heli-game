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

## 규모 측정 v1 (B1-14)

`npm run battle:bench -- --map harek --mode quick --minutes 10` — 플레이어 없이(배치 화면 대기) 봇끼리 10분, 첫 5초는 제외. node 24, 이 개발 머신 기준.

| 측정 (ms) | 평균 | p99 | 최악 | 예산 |
| --- | --- | --- | --- | --- |
| sim 한 프레임(60fps = 스텝 2번) | 0.066 | 0.340 | 1.985 | 평균 ≤ 1 |
| 전장 10Hz 틱(표적·사격) | 0.110 | 0.288 | 1.291 | 최악 ≤ 2 |
| 전장 1Hz 틱(점령·스폰·지휘) | 0.095 | 0.561 | 1.401 | 최악 ≤ 2 |

- 유닛: 목록 최대 40, 살아 있는 최대 37, 잔해 은퇴 3. 잔해는 죽은 지 90초 뒤 `world.units`에서 빠진다(`world.retireAfter`, 전장만 켬). 유닛 500개를 만들고 죽여도 목록은 150을 넘지 않는다(`retire.test.ts`).
- 참고로 점령전(대규모 편제, B5 대상)은 같은 조건에서 프레임 평균 0.165, 1Hz 틱 최악 **3.6ms** — 지휘관의 효용 계산(소대 × 거점 × 유닛)과 도로 A*가 한 틱에 몰린다. B5-7에서 줄일 것.

## 하니스 v1 · 1차 밸런스 (B1-15)

`npm run battle:harness -- --map harek --mode quick --side coalition|veros --player idle|proxy --seeds 20` (`--set 키=값`으로 경기 방식 수치를 덮어써 비교, `--trace`로 분 단위 추이). `proxy`는 플레이어 아파치 대신 봇 공격 헬기(`sim/battle/proxy.ts`)가 거점 근처 사격 위치를 찾아 다니며 통계 사격한다.

| 20시드 | 한 판 중앙값 | 플레이어 진영 승률 | 소유 변경 A / D / G |
| --- | --- | --- | --- |
| 연합 · idle | 12.0분 | 30% | 0 / 20 / 0 |
| 연합 · proxy | 10.6분 | 100% (대리 처치 17.0 / 사망 0.0) | 0 / 20 / 3 |
| VPA · idle | 11.8분 | 40% | 0 / 20 / 2 |
| VPA · proxy | 10.9분 | 100% (대리 처치 15.3 / 사망 0.1) | 4 / 20 / 0 |

- 목표: 중앙값 8~12분 ✓, idle 30~50% ✓, proxy ≥ 60% ✓, "80% 시드에서 거점마다 소유 변경" ✗ → #179.
- 바꾼 수치: 빠른 점령전 티켓 300 → **200**, 출혈 0.1 → **0.3/초·거점**(점령전은 그대로, B5에서). 봇 대 봇 살상 배율 `botLethality`(1)는 올려도 처치 수가 거의 안 늘었다 — 교전 기회가 병목이었다.
- 대리 헬기는 거의 죽지 않는다(봇 방공은 통계 사격, 진영당 대공조 1·방공 차량 1). 실제 플레이어는 봇이 진짜 탄·미사일을 쏘는 기존 경로라 다르다.

## 하니스 v2 · 보병 대리 (B2-16)

`--player soldier [--stance cover|exposed]`: 실제 플레이어 보병을 `soldierCommands`로 조종한다(`sim/battle/soldierProxy.ts`). 가장 가까운 비소유 거점을 점령할 때까지 목표로 고정하고, 거점 영역 +1km 상자 안 4m 격자 흐름장(`sim/battle/footpath.ts`, 실제 이동과 같은 규칙 — 오르막 도착점 법선 32°·깊은 물 제외)을 따라 걷는다. 시야가 완전히 트인 적 분대가 300m 안에 있으면 조준 사격(탄 낙차 보정·점사). `cover`는 거점 500m 안·피격 뒤 15초 동안 앉아서 이동하고, 교전 때는 엄폐물(소품·나무) 뒤에서 앉고, 맞으면 4초 동안 사격자 반대편 엄폐물로 가거나 엎드린다. `exposed`는 늘 서서 뛴다. 배치는 목표에 가장 가까운 스폰, 본진밖에 없으면(2km 넘게) 30초까지 기다린다.

| 연합 · 20시드 | 한 판 중앙값 | 승률 | 대리 처치 / 사망 | 사망당 생존 |
| --- | --- | --- | --- | --- |
| idle | 12.1분 | 50% | — | — |
| soldier · cover | 12.0분 | 40% | 0.2 / 2.8 | 433초 |
| soldier · exposed | 12.6분 | 35% | 0.3 / 6.3 | 195초 |
| proxy(아파치) | 10.5분 | 100% | 14.4 / 0.0 | — |

- 목표: 엄폐 대 노출 생존 ≥ 2배 ✓(2.2배), 한 판 8~12분 ✓(cover 12.0분), soldier 대리 승률 ≥ 55% ✗ → #186.
- 대리가 받은 피해의 약 70%는 적 장갑차 30mm, 거의 전부 이동 중. 거점 D 둘레 평탄화 경계의 3m 단(보병 통행 불가, 봇은 경사 무시) → #187.

## 경로별 번들 (B1-16)

`npm run check`/`npm run build` 끝에 `scripts/bundle-report.mjs`가 경로별 JS gzip 합계를 출력하고 A1 예산을 넘으면 경고한다(강제는 B10-3). vite `build.manifest`의 import 그래프로 계산한다.

| 경로 | JS gzip | 예산(A1) |
| --- | --- | --- |
| 첫 번들(타이틀·설정·전장 설정) | 143.5 KB | 210 KB |
| 전장 첫 출격(비행 셸·전장 코드·하레크·GLTF) | 333.9 KB | 400 KB |
| 모든 청크 | 333.9 KB | 440 KB |

제거 직후(128.5 KB) 대비 첫 번들 +15 KB는 전장 설정 화면과 문자열이다.
