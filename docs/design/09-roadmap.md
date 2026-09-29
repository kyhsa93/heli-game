# 09. 로드맵

## 9.1 원칙

- 마일스톤은 **순서대로**. 각 마일스톤 끝에는 "플레이 가능한 상태"가 있어야 한다(배포해도 되는 상태).
- 작업 ID 하나 = 커밋(또는 PR) 하나 크기. 작업이 너무 크면 `M1-3a`, `M1-3b`로 쪼갠다.
- 🅰 표시 작업은 외부 에셋을 추가한다: 10장 10.8절 규칙(라이선스 재확인, CREDITS 기재, 가공·용량 예산, 폴백)을 지킨다.
- 각 작업의 **완료 조건**을 모두 만족하고 `npm run check`가 통과해야 체크한다. 렌더·UI 작업은 스크린샷 확인까지(08장 8.8절).
- 작업마다 GitHub 이슈가 있다(체크박스 앞 번호). 작업 상세(작업 내용·완료 조건·선행 이슈)는 이슈 본문에 있고, 이 문서와 이슈가 다르면 이슈를 최신으로 본다.
- 작업을 끝내면 이슈를 닫고(커밋 메시지에 `Closes #번호`) 이 문서의 체크박스를 `[x]`로 바꾼다.

## 9.2 의존 관계

```
M0 기반 정리 ─→ M1 전투 샌드박스 ─→ M2 센서·유도무기 ─→ M3 위협·생존 ─→ M4 임무 시스템 ─→ M5 캠페인
                                                                              └─→ M6 환경 (M4 이후 병행 가능)
                                                                    M7 완성도 (M5 이후)
```

## M0. 기반 정리 — 동작은 그대로, 구조만 바꾼다

목표: 08장 목표 구조로 옮기고, 비행·착륙·계기가 **지금과 똑같이** 동작한다. 지금의 보급품 운송 게임은 **훈련 T1(기본 비행)** 으로 바뀐다(자유 비행 모드는 만들지 않음). 비행·착륙 테스트는 그대로 통과해야 한다.

- [x] [#1](https://github.com/kyhsa93/heli-game/issues/1) **M0-1 core 분리**: `sim3d/math.ts` → `core/math.ts`, 단위 상수 → `core/units.ts`, `core/events.ts`(타입 있는 이벤트 버스: `on/off/emit/flush`), `core/grid.ts`. *완료*: 이벤트 버스·격자 단위 테스트.
- [x] [#2](https://github.com/kyhsa93/heli-game/issues/2) **M0-2 World 도입**: `sim/world.ts`에 `World` 클래스. 현재 `Sim`의 비행 물리(`fly`, `collide`, `groundAttitude`, 로터·연료)를 `sim/heli/flight.ts`, `sim/heli/systems.ts`로 옮긴다. 보급품 임무 규칙(`newMission`, `onGround`의 적재·하역, 점수)은 **삭제**하고, 기지 패드 연료 보급만 남긴다(M4-5에서 FARP로 일반화). *완료*: `sim.test.ts`의 terrain·flight 테스트 8개가 (필요시 import만 바꿔서) 통과, refuel 테스트 유지, 화물 배달 테스트는 삭제.
- [x] [#3](https://github.com/kyhsa93/heli-game/issues/3) **M0-3 렌더 분리**: `Flight3D.tsx`의 rAF 루프·렌더·카메라·계기 갱신을 `render/renderer.ts`의 `FlightRenderer` 클래스로. React 컴포넌트는 마운트/언마운트만. `heliModel.ts`를 `render/heliModel.ts`(외형)와 `render/cockpit/cockpitModel.ts`(조종석)로 분리. *완료*: 스크린샷 비교(정면·아래·외부)가 변경 전과 같음.
- [x] [#4](https://github.com/kyhsa93/heli-game/issues/4) **M0-4 입력 분리**: 키 처리(`Flight3D`의 keydown switch)와 `FlightInput`을 `input/`으로. `bindings.ts`에 07장 조작표 반영(단, 전투 키는 아직 동작 없이 자리만). Q/E 페달 제거. *완료*: 입력 매핑 단위 테스트(키 코드 → 명령).
- [x] [#5](https://github.com/kyhsa93/heli-game/issues/5) **M0-5 문자열·콘텐츠 이동**: 코드 안 한국어 문자열을 `content/strings.ko.json`으로. `content/aircraft.json`에 비행 상수(03장 표). *완료*: `grep`으로 `src/sim` 안에 한글이 없음을 확인하는 테스트.
- [x] [#6](https://github.com/kyhsa93/heli-game/issues/6) **M0-6 화면 상태 기계 + 훈련 T1**: `ui/state.ts` + 타이틀 화면. 타이틀 → 훈련 T1(패드 A 이륙 → 패드 B 착륙, 02장 훈련 표)만 연결, 나머지 메뉴는 "준비 중" 비활성. T1은 M4 임무 시스템 전까지 임시 코드 규칙으로 두고 M4-8에서 JSON 임무로 옮긴다. *완료*: T1 완료 판정 테스트(착륙 하강률 500fpm 이하), 타이틀·T1 스크린샷, 해시 라우팅 동작.
- [x] [#7](https://github.com/kyhsa93/heli-game/issues/7) **M0-7 아키텍처 테스트**: `src/arch.test.ts` (08장 8.3절 의존 규칙 검사).
- [x] [#8](https://github.com/kyhsa93/heli-game/issues/8) **M0-8 🅰 에셋 파이프라인**: `public/assets/` + `CREDITS.md` 형식, `src/assets/manifest.ts`·`loader.ts`(진행률, 실패 시 폴백), `scripts/`의 가공 스크립트(GLB meshopt 압축, 오디오 모노 MP3 인코딩, 한글 폰트 서브셋 — 문자열 파일에서 글자 추출). *완료*: 로더 폴백 테스트(없는 파일 → 폴백 호출), 첫 로드 에셋 합계 ≤ 600KB 검사 테스트, CREDITS의 모든 항목에 URL·라이선스·확인 날짜가 있는지 검사하는 테스트.
- [x] [#9](https://github.com/kyhsa93/heli-game/issues/9) **M0-9 🅰 폰트·하늘**: B612 Mono(IHADSS·MPD·EUFD 캔버스 글꼴), Pretendard 서브셋(UI), `Sky.js`로 현재 하늘 셰이더 교체(낮 기준, 구름 켬). *완료*: 조종석·외부·메뉴 스크린샷, 폰트 로드 전후로 계기 글자 깨짐 없음(폰트 로드 완료 후 캔버스 다시 그림).

## M1. 전투 샌드박스 — 쏘고 부순다

목표: 사격장에서 기관포로 표적을 부술 수 있다. "훈련 3"의 기관포 절반.

- [x] [#10](https://github.com/kyhsa93/heli-game/issues/10) **M1-1 유닛 엔티티**: `Unit` 타입, `content/units.json`(05장 표 전체 수치, 아직 AI 없음), 월드에 스폰/파괴. *완료*: 스폰·파괴·`unitDestroyed` 이벤트 테스트.
- [x] [#11](https://github.com/kyhsa93/heli-game/issues/11) **M1-2 🅰 유닛 모델·렌더러**: 10장 10.6절 채택 모델(트럭·전차·장갑차·보병) GLB 가공·등록, 로드 후 공용 머티리얼로 교체, 벙커는 코드 모델, `unitRenderer.ts` 인스턴싱, 잔해 표현, 모델 로드 실패 시 코드 도형 폴백. *완료*: 유형별 스크린샷, 유닛 100개에서 드로우콜 ≤ 30 증가.
- [x] [#12](https://github.com/kyhsa93/heli-game/issues/12) **M1-3 피해 계산**: `sim/weapons/damage.ts` — 관통 vs 장갑 배율, 폭발 반경 감쇠. *완료*: 04장 예시(30mm가 전차에 ×0.1) 테스트.
- [x] [#13](https://github.com/kyhsa93/heli-game/issues/13) **M1-4 기관포**: 발사체 탄도(중력·항력), 선분 충돌(지형·유닛), 분산, 탄약 소모, 짐벌 한계, 머리 시선 조준. *완료*: 1km 수평 사격 낙차가 공식과 ±5% 일치 테스트 / 짐벌 한계 밖 발사 불가 테스트 / 발사 속도 10발/초 테스트.
- [x] [#14](https://github.com/kyhsa93/heli-game/issues/14) **M1-5 🅰 효과**: Kenney 파티클로 512² 스프라이트 아틀라스 제작, 총구 섬광, 예광탄, 착탄 흙먼지, 폭발, 연기·불(풀링). *완료*: 스크린샷, 1분 연사 후 효과 객체 수가 풀 크기 이하.
- [x] [#15](https://github.com/kyhsa93/heli-game/issues/15) **M1-6 IHADSS 기관포 심볼 + 무장 표시**: 07장 7.4절 기관포 조준점·선택 무장. *완료*: 스크린샷.
- [x] [#16](https://github.com/kyhsa93/heli-game/issues/16) **M1-7 사격장 훈련(T3 일부)**: 고정 표적 10개 배치, 결과 화면. *완료*: 헤드리스로 자동 조준 명령을 넣어 표적 파괴 → 결과 화면 도달.
- [x] [#17](https://github.com/kyhsa93/heli-game/issues/17) **M1-8 🅰 사운드**: 로터·터빈 녹음 루프와 시동 클립으로 `RotorAudio` 교체(회전수에 따라 재생 속도, 합성은 폴백), 기관포·착탄·폭발 녹음(이벤트 구독). *완료*: 이벤트 → 사운드 호출 단위 테스트(AudioContext 목).

## M2. 센서와 유도무기

- [x] [#18](https://github.com/kyhsa93/heli-game/issues/18) **M2-1 로드아웃 데이터·무게**: `sim/heli/loadout.ts`, 03장 무게 공식, 실효 추력 반영. *완료*: 무거운 로드아웃에서 호버 콜렉티브가 03장 예시값 ±0.02.
- [x] [#19](https://github.com/kyhsa93/heli-game/issues/19) **M2-2 외형에 로드아웃 반영**: 파일런별 메시 교체, 발사 시 한 발씩 사라짐. *완료*: 스크린샷(조종석 옆 시점 포함).
- [x] [#20](https://github.com/kyhsa93/heli-game/issues/20) **M2-3 로켓**: 연사, 조향 큐, 면 피해. *완료*: 연사 수·간격 테스트, 반경 피해 테스트.
- [x] [#21](https://github.com/kyhsa93/heli-game/issues/21) **M2-4 TADS 모드**: 두 번째 카메라, 렌더 타깃, 줌 단계, TV/FLIR 셰이더, TADS 화면 UI(07장 7.5절), TADS 중 자동 호버. *완료*: 줌 단계별·FLIR 스크린샷, TADS 중 기체 위치 이동 < 2m/10초 테스트.
- [x] [#22](https://github.com/kyhsa93/heli-game/issues/22) **M2-5 레이저·식별**: 레이저 측거(지형·유닛 레이캐스트), 협각 1초 조준 시 식별. *완료*: 측거 거리 오차 < 1m 테스트, 식별 테스트.
- [x] [#23](https://github.com/kyhsa93/heli-game/issues/23) **M2-6 헬파이어 레이저**: 미사일 엔티티, LOBL/LOAL, 레이저 추종, 레이저 끊기면 빗나감. *완료*: LOBL 명중 테스트 / 레이저 중단 시 빗나감 테스트 / LOAL로 능선 너머 명중 테스트.
- [x] [#24](https://github.com/kyhsa93/heli-game/issues/24) **M2-7 MPD 페이지 시스템 + WPN·TADS 페이지**: 베젤 클릭 레이캐스트, `[` `]` 키. *완료*: 스크린샷, 페이지 전환 테스트.
- [x] [#25](https://github.com/kyhsa93/heli-game/issues/25) **M2-8 훈련 T3·T4 완성**.

## M3. 위협과 생존

- [x] [#26](https://github.com/kyhsa93/heli-game/issues/26) **M3-1 가시선**: `sim/los.ts`, 나무 차폐. *완료*: 능선 뒤 가려짐 / 나무 차폐율 테스트.
- [x] [#27](https://github.com/kyhsa93/heli-game/issues/27) **M3-2 인지 모델**: 05장 5.4절 공식 그대로. *완료*: 5장 5.6절 테스트 목록 중 탐지 관련 3개.
- [x] [#28](https://github.com/kyhsa93/heli-game/issues/28) **M3-3 AI 상태 기계**: 대기/경계/교전/수색/후퇴, 조준 지연, 확률 명중 + 연출 예광탄. *완료*: 상태 전이 테스트, "가시선 끊기면 3초 안에 사격 중지" 테스트.
- [x] [#29](https://github.com/kyhsa93/heli-game/issues/29) **M3-4 플레이어 피해 계통**: 03장 3.3절 표 전체, EUFD 경고, 증상. *완료*: 계통별 증상 테스트(엔진 1 정지 시 최대 추력 −50% 등).
- [x] [#30](https://github.com/kyhsa93/heli-game/issues/30) **M3-5 적 미사일**: 비례항법, 적외선/레이더, 가시선 상실 시 유도 상실. *완료*: 정지 표적 명중 테스트, 지형 뒤로 숨으면 빗나감 테스트.
- [x] [#31](https://github.com/kyhsa93/heli-game/issues/31) **M3-6 RWR·CMWS·대응책**: ASE 페이지, IHADSS 위협 표시, 플레어·채프 확률. *완료*: 기만 확률 통계 테스트(시드 고정 1,000회), 스크린샷.
- [x] [#32](https://github.com/kyhsa93/heli-game/issues/32) **M3-7 🅰 자주대공포·SAM·MANPADS·기관총차량 모델과 행동**: SAM은 채택 모델(Pantsir), 기관총차량은 UAZ 모델, 자주대공포·대공 진지는 코드 모델.
- [x] [#33](https://github.com/kyhsa93/heli-game/issues/33) **M3-8 🅰 음성 경고·RWR 소리·피격음**: 금속 피격 녹음, RWR·경고음은 합성, 음성 경고는 `speechSynthesis`(9.3 결정, 녹음 파일로 교체 가능한 인터페이스), 무전 잡음 녹음.
- [x] [#34](https://github.com/kyhsa93/heli-game/issues/34) **M3-9 난이도 배율**(05장 표). *완료*: 배율 적용 테스트.
- [x] [#35](https://github.com/kyhsa93/heli-game/issues/35) **M3-10 훈련 T5**.

## M4. 임무 시스템

- [x] [#36](https://github.com/kyhsa93/heli-game/issues/36) **M4-1 임무 스키마·검증기**: `sim/mission/schema.ts`, 콘텐츠 검증 테스트(08장 8.8절).
- [x] [#37](https://github.com/kyhsa93/heli-game/issues/37) **M4-2 임무 런타임**: 목표·트리거·무전 큐, 1Hz 평가, 성공/실패 판정. *완료*: 트리거 조건 종류별 테스트, 목표 상태 전이 테스트.
- [x] [#38](https://github.com/kyhsa93/heli-game/issues/38) **M4-3 🅰 지형 확장**: 12km 지도, 임무 `terrain.features`·도로 적용, 청크 LOD 렌더, ambientCG 회색조 디테일 맵 경사·높이 스플랫(10장 10.5절). *완료*: 같은 시드 → 같은 높이 배열 테스트, 도로 평탄화 테스트, 성능 예산 확인.
- [ ] [#39](https://github.com/kyhsa93/heli-game/issues/39) **M4-4 유닛 이동**: 도로 그래프, A*, 그룹 행동(patrol/advance/convoy). *완료*: 호송 그룹이 경로 끝에 도착 테스트.
- [ ] [#40](https://github.com/kyhsa93/heli-game/issues/40) **M4-5 🅰 FARP**: 모델(채택 소품: 텐트·상자·드럼통·헬리패드 + 코드 연료 블래더), 착륙 시 메뉴, 재급유·재무장·수리. *완료*: 서비스 시간 테스트, 스크린샷.
- [ ] [#41](https://github.com/kyhsa93/heli-game/issues/41) **M4-6 화면**: 브리핑, 로드아웃, 디브리핑, 일시정지, 무전 자막, 목표 추적기. *완료*: 화면별 스크린샷(데스크톱·모바일 가로·세로).
- [ ] [#42](https://github.com/kyhsa93/heli-game/issues/42) **M4-7 점수·평점**: `sim/mission/scoring.ts`, 02장 2.4절. *완료*: 점수 항목별 테스트.
- [ ] [#43](https://github.com/kyhsa93/heli-game/issues/43) **M4-8 임무 1~3 작성**: JSON + 플레이 확인(헤드리스로 목표 달성 경로 자동 재생 테스트 1개씩).
- [ ] [#44](https://github.com/kyhsa93/heli-game/issues/44) **M4-9 즉시 출격 모드**: 시드 무작위 임무 생성(표적 군집 1~2, 위협 수준 선택).

## M5. 캠페인

- [ ] [#45](https://github.com/kyhsa93/heli-game/issues/45) **M5-1 저장**: `save/storage.ts`, `CampaignSave` v1, 이관 규칙. *완료*: 저장·로드·손상 데이터 복구 테스트.
- [ ] [#46](https://github.com/kyhsa93/heli-game/issues/46) **M5-2 캠페인 지도 화면·해금**: `content/campaign.json`, 02장 2.5절 표.
- [ ] [#47](https://github.com/kyhsa93/heli-game/issues/47) **M5-3 FCR + 헬파이어 레이더**: 04장 FCR 규칙, 표적 목록, 발사 후 망각. *완료*: 스캔 결과 가시선 필터 테스트, 발사 후 숨어도 명중 테스트.
- [ ] [#48](https://github.com/kyhsa93/heli-game/issues/48) **M5-4 🅰 적 공격 헬기 + 스팅어**: Mi-24 모델(텍스처 재압축 ≤ 0.5MB), 윙맨 아파치는 채택 모델(TheOminousDuck) 사용 여부를 여기서 결정.
- [ ] [#49](https://github.com/kyhsa93/heli-game/issues/49) **M5-5 윙맨**: 편대, 표적 분담, 무전 메뉴 지시(03장 3.4절).
- [ ] [#50](https://github.com/kyhsa93/heli-game/issues/50) **M5-6 임무 4~12 작성**.
- [ ] [#51](https://github.com/kyhsa93/heli-game/issues/51) **M5-7 훈련 T1·T2 단계형 지시**(07장 7.9절).

## M6. 환경

- [ ] [#52](https://github.com/kyhsa93/heli-game/issues/52) **M6-1 시간대**: 새벽·해질녘·야간 조명, 계기판 조명.
- [ ] [#53](https://github.com/kyhsa93/heli-game/issues/53) **M6-2 PNVS 열상 오버레이**(야간 비행용, 키 `N`).
- [ ] [#54](https://github.com/kyhsa93/heli-game/issues/54) **M6-3 안개**, 탐지·TADS 가시거리 영향.
- [ ] [#55](https://github.com/kyhsa93/heli-game/issues/55) **M6-4 탐조등**(야간 대공 진지).

## M7. 완성도

- [ ] [#56](https://github.com/kyhsa93/heli-game/issues/56) **M7-1 설정 화면**(07장 7.8절) + 품질 단계 + **크레딧 화면**(CREDITS.md 표시). 크레딧 화면은 첫 CC-BY 에셋이 들어가는 작업(M1-2)에서 최소 형태로 먼저 만든다.
- [ ] [#57](https://github.com/kyhsa93/heli-game/issues/57) **M7-2 터치 전투 UI**(07장 7.6절 배치), 게임패드 전투 매핑.
- [ ] [#58](https://github.com/kyhsa93/heli-game/issues/58) **M7-3 성능 작업**: 모바일 30fps 확인, 예산 초과 항목 해결.
- [ ] [#59](https://github.com/kyhsa93/heli-game/issues/59) **M7-4 사운드 믹싱·무전 효과**.
- [ ] [#60](https://github.com/kyhsa93/heli-game/issues/60) **M7-5 접근성**: 글자 크기, 자막, 색 비의존 확인.
- [ ] [#61](https://github.com/kyhsa93/heli-game/issues/61) **M7-6 플레이테스트 반영 밸런스 패스**: `content/*.json` 수치 조정, 문서 표 갱신.

## 9.3 결정된 사항

- 2026-09-29: **자유 비행 모드 없음**, **무적·무한 탄약·무한 연료 모드 없음** (소유자 결정). 관련 기획은 모든 문서에서 제거했다.
- 2026-09-29: **외부 에셋 권장안 전체 채택** (소유자 결정). 대상·규칙은 [10-external-assets.md](10-external-assets.md), 에셋이 들어가는 작업은 🅰 표시.
- 2026-09-29: **음성 경고는 기본안** (소유자 결정) — 브라우저 `speechSynthesis`로 먼저 구현한다(영어, 인터콤 필터는 못 씌움). 나중에 녹음 파일이 생기면 `public/assets/audio/voice/`에 넣고 같은 인터페이스로 교체한다.
- 2026-09-29: **윙맨은 기본안** (소유자 결정) — 보조 목표 수준의 동료. 격추되면 보조 목표 실패, 지시 메뉴는 임무 10 이후 해금(03장 3.4절). 캠페인을 윙맨 지휘 중심으로 키우지 않는다.
- 2026-09-29: **UI는 한국어만** (소유자 결정) — 영어는 1.0 범위 밖. 단 문자열은 `content/strings.ko.json`과 임무 JSON에 모아 두어 나중에 추가할 수 있게 한다.
- 2026-09-29: 01장의 제목·가상 설정, 상업 이용 가능 라이선스만 사용, 3막 12임무, 심 라이트 난이도, 비행 중 세로 화면 미지원은 기획자 제안으로 올렸고, 소유자가 이견 없이 진행을 지시했다.

## 9.4 미정 사항

없음 (2026-09-29 기준). 새로 생기면 `> 미정:` 블록으로 추가한다.
