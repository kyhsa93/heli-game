# 외부 에셋 출처

이 폴더의 모든 파일은 아래 표에 기재한다. 채택 기준과 규칙은 `docs/design/10-external-assets.md` 10.8절.
허용 라이선스: CC0, Public Domain, CC-BY-3.0, CC-BY-4.0, OFL-1.1, MIT, Apache-2.0, ISC.

| 파일 | 제목 | 작가 | 원본 URL | 라이선스 | 수정 | 확인 날짜 |
| --- | --- | --- | --- | --- | --- | --- |
| fonts/b612-mono.woff2 | B612 Mono (Regular) | The B612 Project Authors (Airbus / PolarSys) | https://github.com/polarsys/b612 | OFL-1.1 | ASCII + 계기 기호만 남긴 서브셋, woff2 변환 (예약 이름 없음) | 2026-09-29 |
| fonts/karda-sans-regular.woff2 | Pretendard (Regular) → "Karda Sans" | Kil Hyung-jin (orioncactus), Adobe, The Inter Project Authors 외 | https://github.com/orioncactus/pretendard | OFL-1.1 | 게임 문자열에 쓰인 글자만 남긴 서브셋. OFL 예약 이름 'Pretendard' 규정에 따라 "Karda Sans"로 이름 변경 | 2026-09-29 |
| fonts/karda-sans-bold.woff2 | Pretendard (Bold) → "Karda Sans" | Kil Hyung-jin (orioncactus), Adobe, The Inter Project Authors 외 | https://github.com/orioncactus/pretendard | OFL-1.1 | 게임 문자열에 쓰인 글자만 남긴 서브셋. OFL 예약 이름 'Pretendard' 규정에 따라 "Karda Sans"로 이름 변경 | 2026-09-29 |
| textures/particles.png | Smoke Particles + Particle Pack (합성 아틀라스) | Kenney (kenney.nl) | https://kenney.nl/assets/smoke-particles , https://kenney.nl/assets/particle-pack | CC0 | explosion·blackSmoke·whitePuff·flash(Smoke Particles)와 muzzle·spark·fire(Particle Pack) 16장을 512² 4×4 아틀라스로 합치고 256색 양자화 | 2026-09-29 |
| models/tank.glb | Tank | KolosStudios | https://poly.pizza/m/egcLMSGiuA | CC-BY-3.0 | meshopt 압축·텍스처 축소. 게임에서 가상 명칭으로 사용 | 2026-09-29 |
| models/truck.glb | Truckk | KolosStudios | https://poly.pizza/m/jHwRymyg2C | CC-BY-3.0 | meshopt 압축·텍스처 축소. 게임에서 가상 명칭으로 사용 | 2026-09-29 |
| models/fuel_truck.glb | Truck Tank | KolosStudios | https://poly.pizza/m/64ayx6pW3O | CC-BY-3.0 | meshopt 압축·텍스처 축소. 게임에서 가상 명칭으로 사용 | 2026-09-29 |
| models/soldier.glb | Soldier | KolosStudios | https://poly.pizza/m/XT8jgwSesV | CC-BY-3.0 | meshopt 압축·텍스처 축소, 애니메이션·스킨 제거, 폴리곤 30%로 감소. 게임에서 가상 명칭으로 사용 | 2026-09-29 |
| models/apc.glb | Tank | Quaternius | https://poly.pizza/m/FA5daiyZQq | CC0 | meshopt 압축·텍스처 축소, 애니메이션·스킨 제거, 폴리곤 30%로 감소. 게임에서 가상 명칭으로 사용 | 2026-09-29 |
| models/technical.glb | Pickup Truck | Quaternius | https://poly.pizza/m/qn4grQgHm8 | CC0 | meshopt 압축·텍스처 축소, 폴리곤 40%로 감소. 게임에서 가상 명칭으로 사용 | 2026-09-29 |
| models/civ_car.glb | SUV | Quaternius | https://poly.pizza/m/xsMtZhBkxL | CC0 | meshopt 압축·텍스처 축소, 폴리곤 40%로 감소. 게임에서 가상 명칭으로 사용 | 2026-09-29 |
| audio/rotor_interior_loop.mp3 | G36-10-Helicopter Constant Interior | craigsmith | https://freesound.org/people/craigsmith/sounds/438593/ | CC0 | 7–11초 구간 4초를 잘라 0.25초 크로스페이드로 이음새 없는 루프 제작, 모노 96kbps | 2026-09-29 |
| audio/engine_start.mp3 | Helicopter Start Airbus Helicopters H135 | Borgory | https://freesound.org/people/Borgory/sounds/522672/ | CC0 | 10–22초(터빈 점화·가속) 12초 구간, 페이드, 모노 64kbps | 2026-09-29 |
| audio/gun_shot.mp3 | Autocannon Three Shot Burst | qubodup | https://freesound.org/people/qubodup/sounds/854186/ | CC0 | 첫 발(0.02–0.26초)만 잘라 단발로 사용, 모노 64kbps | 2026-09-29 |
| audio/rocket_launch.mp3 | M142 HIMARS Rocket Launch 8 | qubodup | https://freesound.org/people/qubodup/sounds/854476/ | CC0 | 첫 1초만 잘라 0.45초 페이드아웃, 게임에서 1.25배 빠르게 재생해 70mm 로켓으로 사용, 모노 64kbps | 2026-09-29 |
| audio/explosion_near.mp3 | EOD Explosion | qubodup | https://freesound.org/people/qubodup/sounds/855798/ | CC0 | 정규화·페이드, 모노 64kbps | 2026-09-29 |
| audio/explosion_fire.mp3 | Fire Explosion | qubodup | https://freesound.org/people/qubodup/sounds/855898/ | CC0 | 정규화·페이드, 모노 64kbps | 2026-09-29 |
| audio/impact_metal.mp3 | Impact Sounds — impactMetal_medium_000 | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 | 정규화, 모노 48kbps | 2026-09-29 |
| audio/impact_ground.mp3 | Impact Sounds — impactSoft_heavy_000 | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 | 정규화, 모노 48kbps | 2026-09-29 |
