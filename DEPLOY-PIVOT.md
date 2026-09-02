# StageBuilder v4 → PIVOT 배포 (전체 절차)

PIVOT([pivot.mhsoft.co.kr](https://pivot.mhsoft.co.kr/index.html))에 v4 에디터 + API를 올리는 **처음부터 끝까지** 체크리스트입니다.

로컬 준비 폴더: `E:\SynologyDrive\pivot\nginx_v4`  
(기존 `pivot\nginx`의 `node_modules`·`package.json` 복사 + v4 `server.js` 반영본)

---

## 0. 배포 전 요약

| 항목 | 내용 |
|------|------|
| SSH | `pivot.mhsoft.co.kr` 포트 **3422**, 사용자 `accf` |
| StageBuilder 디스크 | `{server.js}/html/stageBuilder/` 아래 전부 |
| 캐릭터 FBX | **`files/characters/`** (`files/fbx/` 사용 안 함) |
| server.js | v4 API 반영 필수 (에디터만으로 Phase 6·props 불가) |
| npm 추가 | **`adm-zip`**, **`extract-zip`** (Phase 6 ZIP) |
| Node 재시작 | `server.js`·`projectsRoutes.js` 배포 후 필수 |

---

## 1. SSH 접속

### PowerShell

```powershell
ssh -p 3422 accf@pivot.mhsoft.co.kr
```

### WinSCP (파일 업로드 권장)

| 설정 | 값 |
|------|-----|
| 프로토콜 | SFTP |
| 호스트 | `pivot.mhsoft.co.kr` |
| 포트 | **3422** |
| 사용자 | `accf` |

접속 후 pivot에서 `server.js`가 있는 폴더와 `html/stageBuilder/` 경로를 확인합니다.

```bash
find ~ -name "server.js" -type f 2>/dev/null | head
find ~ -name "stageBuilder" -type d 2>/dev/null | head
```

---

## 2. 로컬 준비 (`nginx_v4`)

### 2-1. 폴더 구조

```
E:\SynologyDrive\pivot\nginx_v4\
  server.js              ← v4 반영본
  projectsRoutes.js
  aiPatternRoutes.js
  package.json           ← 기존 pivot nginx와 동일
  node_modules\          ← 기존 pivot 복사 + 아래 2개 추가
  html\
    stageBuilder\
      editor\            ← StageBuilder_v4/editor/ 업로드
      build\             ← v3 Three.js (기존 pivot에서 복사)
      examples\          ← v3 Three addons (기존 pivot에서 복사)
      files\
        stage\           ← background.fbx, arena_stage.fbx
        characters\      ← 등장인물 FBX (v4 정식)
        props\             ← 무대·소품 FBX/OBJ
        music\
        video\
        projects\          ← Phase 6 (서버가 자동 생성 가능)
      manifest.json      ← 있으면 유지
```

**주의:** `editor/`와 `files/`는 **형제 폴더**. `editor` 안에 `files` 넣지 않음.

### 2-2. npm 패키지

기존 pivot에 이미 있음: `express`, `body-parser`, `cookie-parser`, `cors`, `jsonwebtoken`, `multer`, `http-proxy-middleware`

v4 Phase 6에서 **추가 필요**:

```powershell
cd E:\SynologyDrive\pivot\nginx_v4
npm install adm-zip extract-zip
```

서버에 `npm`만 있다면 pivot 폴더에서 위 2개만 추가 설치해도 됩니다.

### 2-3. 로컬에서 서버 기동 테스트 (선택)

```powershell
cd E:\SynologyDrive\pivot\nginx_v4
node server.js
```

확인:

- http://localhost:3000/api/health → `{ "status": "ok", "version": 4 }`
- http://localhost:3000/files/stage/background.fbx → 200
- http://localhost:3000/build/three.module.js → 200

---

## 3. `server.js` v4 변경 요약 (이미 `nginx_v4` 반영)

다른 pivot 앱(PB, MSS, MOL, 로그인)은 **건드리지 않음**. StageBuilder만 아래처럼 동작.

### 경로 상수

```text
STAGEBUILDER_ROOT     = html/stageBuilder
STAGEBUILDER_FILES_ROOT = html/stageBuilder/files
```

### URL 매핑

| 디스크 | URL (정식) | URL (에디터 호환) |
|--------|-----------|------------------|
| `editor/` | `/stageBuilder/` | — |
| `files/` | `/stageBuilder/files/` | `/files/` |
| `build/` | `/stageBuilder/build/` | `/build/` |
| `examples/` | `/stageBuilder/examples/` | `/examples/` |

에디터 importmap `../build/three.module.js` → `/build/` alias 유지.

### API (StageBuilder)

| API | 저장/조회 폴더 |
|-----|----------------|
| `/api/fbx-files`, `/api/upload-fbx` | `files/characters/` (API 이름만 legacy) |
| `/api/prop-files`, `/api/upload-prop` | `files/props/` |
| `/api/audio-files` | `files/music/` |
| `/api/video-files` | `files/video/` |
| `/api/projects/*` | `files/projects/{id}/` |
| `/api/ai/*` | LLM 선택 (`OPENAI_API_KEY`) |

**`files/fbx/` 폴더는 v4에서 제거.** 기존 FBX는 `characters/`로 옮긴 뒤 `fbx/` 삭제.

---

## 4. 파일 준비 (업로드 목록)

### 4-1. StageBuilder_v4 repo에서

| 소스 | 대상 (nginx_v4) |
|------|-----------------|
| `StageBuilder_v4/editor/` 전체 | `html/stageBuilder/editor/` |
| `StageBuilder_v4/server/server.js` 동기 | `server.js` (또는 nginx_v4 수정본) |
| `StageBuilder_v4/server/projectsRoutes.js` | `projectsRoutes.js` |
| `StageBuilder_v4/server/aiPatternRoutes.js` | `aiPatternRoutes.js` |

### 4-2. 기존 pivot v3에서 유지·복사

| 항목 | 대상 |
|------|------|
| `build/` (Three.js r172) | `html/stageBuilder/build/` |
| `examples/` | `html/stageBuilder/examples/` |
| `files/stage/*.fbx` | `html/stageBuilder/files/stage/` |
| `files/music/`, `video/` | 동일 경로 |
| 캐릭터 FBX | **`files/characters/`** 로 이동 (`fbx/` 삭제) |

### 4-3. 올리지 않아도 되는 것

- `StageBuilder_v4/workers/` — Cloudflare Pages 테스트용 (PIVOT과 별개)
- `StageBuilder_v4/server/files/` — 로컬 dev용 샘플

---

## 5. PIVOT 서버 업로드 (WinSCP / scp)

1. pivot `server.js` 위치 백업 (날짜 붙여 rename)
2. 업로드:
   - `server.js`, `projectsRoutes.js`, `aiPatternRoutes.js`
   - `html/stageBuilder/editor/` (덮어쓰기)
   - `html/stageBuilder/files/` (stage, characters, music, video, props)
   - `node_modules/` 전체 **또는** 서버에서 `npm install` + `adm-zip extract-zip`
3. `build/`, `examples/` 없으면 v3 pivot에서 복사

---

## 6. 서버에서 npm (node_modules 안 올렸을 때)

```bash
cd /path/to/pivot/server   # server.js 있는 폴더
npm install
npm install adm-zip extract-zip
```

---

## 7. Node 재시작

pivot 운영 방식에 맞게 (pm2, systemd, docker 등):

```bash
# 예: pm2
pm2 restart server
# 또는
node server.js
```

**`server.js` / `projectsRoutes.js` 변경 후 재시작 필수.**

---

## 8. 배포 확인 체크리스트

### API

- [ ] `GET /api/health` → `{ "status": "ok", "version": 4 }`
- [ ] 로그인 후 `GET /api/fbx-files` → 200, 경로 `/files/characters/...`
- [ ] `GET /api/prop-files` → 200
- [ ] `GET /api/projects` → 200 (빈 배열 OK)

### 정적

- [ ] `GET /files/stage/background.fbx` → 200
- [ ] `GET /build/three.module.js` → 200
- [ ] `GET /stageBuilder/index.html` → 200 (로그인 필요)

### 에디터 UI (로그인 후)

- [ ] https://pivot.mhsoft.co.kr/stageBuilder/index.html
- [ ] 상태줄 **Stage shell OK**
- [ ] 상태줄 **Assets API OK**
- [ ] 튜토리얼: `/stageBuilder/tutorial/`
- [ ] 프로젝트 허브: 새 프로젝트 생성·저장
- [ ] 캐릭터 Assets 목록·업로드
- [ ] (선택) 프로젝트 ZIP 내보내기/가져오기

### 상태줄 의미

| 메시지 | 의미 |
|--------|------|
| `Stage shell OK` | `files/stage/background.fbx` 로드 성공 |
| `Stage shell missing` | `files/stage/*.fbx` 확인 |
| `Assets API OK` | 업로드/목록 API 연결됨 |
| `Assets API unavailable` | 무대 편집 가능, Assets만 불가 |

---

## 9. 로컬 개발 vs PIVOT

| 항목 | localhost (`server/server.js`) | PIVOT |
|------|-------------------------------|--------|
| URL | `http://localhost:3000/stageBuilder/` | `https://pivot.mhsoft.co.kr/stageBuilder/` |
| Three.js | `runtime/` → pivot stageBuilder junction | `../build/three.module.js` |
| API | same-origin `:3000` | same-origin (pivot host) |
| 인증 | `DEV_SKIP_AUTH` 기본 bypass | JWT `pb_token` 필수 |
| 캐릭터 폴더 | `server/files/characters/` | `html/stageBuilder/files/characters/` |

로컬 dev — pivot API 연결 금지:

```bash
cd StageBuilder_v4/server
npm install
node server.js
```

runtime junction (한 번):

```powershell
New-Item -ItemType Junction -Path "runtime" -Target "E:\SynologyDrive\pivot\nginx_v4\html\stageBuilder" -Force
```

---

## 10. 트러블슈팅

| 증상 | 확인 |
|------|------|
| `Cannot find module 'adm-zip'` | `npm install adm-zip extract-zip` |
| Stage shell missing | `html/stageBuilder/files/stage/background.fbx` |
| Three.js 404 | `build/`, `examples/` 복사 여부 |
| Assets 401 | pivot 로그인·쿠키 |
| 캐릭터 목록 비음 | FBX가 `characters/`에 있는지 (`fbx/` 아님) |
| 프로젝트 저장 실패 | `projectsRoutes.js` 배포·Node 재시작 |
| 예전 프로젝트 FBX 404 | JSON 경로 `/files/fbx/` → `/files/characters/` 수정 |

---

## 11. 보안

- SSH·DB 비밀번호는 채팅/깃에 올리지 않음
- `OPENAI_API_KEY`는 서버 환경변수로만 (AI 패턴 초안, 선택)

---

## 12. Cloudflare Pages 테스트 (PIVOT과 별개)

외부 테스터용: editor → Pages, API → Workers + R2.  
PIVOT 배포와 **동시에 필수 아님**. See `DEPLOY-CLOUDFLARE.md`.

---

*마지막 갱신: v4 nginx_v4 반영 — STAGEBUILDER_ROOT, characters 전용, fbx 제거, adm-zip/extract-zip.*
