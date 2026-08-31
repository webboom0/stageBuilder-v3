# StageBuilder v4 — Cloudflare Pages 테스트 사이트

PIVOT 점검 중 **외부 테스터**가 에디터 전체(저장·업로드·프로젝트)를 쓸 수 있게 하는 구성입니다.

```
테스터 브라우저
    ↓
Cloudflare Pages (*.pages.dev)     ← editor 정적 파일 (v4 push 시 자동 빌드)
    ↓ API 호출
Render Web Service                 ← Node API + 파일 저장 (v4 push 시 자동 배포)
```

> **Pages만으로는 안 됩니다.** 업로드·프로젝트 저장은 Render API가 처리합니다.

---

## 1. 사전 준비

| 항목 | 내용 |
|------|------|
| GitHub | `webboom0/stageBuilder-v3` · branch **`v4`** |
| Cloudflare | 계정 + Pages 프로젝트 생성 권한 |
| Render | [render.com](https://render.com) 무료 계정 |
| 무대 FBX | `background.fbx`, `arena_stage.fbx` (v3/pivot `files/stage/`) |

로컬에서 FBX 확인:

```powershell
node scripts/ensure-deploy-assets.mjs
# STAGE_ASSETS_SRC 지정 예:
$env:STAGE_ASSETS_SRC="E:\SynologyDrive\StageBuilder_v2_new\StageBuilder_v3\files\stage"
node scripts/ensure-deploy-assets.mjs
```

---

## 2. API 서버 — Render (먼저)

1. Render → **New** → **Blueprint**
2. Repo: `webboom0/stageBuilder-v3` · Branch: **`v4`**
3. 루트의 `render.yaml` 적용
4. (선택) Environment → `STAGE_ASSETS_SRC` = 빌드 시 FBX가 있는 경로  
   - Render 빌드 환경에 파일이 없으면, 배포 후 **Shell**로 `server/files/stage/`에 직접 업로드
5. 배포 완료 후 URL 확인:  
   `https://stagebuilder-v4-api.onrender.com/api/health` → `{"status":"ok",...}`

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
| Root directory | `/` (repo 루트) |

4. **Environment variables** (Production + Preview)

| 변수 | 예시 |
|------|------|
| `STAGEBUILDER_API_URL` | `https://stagebuilder-v4-api.onrender.com` |

5. **Save and Deploy**

### 접속 URL

- `https://<project>.pages.dev/stageBuilder/index.html`
- 루트 `/` → 에디터로 리다이렉트 (`_redirects`)
- 튜토리얼: `https://<project>.pages.dev/tutorial/`

---

## 4. 자동 배포 흐름

```
git push origin v4
    ├─→ Render: API 재배포 (render.yaml)
    └─→ Cloudflare Pages: pages-dist 빌드·배포
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

## 관련 파일

| 파일 | 역할 |
|------|------|
| `scripts/prepare-pages-deploy.mjs` | Pages 빌드 (editor + Three.js + API URL 주입) |
| `scripts/ensure-deploy-assets.mjs` | Render 빌드 시 stage FBX 복사 |
| `render.yaml` | Render Blueprint |
| `editor/js/config/app-config.js` | `__STAGEBUILDER_API__` · `/files/stage/` URL |
