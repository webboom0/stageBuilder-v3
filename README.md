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
- 사용 안내: http://localhost:3000/stageBuilder/tutorial/
- Health: http://localhost:3000/api/health → `{ "status": "ok" }`
- 로컬 개발 시 JWT 인증은 자동 생략됩니다 (`DEV_SKIP_AUTH` 기본 on)

### 2. Three.js runtime (v3/PIVOT과 동일 r172)

```powershell
# 프로젝트 루트에서 — pivot stageBuilder를 runtime으로 연결
New-Item -ItemType Junction -Path "runtime" -Target "E:\SynologyDrive\pivot\nginx\html\stageBuilder" -Force
```

서버가 `/build`, `/examples`를 제공합니다. CDN Three.js는 **사용하지 않습니다**.

### 3. 미디어 파일 (FBX / 음원)

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

### 4. API 주소

로컬(`localhost`)에서는 **항상 `http://localhost:3000`** — PIVOT 프로덕션(`pivot.mhsoft.co.kr`)으로 연결하지 않습니다.

설정: `editor/js/config/app-config.js` (로컬에서 pivot URL override 시 **무시**)

PIVOT에 `editor/`만 배포하면 API는 **그 사이트 origin**을 자동 사용합니다. 별도 설정 불필요.

### 5. Phase 0 완료 기준

- [ ] `npm run dev` 후 `/api/health` OK
- [ ] 에디터 페이지 WebGL 뷰포트 표시
- [ ] 상태바에 FBX/Audio 목록 개수 표시
- [ ] (선택) v3 `files/` junction 후 목록에 파일 표시

---

로드맵: [docs/02_v4_마스터_로드맵.md](docs/02_v4_마스터_로드맵.md)
