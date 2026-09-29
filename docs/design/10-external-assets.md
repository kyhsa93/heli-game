# 10. 외부 에셋 검토

2026-09-29 검토. 3D 모델, 사운드, 텍스처·하늘·파티클·폰트·아이콘·실제 지형 데이터를 조사했다. 모든 라이선스는 **각 에셋의 상세 페이지에서 확인**했다(검색 결과의 라이선스 표시는 틀린 경우가 있었다 — 예: Freesound "Autocannon Shot 1"은 검색에선 CC0, 상세 페이지는 CC-BY 4.0). 채택할 때 다운로드 시점에 **한 번 더 확인**한다.

> 상태: **2026-09-29 소유자 결정 — 권장안 전체 채택.** 10.2절 "권장" 판정 항목(사운드, 폰트, 하늘, 파티클, 지면 디테일, 차량·보병·소품 모델)을 모두 쓴다. "코드 모델 유지"·"보류"·"불필요" 판정 항목은 그대로 코드로 만든다. 채택 규칙은 10.8절이며 08장 8.1절에도 반영했다. 로드맵 작업은 09장 M0-8·M0-9와 각 마일스톤의 에셋 표시(🅰) 작업.

## 10.1 판단 기준

| 기준 | 내용 |
| --- | --- |
| 허용 라이선스 | **CC0, 퍼블릭 도메인(미 정부 저작물), CC-BY 3.0/4.0, OFL 1.1, MIT, Apache-2.0, ISC** — 모두 상업적 이용·재배포 가능 |
| 금지 | CC-BY-NC(비상업), ND(변경 금지), "에디토리얼 전용", "재배포 금지" 조항이 있는 라이선스, 출처 불명·게임 추출(rip) 모델 |
| 회색 지대 → 쓰지 않음 | Sonniss GDC 번들("sound effects as sound effects" 재배포 금지 — 웹 게임은 원본 파일이 그대로 내려받아짐), Zapsplat 무료(재배포 금지 + 출처 표기 필수), Pixabay("standalone" 배포 금지), BBC RemArc(비상업) |
| 용량 | **PWA가 아무것도 캐시하지 않으므로 매 실행마다 전부 다시 받는다.** 현재 JS 약 230KB(gzip). 에셋은 처음 로드에 필요한 것과 임무마다 필요한 것을 나눠 지연 로드한다 |
| 스타일 | 지금의 "코드로 만든 저폴리 단색" 외형과 섞여도 어색하지 않을 것. 사실적 사진 텍스처·만화풍(치비)·장난감 색감은 제외 |

## 10.2 결론 요약

| 분야 | 판단 | 이유 |
| --- | --- | --- |
| **사운드** | **적극 채택 권장** | 지금 가장 약한 부분(합성 로터 소리)을 실제 녹음으로 바꿀 수 있고, 미 정부 퍼블릭 도메인 녹음(실제 헬파이어 발사음 등)이 있음. 최소 세트 약 350KB |
| **폰트** | **채택 권장** | B612 Mono(에어버스가 조종석 화면용으로 만든 글꼴)는 이 게임에 딱 맞고 13KB. 한국어는 Pretendard 부분 글꼴 40~60KB |
| **하늘** | **채택 권장 (에셋 아닌 코드)** | three.js 내장 `Sky.js`(MIT, 4.5KB)에 구름까지 있음. HDRI 파일 불필요 |
| **파티클** | **채택 권장** | Kenney 연기·폭발·섬광 스프라이트(CC0)를 512² 아틀라스 하나로 묶어 약 150KB |
| **지형 텍스처** | **선택 채택** | ambientCG(CC0) 회색조 디테일 맵 3~4장을 지금의 정점 색 위에 곱하면 가까이서 본 지면이 좋아짐. 약 150~220KB |
| **적·아군 차량, 보병, 소품** | **채택 권장 (임무별 지연 로드)** | 약 1,000폴리곤 이하의 CC-BY 저폴리 군용차 세트가 있고 용량이 작음(대당 40~70KB). 코드 도형보다 알아보기 쉬움 — TADS로 "식별"하는 게임 규칙(P3)에 직접 도움 |
| **아파치 외형** | **자기 기체는 코드 모델 유지** | 라이선스 깨끗하고 가벼운 모델이 하나 있지만(328KB), 조종석 안에서 보이는 날개·무장·로터와 일치해야 해서 자기 기체는 현재 코드 모델이 낫다. 윙맨·다른 아파치에만 선택적으로 사용 |
| **아파치 조종석** | **코드 모델 유지** | 쓸 수 있는 아파치 조종석 모델이 없음 |
| **실제 지형 데이터** | **보류** | 가능은 하지만(맵당 약 250KB, 출처 표기 필수) 가상 전장·절차 생성 방침과 이점이 크지 않음 |
| **UI 아이콘** | **불필요** | 필요한 기호가 몇 개뿐. 인라인 SVG로 충분 |

**권장 채택 시 용량**: 첫 로드 +약 0.5MB(사운드·폰트·파티클·디테일 맵), 임무별 차량·소품 모델 +0.3~1MB(그 임무에 나오는 유형만). 차량 전체 세트는 약 1.5~2MB(메시 압축 후)이므로 **한 번에 받지 않는다.**

## 10.3 사운드

라이브러리별 판정은 10.1절. 모두 모노 MP3 64~96kbps로 다시 인코딩한다(iOS Safari 18.4 미만은 Ogg/Opus 지원이 불완전). MP3 앞뒤 무음 때문에 루프는 `AudioBufferSourceNode.loopStart/loopEnd`로 자른다.

### 채택 후보

| 용도 | 에셋 | URL | 라이선스 / 작가 | 원본 | 비고 |
| --- | --- | --- | --- | --- | --- |
| 시동·스풀업 | Helicopter Start, Airbus H135 | freesound.org/people/Borgory/sounds/522672/ | CC0, Borgory | 2:43 WAV | 쌍발 터빈 외부음. 시동 구간을 잘라 쓰고 정상 회전 루프도 여기서 |
| 조종석 내부 루프 | G36-10 Helicopter Constant Interior | freesound.org/people/craigsmith/sounds/438593/ | CC0, craigsmith | 1:03 WAV | 안정적인 실내음. 옛 녹음이라 잡음 약간 |
| 외부 통과음 (윙맨) | Apache AH-64 close | freesound.org/people/klankbeeld/sounds/734126/ | **CC-BY 4.0**, klankbeeld | 2:30 WAV | 실제 아파치 약 100m 통과음. **출처 표기 필요** |
| 헬파이어 발사 | AGM-114 Hellfire launch | freesound.org/people/qubodup/sounds/162368/ | CC0 (미 정부 자료) | 2.9초 | **실제 헬파이어** |
| 30mm 기관포 | Autocannon Three Shot Burst | freesound.org/people/qubodup/sounds/854186/ | CC0 (미 해병대 영상) | 1.9초 | 25mm M242 — 무료 중 M230에 가장 가까움 |
| 로켓 발사 | M142 HIMARS Rocket Launch 8 | freesound.org/people/qubodup/sounds/854476/ | CC0 (DVIDS) | 5.8초 | 짧게 자르고 빠르게 재생해 70mm 로켓으로 |
| 폭발 (가까움) | EOD Explosion | freesound.org/people/qubodup/sounds/855798/ | CC0 (미군 영상) | 1.7초 | |
| 폭발 (불) | Fire Explosion | freesound.org/people/qubodup/sounds/855898/ | CC0 (미군 영상) | 1.2초 | |
| 금속 피격·파편 | Kenney Impact Sounds | kenney.nl/assets/impact-sounds | CC0 | 130개 | 3개 정도만 |
| 무전 잡음 | Radio Sign Off / Squelch | freesound.org/people/JovianSounds/sounds/524205/ | CC0 | 1.2초 | |
| 실제 M230·로켓 사격 (추출용) | DVIDS "AH-64E Aerial Gunnery" | dvidshub.net/video/851297/ | 퍼블릭 도메인 | 영상 1:02 | 영상에서 소리 추출. 다운로드에 로그인 필요 |

### 합성으로 유지

경고음, RWR 비프, 스위치 클릭, 미사일 통과음(노이즈 + 도플러 스윕), 바람(현재 합성으로 충분), 먼 전장 소리(폭발 클립을 무작위로 작게 겹쳐 만든다).

### 음성 경고

"MISSILE LAUNCH", "ENGINE FIRE", "BINGO FUEL" 같은 CC0 음성 경고 세트는 **찾지 못했다.** 브라우저 `speechSynthesis`는 거의 모든 브라우저에서 되지만 Web Audio로 보낼 수 없어 무전 필터를 못 씌우고, 운영체제마다 목소리가 다르며, iOS는 사용자 조작 후에만 말한다.
- 결정(2026-09-29): `speechSynthesis`로 먼저 구현한다. 소유자 녹음이나 상업 이용 가능한 TTS 파일이 생기면 교체한다.

### 최소 세트 용량 (모노 64kbps)

실내 루프 4초 32KB, 외부 통과 4초 32KB, 시동 15초 120KB, 기관포 16KB, 헬파이어 24KB, 로켓 16KB, 폭발 2종 24KB, 피격 3종 12KB, 무전 8KB, 음성 8줄 64KB — **합계 약 350KB**.

## 10.4 폰트

| 폰트 | URL | 라이선스 | 크기 (부분 글꼴, woff2, 실측) | 용도 |
| --- | --- | --- | --- | --- |
| **B612 Mono** | github.com/polarsys/b612 | OFL 1.1 | ASCII + ° : **12.5KB** | IHADSS·MPD·EUFD 숫자·영문. 에어버스가 조종석 화면용으로 설계 |
| **Pretendard** (예약 이름 있음 → "Karda Sans"로 이름 바꿔 배포) | github.com/orioncactus/pretendard | OFL 1.1 | 실제 쓰는 한글 약 400자: **42KB** / KS X 1001 전체 2,350자: 165KB | 메뉴·브리핑·자막 |
| Share Tech Mono | Google Fonts | OFL 1.1 | 7.4KB | B612 대안 |
| Noto Sans KR | Google Fonts | OFL 1.1 | 400자 72KB | Pretendard보다 큼 |

- **직접 호스팅**한다. Google Fonts는 한국어를 100여 조각으로 나눠 요청이 많고, 외부 장애 지점이 생긴다.
- 한글 부분 글꼴은 빌드 시 `content/strings.ko.json`과 임무 JSON에 실제 쓰인 글자로 만든다(`pyftsubset` 또는 동급 도구를 빌드 스크립트로). 문자열이 바뀌면 다시 생성.

## 10.5 하늘·파티클·지형 텍스처

| 용도 | 에셋 | URL | 라이선스 | 권장 형태·크기 |
| --- | --- | --- | --- | --- |
| 낮·해질녘 하늘 | three.js `Sky.js` (Preetham, 구름 내장) | `three/addons/objects/Sky.js` | MIT | 코드 4.5KB. 현재 하늘 셰이더 대체 |
| 밤하늘 | `Sky.js` 어둡게 + 캔버스로 그린 별 | — | — | 0KB |
| (대안) 하늘 이미지 | Poly Haven pure skies HDRI | polyhaven.com/hdris | CC0 | HDR은 1.2MB+라 부적합. 1024×512 LDR WebP로 변환 시 13KB |
| 연기·폭발 | Kenney Smoke Particles | kenney.nl/assets/smoke-particles | CC0 | 몇 프레임을 512² 아틀라스로: 약 100~150KB |
| 총구 섬광·불꽃 | Kenney Particle Pack | kenney.nl/assets/particle-pack | CC0 | 128px 2~3장: 약 20KB |
| 지면 디테일 | ambientCG Grass004, Rock030, Ground037, Snow006, Asphalt026B | ambientcg.com | CC0 | 512px 회색조, 장당 약 75KB. PNG 채널에 묶어 저장(JPG는 채널 묶음이 깨짐) |

- KTX2/Basis 압축은 **쓰지 않는다**: 트랜스코더만 약 260KB(gzip)로, 텍스처 5장 이하에선 오히려 손해.
- 지면 디테일은 `onBeforeCompile`로 경사·높이 기반 스플랫(가파르면 바위, 높으면 눈)에 두 배율로 타일링해 반복 무늬를 숨긴다.

## 10.6 3D 모델

추천 스타일 조합: **단색 저폴리** — 군용은 KolosStudios · lebedeventerprise · Prisma3dModel4(무채색이라 코드에서 색 지정), 자연·소품은 Quaternius · Kay Lousberg. 지금 코드로 만든 외형과 잘 섞인다.

### 채택 후보

| 게임 유닛 (05장 ID) | 모델 | URL | 라이선스 / 작가 | 폴리곤 / GLB |
| --- | --- | --- | --- | --- |
| `tank` | T-72 | sketchfab.com/3d-models/t-72-d71852d8757942a0a5e955215b0ee172 | CC-BY 4.0, lebedeventerprise | 977 / 58KB |
| `apc` | BTR-82A / BTR-70 | sketchfab.com/3d-models/btr-82a-cd1ba0c1f16f42aaac45234ced318605 · …/btr-70-cc40b11cb9674c7487d09e6dfb209de3 | CC-BY 4.0, lebedeventerprise | 986 / 66KB · 867 / 52KB |
| `technical` | UAZ-469 + SPG-9 | sketchfab.com/3d-models/uaz-469-spg-9-11b4eed4d22e433fbc41c2c594720860 | CC-BY 4.0, lebedeventerprise | 997 / 63KB |
| `truck`, `fuel_truck` | 군용 트럭 / 유조차 | sketchfab …9fd961a22cb84b9383570869b2f0efa9 · …ea3594f118d64282b759000e66b5695d | CC-BY 4.0, KolosStudios | 696 / 44KB · 780 / 49KB |
| `sam_short` (`spaag` 대용) | Pantsir-S1 | sketchfab …71b61fbf911f416b824db83ce0f0f4f3 | CC-BY 4.0, Prisma3dModel4 | 7,162 / 204KB (무채색) |
| `c_apc`, `c_tank`, 아군 차량 | BMD-4, T-90M, Humvee | sketchfab (Prisma3dModel4 …ac9142ff… · …c858e6ac… · …7f4e0905…) | CC-BY 4.0, Prisma3dModel4 | 1.3~2.4k / 47~78KB (무채색 → 아군 색으로) |
| `civ_car` | 승용차 | poly.pizza/m/BG0KAhmGDt · /m/vTTTjDoxhV | CC0, Kay Lousberg | 약 1.2k / 80KB |
| `civ_bus` | 버스 | poly.pizza/m/4CPpvEmrMoF | CC-BY 3.0, Poly by Google | 2,226 / 44KB |
| `inf` 계열 | Soldier | poly.pizza/m/p0wFrzSVLS | CC-BY 3.0, KolosStudios | 1,077 / 131KB |
| 나무·바위 | Quaternius Ultimate Nature | poly.pizza/m/oYtDty0fR6 등 | CC0 | 소나무 97KB, 바위 5~30KB (텍스처 입힌 버전은 2MB라 제외) |
| 모래주머니·막사 | Quaternius | poly.pizza/m/iHyRewQQcN · /m/LW3jwpPfiN · /m/lnyADheSvA | CC0 | 65 / 128 / 221KB |
| 상자·드럼통 (FARP) | Quaternius | poly.pizza/m/3OEFd1AWfa · /m/Eko3cjAMW9 · /m/eS1OXGo51c | CC0 | 34~44KB |
| 텐트·검문소 | KolosStudios | sketchfab …64ae1a56… · …839aec48… | CC-BY 4.0 | 151 / 91KB |
| 헬리패드 | Landing pad | poly.pizza/m/QpDGgpHcH2 | CC0, Kay Lousberg | 51KB |
| (선택) 윙맨 아파치 | AH-64 Apache Attack Helicopter Low Poly | sketchfab.com/3d-models/ah-64-apache-attack-helicopter-low-poly-34986214decd4b3db90e91f12e624d78 | CC-BY 4.0, TheOminousDuck | 3,880 / 328KB (사막 위장 텍스처 1장) |
| (선택) `heli_attack` | Mi-24 Hind | sketchfab.com/3d-models/mi-24-hind-004d68143e1a4df88e136dbc0a05f181 | CC-BY 4.0, duanesmind | 4,237 / 4.4MB → 텍스처 재압축 시 약 0.5MB |

- lebedeventerprise 세트는 작가가 WebGL 게임용으로 "1,000폴리곤 이하, 64×64 공용 텍스처 1장" 규칙으로 만든 것이라 기술적으로 가장 잘 맞는다.
- 차량 모델은 실존 장비 형상이다. 01장 원칙(가상 명칭)에 따라 **게임 안 이름은 가상 명칭을 쓰고**, 표식·국기는 넣지 않는다.

### 쓰면 안 되는 것 (조사 중 발견)
- 42manako의 AH-64A/D, Mi-24P, 기관총 차량: 비상업(NC)이거나 "Wargame: Red Dragon에서 추출", 배틀필드 리텍스처.
- thomas333 / chasewebb의 아파치(같은 메시, "내 것 아님, 재업로드"), zhaoguang.w("다른 사이트에서 받음").
- ZSU-23-4류: 라이선스 깨끗한 모델이 없다 → Pantsir로 대체하거나 코드 모델.
- Quaternius Toon Shooter(치비), Kenney 차량(장난감 색감), Zsky 군용차(원색): 스타일 불일치.
- Poly Haven 모델: CC0이지만 사진 실사·초고폴리(바위 12만~200만 폴리곤).

### 없는 것 → 코드 모델 유지
아파치 조종석, 자기 기체 아파치(조종석과 일치 필요), 벙커, 연료 블래더, ZSU-23-4류 대공포.

### 실제 채택 현황 (M1 완료 시점)

Sketchfab 모델은 무료·CC-BY여도 **계정 API 토큰 없이는 받을 수 없어**(#65, 소유자 결정 대기) Poly Pizza에서 같은 스타일의 대체 모델을 골랐다. `public/assets/CREDITS.md`가 최종 목록이다.

| 게임 유닛 | 사용 중인 모델 | 라이선스 | 비고 |
| --- | --- | --- | --- |
| `tank`, `c_tank` | Tank — KolosStudios (poly.pizza/m/egcLMSGiuA) | CC-BY 3.0 | T-72 대신 |
| `apc`, `c_apc` | Tank — Quaternius (poly.pizza/m/FA5daiyZQq) | CC0 | BTR 대신, 애니메이션·스킨 제거 |
| `truck`, `c_truck` | Truckk — KolosStudios (poly.pizza/m/jHwRymyg2C) | CC-BY 3.0 | |
| `fuel_truck` | Truck Tank — KolosStudios (poly.pizza/m/64ayx6pW3O) | CC-BY 3.0 | |
| `technical` | Pickup Truck — Quaternius (poly.pizza/m/qn4grQgHm8) | CC0 | UAZ 대신 |
| `inf` 계열 | Soldier — KolosStudios (poly.pizza/m/XT8jgwSesV) | CC-BY 3.0 | 애니메이션·스킨 제거 |
| `civ_car` | SUV — Quaternius (poly.pizza/m/xsMtZhBkxL) | CC0 | |
| `spaag`·`sam_short`·`sam_radar`·`aaa_light` | 코드 모델(`src/render/airDefenseModels.ts`, M3-7) | — | Pantsir-S1(Sketchfab)은 #65 결정 후 교체 검토 |
| 그 외(벙커·탄약고·지휘소·헬기) | 코드 모델 | — | Sketchfab 결정 후 교체 검토 |

사운드는 Freesound 원본 다운로드가 로그인이 필요해 **공개 HQ 미리듣기(mp3)** 를 원본으로 썼다(CC0는 형식과 무관하게 적용). 채택: 헬기 실내 루프(craigsmith), H135 시동(Borgory), 기관포 단발·폭발 2종(qubodup), Kenney 충격음 2종. 헬파이어·로켓 발사음, 무전 잡음은 해당 작업(M2·M3)에서 추가한다.

## 10.7 실제 지형 데이터 (보류)

| 출처 | 라이선스 | 비고 |
| --- | --- | --- |
| Terrarium 타일 (AWS) | ETOPO1·GMTED2010·SRTM 기반, 재배포 시 출처 표기 필수, "항해용 아님" | 12km = z13 타일 4×4, 1m 단위 16비트 PNG로 맵당 약 250KB |
| Copernicus DEM GLO-30 | 무료, 고지 문구 필수 | 일부 국가 누락 |

원본 해상도가 약 30m라 12.5m 격자는 보간일 뿐이고, 가상 전장 설정과 절차 생성 방침에 비해 이점이 작다. 산세가 더 사실적이어야 한다는 요구가 생기면 다시 검토한다.

## 10.8 운영 규칙 (채택됨)

08장 8.1절과 `CLAUDE.md`가 이 규칙을 따른다.

1. 에셋은 `public/assets/<분류>/`에 두고(빌드 산출 JS·CSS는 `dist/static/`으로 분리되어 섞이지 않는다), **`public/assets/CREDITS.md`** 에 모든 파일의 제목·작가·원본 URL·라이선스·수정 여부를 적는다. 게임 설정 화면에 "크레딧" 항목을 두고 이 내용을 보여 준다(CC-BY는 법적 의무, CC0도 예의상 기재).
2. DVIDS(미 국방 영상) 자료를 쓰면 크레딧에 "The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement." 문구를 넣고, 미군 로고·휘장은 쓰지 않는다.
3. 추가 전에 **상세 페이지에서 라이선스를 다시 확인**하고, 확인한 날짜를 CREDITS에 적는다.
   - OFL 글꼴은 LICENSE에서 **예약 글꼴 이름(Reserved Font Name)** 을 확인한다. 예약 이름이 있으면 서브셋(=수정본)은 그 이름을 쓸 수 없으므로 `scripts/subset-font.mjs --rename`으로 이름을 바꾸고, 원래 저작권 고지(name ID 0)는 유지한다. 예: Pretendard → "Karda Sans" (#64).
4. 용량 예산: 첫 로드 에셋 합계 ≤ 600KB, 임무 하나의 지연 로드 에셋 ≤ 1MB. GLB는 `gltf-transform`으로 메시 압축(meshopt)·텍스처 축소 후 넣는다. 원본(고용량) 파일은 저장소에 넣지 않는다.
5. 모델은 로드 후 **공용 머티리얼로 교체**(색은 `units.json`에서 지정)해 스타일을 통일하고 드로우콜을 줄인다. 유형별 `InstancedMesh` 규칙(08장 8.6절)은 그대로.
6. 에셋이 로드되지 않아도 게임은 동작해야 한다: 모델은 코드 도형 대체품, 소리는 합성음 대체품으로 폴백.
