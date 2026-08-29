# StageBuilder v4 → PIVOT 배포

PIVOT([pivot.mhsoft.co.kr](https://pivot.mhsoft.co.kr/index.html)) 서버 **`server.js`는 수정하지 않고**, v4 **에디터 폴더만** 교체하는 방법입니다.

## 로컬 개발 (PIVOT 연결 금지)

```bash
node server/server.js
# → http://localhost:3000/stageBuilder/index.html
```

**Three.js:** v3/PIVOT과 동일한 `../build/three.module.js` (CDN 사용 안 함)

처음 한 번 — `runtime` junction (PIVOT stageBuilder 폴더):

```powershell
New-Item -ItemType Junction -Path "runtime" -Target "E:\SynologyDrive\pivot\nginx\html\stageBuilder" -Force
```

서버가 `/build`, `/examples`를 제공합니다. **코드 변경 후 서버 재시작** + 브라우저 **Ctrl+F5**.

확인:
- http://localhost:3000/build/three.module.js → 200
- http://localhost:3000/files/stage/background.fbx → 200
- 상태줄 `Stage shell OK`

## 디렉터리 (PIVOT)

```
html/stageBuilder/
  editor/          ← v4 `StageBuilder_v4/editor/` 내용 업로드
  build/           ← Three.js (기존 v3 유지, 건드리지 않음)
  examples/jsm/    ← Three addons (기존 v3 유지)
  files/
    stage/         ← 프로시니엄/아레나 건물 FBX (에디터 업로드와 별도)
    fbx/           ← Characters FBX (Assets API)
    music/         ← Audio
    video/         ← Video
```

## Phase 6 — 프로젝트·씬 (로컬 완료 후 pivot 배포)

로컬 `server/projectsRoutes.js`를 pivot에도 붙입니다 (**editor만으로는 Phase 6 API 동작 안 함**).

### pivot server.js 에 추가

`StageBuilder_v4/server/projectsRoutes.js` 와 동일 파일을 pivot에서 require:

```javascript
const { mountProjectRoutes } = require('E:/SynologyDrive/StageBuilder_v2_new/StageBuilder_v4/server/projectsRoutes');
// 또는 pivot/nginx/server.js 옆에 projectsRoutes.js 복사 후:
// const { mountProjectRoutes } = require('./projectsRoutes');

mountProjectRoutes(app, {
  requireAuth,
  filesRoot: STAGEBUILDER_FILES_ROOT,
  ensureDir,          // pivot에 이미 있는 헬퍼 재사용
  getUniqueFileName,
  safeListFiles,
  safeDeleteFile,
  buildUploadResponse,
  MEDIA_EXTS,
  multer,
  createFileFilter,
});
```

`STAGEBUILDER_FILES_ROOT` 아래 **`projects/`** 폴더 생성 후 Node **재시작**.

### 프로젝트 폴더 (서버)

```
files/projects/{projectId}/
  project.json
  manifest.json
  scenes/scene_01.json
  assets/characters|props|audio|video/
```

일상 저장은 이 폴더에 JSON + 프로젝트별 에셋. 전역 `files/music/` · `fbx/` 는 **레거시** (Phase 6 에디터는 프로젝트 Assets 사용).

## 업로드 범위

| 대상 | 경로 | 서버 API |
|------|------|----------|
| **에디터 UI/코드** | `html/stageBuilder/editor/` | 없음 (정적) |
| **무대 건물 FBX** | `html/stageBuilder/files/stage/` | 없음 (정적 `/files/stage/`) |
| **Characters / Audio / Video** | `files/fbx`, `music`, `video` | `/api/upload-*`, `/api/*-files` |

v4는 v3와 동일하게 무대 껍데기를 **`../files/stage/background.fbx`** (상대 경로)로 로드합니다.  
Assets 업로드 API와 **분리**되어 있습니다.

## 배포 절차

1. `StageBuilder_v4/editor/` 전체를 `html/stageBuilder/editor/`에 **덮어쓰기**
2. `files/stage/`에 `background.fbx`, `arena_stage.fbx` 있는지 확인 (v3와 동일)
3. `build/`, `examples/`는 **그대로** 두기
4. PIVOT 로그인 후 `/stageBuilder/index.html` 접속

## 로컬 vs PIVOT

| 항목 | localhost (v4 dev) | PIVOT |
|------|----------------------|--------|
| Three.js | CDN (importmap) | `../build/three.module.js` |
| 무대 FBX | `../files/stage/` (v4 server) | `../files/stage/` |
| Assets API | v4 `server/server.js` | `pivot/nginx/server.js` (fbx + **prop-files**) |
| Stage API | v4 `/api/prop-files` | PIVOT **동일** (`files/props/`) |

## Stage (PIVOT)

PIVOT `server.js`에 v4와 동일한 API가 있습니다.

- **Characters**: `/api/fbx-files` → `files/characters/` (+ legacy `files/fbx/` 목록 병합)
- **Stage**: `/api/prop-files` → `files/props/` (FBX·OBJ)
- **기본** 직육면체·원통: 서버 불필요 (브라우저 procedural)

`server.js` 배포 후 Node 프로세스 **재시작** 필요.

## 상태줄

- `Assets API OK` — 업로드/목록 API 연결됨
- `Assets API unavailable` — 무대 편집은 가능, Assets 업로드/목록만 불가
- `Stage shell OK` — `background.fbx` 로드 성공
- `Stage shell missing` — `files/stage/*.fbx` 확인

## 튜토리얼

에디터 배포 시 `editor/tutorial/` 포함 → `/stageBuilder/tutorial/`
