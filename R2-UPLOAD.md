# StageBuilder v4 — R2 라이브러리 업로드 가이드

Cloudflare Workers API는 **공통 라이브러리** 파일을 R2 버킷 `stagebuilder-v4-files`에 저장합니다.  
로컬 `server/files/` 내용을 **아래 경로 그대로** R2에 올리면 에디터 Assets 패널에서 보입니다.

> PIVOT 서버와 무관합니다. Pages 테스트 사이트 + Workers API 전용입니다.

---

## R2 버킷 · 경로 규칙

| R2 객체 키 (Prefix) | 용도 | 예시 |
|---------------------|------|------|
| `files/stage/` | 무대 건물 FBX (필수) | `background.fbx`, `arena_stage.fbx` |
| `files/music/` | 공통 음원 | `*.mp3`, `*.wav` … |
| `files/characters/` | 등장인물 FBX | `*.fbx` |
| `files/fbx/` | 등장인물 FBX (레거시) | `*.fbx` |
| `files/props/` | 소품 FBX/OBJ | `*.fbx`, `*.obj` |
| `files/video/` | 배경 영상 | `*.mp4`, `*.webm` … |
| `files/projects/` | (자동) 프로젝트 데이터 | 업로드 불필요 — API가 생성 |

**중요:** 키는 반드시 `files/` 로 시작해야 합니다.  
로컬 폴더 `server/files/music/song.mp3` → R2 키 `files/music/song.mp3`

---

## 방법 1 — Cloudflare Dashboard (드래그 앤 드롭)

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2** → 버킷 **`stagebuilder-v4-files`**
2. **Upload** → 폴더별로 파일 선택
3. 업로드 시 **Object key**를 수동 지정:
   - `files/stage/background.fbx`
   - `files/music/내음원.mp3`
   - …

폴더 단위 업로드 도구는 키 prefix를 맞춰야 하므로, **wrangler CLI(방법 2)** 가 대량 업로드에 더 편합니다.

---

## 방법 2 — wrangler CLI (권장)

```powershell
cd E:\SynologyDrive\StageBuilder_v2_new\StageBuilder_v4\workers
npm install
npx wrangler login

# 무대 FBX (필수 — 에디터 3D 무대)
npx wrangler r2 object put stagebuilder-v4-files/files/stage/background.fbx --file="E:\path\to\background.fbx"
npx wrangler r2 object put stagebuilder-v4-files/files/stage/arena_stage.fbx --file="E:\path\to\arena_stage.fbx"

# 공통 라이브러리 — 로컬 server/files/ 가 있으면:
$SRC = "E:\SynologyDrive\StageBuilder_v2_new\StageBuilder_v4\server\files"
Get-ChildItem "$SRC\music" -File | ForEach-Object {
  npx wrangler r2 object put "stagebuilder-v4-files/files/music/$($_.Name)" --file=$_.FullName
}
# characters, props, video, fbx 도 동일 패턴
```

한 번에 올리는 스크립트:

```powershell
node scripts/upload-library-to-r2.mjs
# 또는 소스 지정:
$env:LIBRARY_SRC="E:\SynologyDrive\StageBuilder_v2_new\StageBuilder_v4\server\files"
node scripts/upload-library-to-r2.mjs
```

---

## 방법 3 — 에디터에서 직접 업로드

R2에 미리 넣지 않아도, 에디터 **Assets 패널**에서 업로드하면 API가 R2 `files/music/` 등에 저장합니다.  
**테스트용 소량**이면 이 방법만으로도 됩니다.

다만 **무대 FBX**(`files/stage/`)는 빌드에 포함되지 않으므로 **반드시 R2 또는 업로드 스크립트**로 넣어야 합니다.

---

## 업로드 후 확인

Worker 배포 URL에서:

```
GET https://stagebuilder-v4-api.<account>.workers.dev/api/health
→ {"status":"ok","backend":"workers-r2",...}

GET https://stagebuilder-v4-api.<account>.workers.dev/api/audio-files
→ 라이브러리 목록 JSON

GET https://stagebuilder-v4-api.<account>.workers.dev/files/stage/background.fbx
→ FBX 다운로드 (200)
```

---

## 최소 필수 파일 (테스트 시작)

| 파일 | R2 키 |
|------|--------|
| 프로시니엄 무대 | `files/stage/background.fbx` |
| 아레나 무대 | `files/stage/arena_stage.fbx` |

음원·캐릭터·소품은 **나중에** 추가해도 됩니다.

GitHub Release `stage-deploy-assets-v1` 에 FBX가 있으면 `node scripts/ensure-deploy-assets.mjs` 로 받은 뒤 위 경로로 R2에 올리세요.
