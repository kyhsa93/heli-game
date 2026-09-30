# 외부 에셋 출처

이 폴더의 모든 파일은 아래 표에 기재한다. 채택 기준과 규칙은 `docs/design/10-external-assets.md` 10.8절.
허용 라이선스: CC0, Public Domain, CC-BY-3.0, CC-BY-4.0, OFL-1.1, MIT, Apache-2.0, ISC.

| 파일 | 제목 | 작가 | 원본 URL | 라이선스 | 수정 | 확인 날짜 |
| --- | --- | --- | --- | --- | --- | --- |
| fonts/b612-mono.woff2 | B612 Mono (Regular) | The B612 Project Authors (Airbus / PolarSys) | https://github.com/polarsys/b612 | OFL-1.1 | ASCII + 계기 기호만 남긴 서브셋, woff2 변환 (예약 이름 없음) | 2026-09-29 |
| fonts/karda-sans-regular.woff2 | Pretendard (Regular) → "Karda Sans" | Kil Hyung-jin (orioncactus), Adobe, The Inter Project Authors 외 | https://github.com/orioncactus/pretendard | OFL-1.1 | 게임 문자열에 쓰인 글자만 남긴 서브셋. OFL 예약 이름 'Pretendard' 규정에 따라 "Karda Sans"로 이름 변경 | 2026-09-29 |
| fonts/karda-sans-bold.woff2 | Pretendard (Bold) → "Karda Sans" | Kil Hyung-jin (orioncactus), Adobe, The Inter Project Authors 외 | https://github.com/orioncactus/pretendard | OFL-1.1 | 게임 문자열에 쓰인 글자만 남긴 서브셋. OFL 예약 이름 'Pretendard' 규정에 따라 "Karda Sans"로 이름 변경 | 2026-09-29 |
| textures/particles.png | Smoke Particles + Particle Pack (합성 아틀라스) | Kenney (kenney.nl) | https://kenney.nl/assets/smoke-particles , https://kenney.nl/assets/particle-pack | CC0 | explosion·blackSmoke·whitePuff·flash(Smoke Particles)와 muzzle·spark·fire(Particle Pack) 16장을 512² 4×4 아틀라스로 합치고 256색 양자화 | 2026-09-29 |
| textures/ground_detail.png | Grass 004 · Rock 030 · Ground 037 · Snow 006 (채널 묶음) | ambientCG (Lennart Demes) | https://ambientcg.com/view?id=Grass004 , https://ambientcg.com/view?id=Rock030 , https://ambientcg.com/view?id=Ground037 , https://ambientcg.com/view?id=Snow006 | CC0 | 1K Color를 회색조로 바꿔 256²로 줄이고 대비 정규화·32단계 양자화, R=풀·G=바위·B=흙·A=눈 채널로 묶은 PNG | 2026-09-29 |
| models/tank.glb | Tank | KolosStudios | https://poly.pizza/m/egcLMSGiuA | CC-BY-3.0 | meshopt 압축·텍스처 축소. 게임에서 가상 명칭으로 사용 | 2026-09-29 |
| models/truck.glb | Truckk | KolosStudios | https://poly.pizza/m/jHwRymyg2C | CC-BY-3.0 | meshopt 압축·텍스처 축소. 게임에서 가상 명칭으로 사용 | 2026-09-29 |
| models/fuel_truck.glb | Truck Tank | KolosStudios | https://poly.pizza/m/64ayx6pW3O | CC-BY-3.0 | meshopt 압축·텍스처 축소. 게임에서 가상 명칭으로 사용 | 2026-09-29 |
| models/soldier.glb | Soldier | KolosStudios | https://poly.pizza/m/XT8jgwSesV | CC-BY-3.0 | meshopt 압축·텍스처 축소, 애니메이션·스킨 제거, 폴리곤 30%로 감소. 게임에서 가상 명칭으로 사용 | 2026-09-29 |
| models/apc.glb | Tank | Quaternius | https://poly.pizza/m/FA5daiyZQq | CC0 | meshopt 압축·텍스처 축소, 애니메이션·스킨 제거, 폴리곤 30%로 감소. 게임에서 가상 명칭으로 사용 | 2026-09-29 |
| models/technical.glb | Pickup Truck | Quaternius | https://poly.pizza/m/qn4grQgHm8 | CC0 | meshopt 압축·텍스처 축소, 폴리곤 40%로 감소. 게임에서 가상 명칭으로 사용 | 2026-09-29 |
| models/civ_car.glb | SUV | Quaternius | https://poly.pizza/m/xsMtZhBkxL | CC0 | meshopt 압축·텍스처 축소, 폴리곤 40%로 감소. 게임에서 가상 명칭으로 사용 | 2026-09-29 |
| models/prop_crate.glb | Crate | Quaternius | https://poly.pizza/m/3OEFd1AWfa | CC0 | meshopt 압축·텍스처 128px, 정지 모델. FARP 소품 | 2026-09-29 |
| models/prop_barrel.glb | Barrel | Quaternius | https://poly.pizza/m/Eko3cjAMW9 | CC0 | meshopt 압축·텍스처 128px, 정지 모델. FARP 소품 | 2026-09-29 |
| models/prop_gas_can.glb | Gas Can | Quaternius | https://poly.pizza/m/eS1OXGo51c | CC0 | meshopt 압축·텍스처 128px, 정지 모델. FARP 소품 | 2026-09-29 |
| models/prop_barracks.glb | Barracks | Quaternius | https://poly.pizza/m/lnyADheSvA | CC0 | meshopt 압축·텍스처 128px, 정지 모델. FARP 소품 (텐트 대신 막사) | 2026-09-29 |
| models/prop_sandbags.glb | Sack Trench | Quaternius | https://poly.pizza/m/LW3jwpPfiN | CC0 | meshopt 압축·텍스처 128px, 정지 모델. FARP 소품 | 2026-09-29 |
| audio/rotor_interior_loop.mp3 | G36-10-Helicopter Constant Interior | craigsmith | https://freesound.org/people/craigsmith/sounds/438593/ | CC0 | 7–11초 구간 4초를 잘라 0.25초 크로스페이드로 이음새 없는 루프 제작, 모노 96kbps | 2026-09-29 |
| audio/engine_start.mp3 | Helicopter Start Airbus Helicopters H135 | Borgory | https://freesound.org/people/Borgory/sounds/522672/ | CC0 | 10–22초(터빈 점화·가속) 12초 구간, 페이드, 모노 64kbps | 2026-09-29 |
| audio/gun_shot.mp3 | Autocannon Three Shot Burst | qubodup | https://freesound.org/people/qubodup/sounds/854186/ | CC0 | 첫 발(0.02–0.26초)만 잘라 단발로 사용, 모노 64kbps | 2026-09-29 |
| audio/rocket_launch.mp3 | M142 HIMARS Rocket Launch 8 | qubodup | https://freesound.org/people/qubodup/sounds/854476/ | CC0 | 첫 1초만 잘라 0.45초 페이드아웃, 게임에서 1.25배 빠르게 재생해 70mm 로켓으로 사용, 모노 64kbps | 2026-09-29 |
| audio/hellfire_launch.mp3 | AGM-114 Hellfire Rocket Missile Launch | qubodup | https://freesound.org/people/qubodup/sounds/162368/ | CC0 | 첫 2.3초, 0.5초 페이드아웃, 모노 64kbps | 2026-09-29 |
| audio/explosion_near.mp3 | EOD Explosion | qubodup | https://freesound.org/people/qubodup/sounds/855798/ | CC0 | 정규화·페이드, 모노 64kbps | 2026-09-29 |
| audio/explosion_fire.mp3 | Fire Explosion | qubodup | https://freesound.org/people/qubodup/sounds/855898/ | CC0 | 정규화·페이드, 모노 64kbps | 2026-09-29 |
| audio/hit_metal_0.mp3 | Impact Sounds — impactMetal_heavy_000 | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 | 모노 48kbps (기체 피격음) | 2026-09-29 |
| audio/hit_metal_1.mp3 | Impact Sounds — impactMetal_heavy_001 | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 | 모노 48kbps (기체 피격음) | 2026-09-29 |
| audio/hit_metal_2.mp3 | Impact Sounds — impactMetal_heavy_002 | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 | 모노 48kbps (기체 피격음) | 2026-09-29 |
| audio/radio_squelch.mp3 | Radio Sign Off / Squelch | JovianSounds | https://freesound.org/people/JovianSounds/sounds/524205/ | CC0 | 공개 HQ 미리듣기에서 모노 48kbps, 끝 0.1초 페이드 | 2026-09-29 |
| audio/impact_metal.mp3 | Impact Sounds — impactMetal_medium_000 | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 | 정규화, 모노 48kbps | 2026-09-29 |
| audio/impact_ground.mp3 | Impact Sounds — impactSoft_heavy_000 | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 | 정규화, 모노 48kbps | 2026-09-29 |
| audio/rifle_shot.mp3 | AR15 rifle shot | michorvath | https://freesound.org/people/michorvath/sounds/427596/ | CC0 | 공개 미리듣기에서 0.06–0.91초 구간, 0.4초 페이드아웃, 모노 64kbps. 플레이어 돌격소총 | 2026-09-30 |
| audio/rifle_enemy.mp3 | AK47 Shot | LeMudCrab | https://freesound.org/people/LeMudCrab/sounds/163457/ | CC0 | 공개 미리듣기 전체(0.6초), 0.2초 페이드아웃, 모노 64kbps. 봇 소총 | 2026-09-30 |
| audio/mg_shot.mp3 | Clean Machine Gun Burst | qubodup | https://freesound.org/people/qubodup/sounds/482122/ | CC0 | 공개 미리듣기에서 첫 발 0.12초만 잘라 단발로 반복 재생, 모노 64kbps. 봇 기관총 | 2026-09-30 |
| audio/sniper_shot.mp3 | Sniper Shot in Field 2 (M2010 Enhanced Sniper Rifle ESR) | qubodup | https://freesound.org/people/qubodup/sounds/855607/ | CC0 | 공개 미리듣기 첫 1.2초, 0.5초 페이드아웃, 모노 64kbps. 봇 저격조 | 2026-09-30 |
| audio/grenade_launch.mp3 | Grenade Launcher | LeMudCrab | https://freesound.org/people/LeMudCrab/sounds/163458/ | CC0 | 공개 미리듣기 전체(0.44초), 0.1초 페이드아웃, 모노 64kbps | 2026-09-30 |
| audio/reload.mp3 | Assault Rifle Reload | qubodup | https://freesound.org/people/qubodup/sounds/815879/ | CC0 | 공개 미리듣기 첫 1.2초, 모노 64kbps | 2026-09-30 |
| audio/hit_marker.mp3 | Hitmarker Sound Effect | User391915396 | https://freesound.org/people/User391915396/sounds/570335/ | CC0 | 공개 미리듣기 전체(0.19초), 모노 64kbps | 2026-09-30 |
| audio/footstep_0.mp3 | Impact Sounds — footstep_grass_000 | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 | 첫 0.3초, 0.1초 페이드아웃, OGG → 모노 64kbps MP3 | 2026-09-30 |
| audio/footstep_1.mp3 | Impact Sounds — footstep_grass_002 | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 | 첫 0.3초, 0.1초 페이드아웃, OGG → 모노 64kbps MP3 | 2026-09-30 |
| audio/impact_body.mp3 | Impact Sounds — impactPunch_heavy_002 | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 | 0.1초 페이드아웃, OGG → 모노 64kbps MP3. 플레이어 보병 피격 | 2026-09-30 |
