# StageBuilder v4

로컬 개발 서버 + ES module 에디터. pivot nginx `server.js` 라우트와 호환됩니다.

## Phase 0 — 로컬 실행

### 1. 서버 설치·기동

```powershell
cd server
npm install
npm run dev
```

- 에디터: http://localhost:3000/stageBuilder/index.html
- Health: http://localhost:3000/api/health → `{ "status": "ok" }`
- 로컬 개발 시 JWT 인증은 자동 생략됩니다 (`DEV_SKIP_AUTH` 기본 on)

### 2. 미디어 파일 (FBX / 음원)

기본 경로: `server/files/`

```
server/files/
  music/    ← .mp3, .wav, …
  fbx/      ← .fbx
  video/    ← .mp4, …
  projects/ ← Phase 6 프로젝트 폴더
```

**v3 에셋 공유 (선택):** v3의 `files/` 폴더를 그대로 쓰려면 junction/symlink를 만듭니다.

```powershell
# v3 files 경로
$v3Root = "E:\SynologyDrive\StageBuilder_v2_new\StageBuilder_v3\files"

# 무대 FBX (필수 — 프로시니엄/아레나 건물 셸)
New-Item -ItemType Junction -Path "server\files\stage" -Target "$v3Root\stage" -Force

# 전체 files 공유 (선택)
Remove-Item "server\files" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Junction -Path "server\files" -Target $v3Root
```

무대 FBX: `files/stage/background.fbx` (프로시니엄), `files/stage/arena_stage.fbx` (아레나)

### 3. API 주소 변경

에디터는 **`editor/js/config/app-config.js`** 한 곳만 수정하면 됩니다.

```javascript
const LOCAL_DEV_DEFAULT = 'http://localhost:3000';
```

배포 시에는 `window.__STAGEBUILDER_API__` 또는 `window.location.origin`을 사용합니다.

### 4. Phase 0 완료 기준

- [ ] `npm run dev` 후 `/api/health` OK
- [ ] 에디터 페이지 WebGL 뷰포트 표시
- [ ] 상태바에 FBX/Audio 목록 개수 표시
- [ ] (선택) v3 `files/` junction 후 목록에 파일 표시

---

로드맵: [docs/02_v4_마스터_로드맵.md](docs/02_v4_마스터_로드맵.md)
