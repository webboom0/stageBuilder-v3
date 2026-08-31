# StageBuilder v4 — Cloudflare Pages 테스트 사이트

PIVOT 점검 중 **외부 테스터**가 에디터 전체(저장·업로드·프로젝트)를 쓸 수 있게 하는 구성입니다.

```
테스터 브라우저
    ↓
Cloudflare Pages (*.pages.dev)     ← editor 정적 파일 (v4 push 시 자동 빌드)
    ↓ API 호출
Cloudflare Workers + R2 (권장)     ← 슬립 없음 · 파일 영구 저장
    또는 Render Web Service        ← 레거시 (무료는 15분 슬립)
```

> **Pages만으로는 안 됩니다.** 업로드·프로젝트 저장은 Workers API 또는 Render API가 처리합니다.  
> **PIVOT 서버(`server.js`) 수정 불필요** · **`editor/` 코드 변경 없음** (API URL만 Pages 빌드 시 주입).

---

## 1. 사전 준비

| 항목 | 내용 |
|------|------|
| GitHub | `webboom0/stageBuilder-v3` · branch **`v4`** |
| Cloudflare | 계정 + Pages + Workers + R2 |
| Render | (선택) 레거시 API — [render.com](https://render.com) |
| 무대 FBX | `background.fbx`, `arena_stage.fbx` → **R2** `files/stage/` ([R2-UPLOAD.md](./R2-UPLOAD.md)) |

로컬에서 FBX 확인:

```powershell
node scripts/ensure-deploy-assets.mjs
# STAGE_ASSETS_SRC 지정 예:
$env:STAGE_ASSETS_SRC="E:\SynologyDrive\StageBuilder_v2_new\StageBuilder_v3\files\stage"
node scripts/ensure-deploy-assets.mjs
```

---

## 2. API 서버 — Workers + R2 (권장)

슬립 없이 상시 동작 · 프로젝트·업로드 데이터 R2 영구 저장.

### 한 번만 — Worker 배포 + Pages 연결

```powershell
npx wrangler login
npm run worker:deploy
```

`deploy-worker-api.mjs`가:
1. R2 버킷 `stagebuilder-v4-files` 생성 (없으면)
2. `workers/` Worker 배포
3. Pages `STAGEBUILDER_API_URL` 자동 갱신 + 재배포 트리거

배포 후 URL 확인 (`workers/deploy-url.txt`에 저장됨):

```
https://stagebuilder-v4-api.<account>.workers.dev/api/health
→ {"status":"ok","backend":"workers-r2",...}
```

Worker만 다시 배포 (Pages 연결 생략):

```powershell
node scripts/deploy-worker-api.mjs --skip-pages
node scripts/set-pages-api-url.mjs https://stagebuilder-v4-api.<account>.workers.dev
```

### R2 라이브러리 업로드 (직접)

공통 음원·FBX·소품은 **R2에 직접** 올립니다. 자세한 경로: **[R2-UPLOAD.md](./R2-UPLOAD.md)**

```powershell
# 로컬 server/files/ → R2 일괄 업로드
npm run r2:upload-library

# 또는 Dashboard에서 files/stage/background.fbx 등 수동 업로드
```

**최소 필수:** `files/stage/background.fbx`, `files/stage/arena_stage.fbx`

### 로컬 Worker 개발

```powershell
cd workers
npm install
npm run dev
# → http://localhost:8787/api/health  (R2는 remote 바인딩 — wrangler dev 기본)
```

---

## 2b. API 서버 — Render (레거시)

### 한 번만 (Render Blueprint 연결)

1. [Render Blueprint 새로 만들기](https://dashboard.render.com/select-repo?type=blueprint) 클릭
2. GitHub `webboom0/stageBuilder-v3` 선택 · Branch **`v4`**
3. `render.yaml` 확인 후 **Apply** / **Deploy Blueprint**
4. 배포 완료 후 URL 확인:  
   `https://stagebuilder-v4-api.onrender.com/api/health` → `{"status":"ok",...}`

> 무대 FBX는 GitHub Release `stage-deploy-assets-v1`에서 Render 빌드 시 자동 다운로드됩니다 (`scripts/ensure-deploy-assets.mjs`).

### Pages API URL 자동 연결 (로컬 PC)

Render 배포가 끝나면 (또는 배포 중 대기):

```powershell
npm run api:wait-connect
# 또는 API URL 직접 지정:
node scripts/set-pages-api-url.mjs https://stagebuilder-v4-api.onrender.com
```

`set-pages-api-url.mjs`는 Cloudflare `stagebuilder` 프로젝트의 `STAGEBUILDER_API_URL`을 바꾸고 재배포를 트리거합니다.

### 수동 (Render 대시보드)

1. Render → **New** → **Blueprint**
2. Repo: `webboom0/stageBuilder-v3` · Branch: **`v4`**
3. 루트의 `render.yaml` 적용
4. 배포 완료 후 Cloudflare Pages Variables → `STAGEBUILDER_API_URL` = Render URL → **Retry deployment**

**환경 변수 (render.yaml에 포함됨)**

| 변수 | 값 | 설명 |
|------|-----|------|
| `DEV_SKIP_AUTH` | `1` | 테스트용 로그인 생략 |
| `NODE_ENV` | `production` | |
| `PORT` | `10000` | Render 기본 |

> 무료 플랜: 15분 미사용 시 슬립 → 첫 접속 30초~1분 대기 가능.  
> 업로드·프로젝트는 디스크에 저장되나, **무료는 재배포 시 데이터 초기화**될 수 있음 → 테스트용으로만 사용.

---

## 3. 에디터 — Cloudflare Pages

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. GitHub `webboom0/stageBuilder-v3` · Production branch: **`v4`**
3. **Build settings**

| 항목 | 값 |
|------|-----|
| Framework preset | None |
| Build command | `node scripts/prepare-pages-deploy.mjs` |
| Build output directory | `pages-dist` |
| Deploy command | `node scripts/cf-pages-deploy.mjs` |
| Root directory | `/` (repo 루트) |

4. **Environment variables** (Production + Preview)

| 변수 | 예시 |
|------|------|
| `STAGEBUILDER_API_URL` | `https://stagebuilder-v4-api.<account>.workers.dev` |

5. **Save and Deploy**

### 접속 URL

- `https://<project>.pages.dev/stageBuilder/index.html`
- 루트 `/` → 에디터로 리다이렉트 (`_redirects`)
- 튜토리얼: `https://<project>.pages.dev/tutorial/`

---

## 4. 자동 배포 흐름

```
git push origin v4
    └─→ Cloudflare Pages: pages-dist 빌드·배포

Worker API (별도):
    npm run worker:deploy   ← workers/ 변경 시
Render (레거시):
    git push → render.yaml 재배포
```

**주의:** API URL을 바꾸면 Cloudflare Pages의 `STAGEBUILDER_API_URL`도 같이 수정하세요.

---

## 5. 로컬에서 Pages 빌드 미리보기

```powershell
# API는 로컬 서버 사용 예
$env:STAGEBUILDER_API_URL="http://localhost:3000"
node scripts/prepare-pages-deploy.mjs

# 다른 터미널
cd server
npm run dev

# Pages 정적 미리보기
npx wrangler pages dev pages-dist
# → http://localhost:8788/stageBuilder/index.html
```

---

## 6. 동작 확인 체크리스트

- [ ] `https://<api>/api/health` → OK
- [ ] 에디터 상태줄 `Assets API OK`
- [ ] 상태줄 `Stage shell OK` (FBX 없으면 `Stage shell missing`)
- [ ] 프로젝트 새로 만들기 · 저장
- [ ] Characters FBX 업로드
- [ ] 패턴 · 키프레임 적용 · 재생

---

## 7. 커스텀 도메인 (선택)

| 서비스 | 도메인 예 |
|--------|-----------|
| Cloudflare Pages | `stagebuilder-test.yourdomain.com` |
| Render | `api-stagebuilder.yourdomain.com` |

Pages 환경 변수 `STAGEBUILDER_API_URL`을 Render 커스텀 도메인으로 변경 후 **재배포**.

---

## 8. PIVOT 복구 후

- 프로덕션: 기존 `editor/DEPLOY-PIVOT.md` 절차
- 테스트 Pages 사이트: 유지하거나 Cloudflare에서 프로젝트 일시 중지

---

## 9. 빌드 오류 해결

### Building 실패 — `Cannot find module prepare-pages-deploy.mjs`

- Production branch가 **`v4`** 인지 확인 (`main`에는 스크립트 없음)
- `v4`에 push 되었는지 GitHub에서 확인

### Deploying 실패 — `Authentication error [code: 10000]`

빌드는 성공했는데 `npx wrangler pages deploy` 에서 실패하는 경우:

1. **Variables**에서 `CLOUDFLARE_API_TOKEN`을 **직접 넣었다면 삭제**  
   (Git 연동 빌드는 Cloudflare가 토큰을 자동 주입 — 직접 넣은 토큰이 권한 부족이면 10000 오류)

2. **Deploy command** 변경:
   ```text
   node scripts/cf-pages-deploy.mjs
   ```
   (또는 `npx wrangler pages deploy pages-dist --project-name=stagebuilder-v3`)

3. **Settings → Builds** — 프로젝트 이름이 `stagebuilder-v3` 인지 확인 (`wrangler.toml` `name`과 동일)

4. 저장 후 **Retry build** (반드시 **`v4`** 브랜치 빌드)

### Deploying 실패 — `Missing Pages project name`

Deploy command에 `--project-name=stagebuilder-v3` 추가, 또는 `wrangler.toml` + `scripts/cf-pages-deploy.mjs` 사용.

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `workers/` | Cloudflare Workers API (R2 저장) |
| `workers/wrangler.jsonc` | Worker + R2 버킷 바인딩 |
| `R2-UPLOAD.md` | R2 라이브러리 업로드 가이드 |
| `scripts/deploy-worker-api.mjs` | Worker 배포 + Pages API URL 연결 |
| `scripts/upload-library-to-r2.mjs` | 로컬 files/ → R2 업로드 |
| `scripts/prepare-pages-deploy.mjs` | Pages 빌드 (editor + Three.js + API URL 주입) |
| `scripts/cf-pages-deploy.mjs` | Cloudflare Deploy 단계 (wrangler pages deploy) |
| `scripts/ensure-deploy-assets.mjs` | stage FBX 확보 (로컬/R2 업로드용) |
| `render.yaml` | Render Blueprint (레거시) |
| `editor/js/config/app-config.js` | `__STAGEBUILDER_API__` · `/files/stage/` URL |
