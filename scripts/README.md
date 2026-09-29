# 에셋 가공 스크립트

외부 에셋은 원본을 저장소에 넣지 않고, 이 스크립트로 가공한 결과만 `public/assets/`에 넣는다(`docs/design/10-external-assets.md` 10.8절). 스크립트는 빌드에 포함되지 않는다.

| 스크립트 | 용도 | 필요한 도구 |
| --- | --- | --- |
| `node scripts/encode-audio.mjs in.wav out.mp3 --kbps 64 [--start 3 --duration 4 --fade 0.02]` | 모노 MP3로 인코딩·자르기 | 시스템 `ffmpeg`, 없으면 `ffmpeg-static@5.3.0`을 `scripts/.tools`에 자동 설치 |
| `node scripts/process-glb.mjs in.glb out.glb --texture-size 256 [--simplify 0.3] [--static]` | meshopt 압축, 텍스처 WebP·축소, 선택적 폴리곤 감소(비율), `--static`은 애니메이션·스킨 제거(정지 인스턴스용) | `@gltf-transform/cli@4.5.1`을 `scripts/.tools`에 자동 설치 |
| `node scripts/subset-font.mjs in.ttf out.woff2 --strings` | 실제 쓰는 글자(`src/content/**/*.json` + ASCII)만 남긴 woff2 | `pyftsubset` (`pip install --user fonttools brotli`) |
| `node scripts/subset-font.mjs in.ttf out.woff2 --ascii --extra "°"` | 영문·숫자 계기 글꼴 | 위와 같음 |

가공한 파일을 넣으면 `public/assets/CREDITS.md`에 한 줄 추가하고 `src/assets/manifest.ts`에 등록한다. `npm test`가 출처 누락·라이선스·확인 날짜·첫 로드 용량(600KB)을 검사한다.

문자열이 바뀌면 한글 폰트 서브셋을 다시 만든다.
