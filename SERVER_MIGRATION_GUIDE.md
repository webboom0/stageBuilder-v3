# StageBuilder v2 서버 마이그레이션 가이드

이 문서는 `pivot/nginx` 프로젝트(도커 + JWT 인증 + 리버스프록시 통합 서버)에서 적용한 서버 관련 수정사항을, `stageBuilder_v2`(독립 실행 서버) 프로젝트에 어떻게 옮겨 적용해야 하는지를 정리한 가이드입니다.

---

## 0. 프로젝트 구조 차이 요약

| 항목 | `pivot/nginx` | `stageBuilder_v2` |
|---|---|---|
| 서버 진입점 | `server.js` (루트) | `server/server.js` |
| 포트 | `3000` (통합) | `3001` (독립) |
| 인증 | JWT(`pb_token` 쿠키) + `requireAuth` 미들웨어 | **없음** (공개 API) |
| 파일 저장 위치 | `html/stageBuilder/files/{music,fbx,video}` | `files/{music,fbx,video}` (서버 기준 `../files/...`) |
| 정적 서빙 | `/files`, `/stageBuilder`, `/external-app`, `/pb`, `/mol` 등 | `/files` 만 |
| 프록시 | `http-proxy-middleware`로 `/accf-api` 를 FastAPI로 | 없음 |
| 운영 도메인 | `https://pivot.mhsoft.co.kr` (nginx 리버스프록시 뒤) | 단독 |

> 이 차이 때문에 nginx 프로젝트의 모든 변경을 v2에 그대로 옮길 필요는 없습니다. **v2 입장에서 의미 있는 항목만** 골라서 적용합니다.

---

## 1. 수정 대상 파일 목록

| # | 파일 경로 | 변경 종류 | 필수 여부 |
|---|---|---|---|
| 1 | `editor/js/config/audio-upload-config.js` | 서버 URL 해석 로직 단순화 | **권장** |
| 2 | `editor/js/config/fbx-upload-config.js` | 서버 URL 해석 로직 단순화 | **권장** |
| 3 | `editor/js/config/video-upload-config.js` | `getVideoServerUrl()`에 origin 우선 적용 | **필수** |
| 4 | `editor/js/SidebarAssets.audio.js` | `credentials` 정책 정리 | 선택 (인증 추가 시 필수) |
| 5 | `editor/js/SidebarAssets.motion.js` | `credentials` 정책 정리 | 선택 (인증 추가 시 필수) |
| 6 | `editor/js/SidebarAssets.video.js` | `credentials` 정책 정리 | 선택 (인증 추가 시 필수) |
| 7 | `server/server.js` | 안전한 파일명 처리(디렉터리 트래버설 방지) 보강 | **권장** |
| 8 | `server/server.js` | 환경별 CORS 명시화 | 선택 |

---

## 2. Frontend Config 3종 (가장 중요)

### 왜 바꾸나?
운영에서 v2를 외부 도메인(예: `https://pivot.mhsoft.co.kr/`)에 배포하면, 기존 코드는 다음과 같이 갈립니다.

- localhost에서 실행 → API는 `http://localhost:3001`로 호출 (OK)
- 운영 도메인 → `window.location.origin` 사용

문제는 **세 config 파일의 동작이 미묘하게 달라서** 비디오만 잘못된 URL을 호출할 수 있다는 점입니다. 비디오 config는 `getVideoServerUrl()`이 무조건 `HOST`(`localhost:3001`)만 반환해서, **운영에 올리면 비디오 API가 깨집니다**. 이 부분을 통일합니다.

### 2-1. `editor/js/config/audio-upload-config.js`

`getServerUrl()`을 origin 우선으로 단순화합니다.

```js
// 환경별 설정
export const getServerUrl = () => {
  // 로컬/프로덕션 구분 없이 현재 origin을 기본으로 사용합니다.
  // (배포 환경에서는 같은 오리진에서 API/정적 파일을 서빙)
  // 단, 로컬 개발 시 프론트가 별도 포트(예: Vite 5173)면 SERVER_URL로 폴백.
  if (typeof window !== 'undefined' && window.location?.origin) {
    const isDevServer = ['5173', '5174', '3000'].includes(window.location.port);
    if (!isDevServer) return window.location.origin;
  }
  return AUDIO_UPLOAD_CONFIG.SERVER_URL;
};
```

> 만약 dev 서버(Vite) 포트가 다르면 `isDevServer` 배열에 추가하세요. 또는 **항상 origin을 쓰고 dev 시점에는 Vite 프록시로 3001로 보내는 방식**도 가능합니다.

### 2-2. `editor/js/config/fbx-upload-config.js`

동일 패턴으로 `getFbxServerUrl()` 수정.

```js
export const getFbxServerUrl = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const isDevServer = ['5173', '5174', '3000'].includes(window.location.port);
    if (!isDevServer) return window.location.origin;
  }
  return FBX_UPLOAD_CONFIG.SERVER_URL;
};
```

### 2-3. `editor/js/config/video-upload-config.js` (필수)

이 파일은 origin 폴백이 **아예 없어서** 운영에 올리면 100% 깨집니다. 다음과 같이 보강하세요.

```js
// 서버 URL 가져오기
export function getVideoServerUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const isDevServer = ['5173', '5174', '3000'].includes(window.location.port);
    if (!isDevServer) return window.location.origin;
  }
  return VIDEO_UPLOAD_CONFIG.SERVER.HOST;
}
```

---

## 3. SidebarAssets 3종 (인증 도입 여부에 따라 선택)

`stageBuilder_v2`는 현재 인증이 없으므로 **`credentials: 'omit'` 그대로 두어도 동작**합니다. 다만 **다음 두 경우엔 `'include'`로 바꿔야** 합니다.

1. 추후 v2를 nginx/JWT 백엔드 뒤에 붙일 예정 (현재 `pivot/nginx`처럼 운영)
2. v2 서버 자체에 인증 미들웨어 추가할 예정

### 변경 위치 (3개 파일 공통)

`editor/js/SidebarAssets.audio.js`, `SidebarAssets.motion.js`, `SidebarAssets.video.js` 내부에서 `credentials: 'omit'`을 모두 `credentials: 'include'`로 변경.

| 파일 | 변경 횟수 (대략) |
|---|---|
| `SidebarAssets.audio.js` | 4곳 (health/목록/업로드/삭제) |
| `SidebarAssets.motion.js` | 5곳 (health 2회/목록/업로드/삭제) |
| `SidebarAssets.video.js` | 3곳 (health/업로드/삭제) |

```diff
- credentials: 'omit'
+ credentials: 'include'
```

> 인증이 없는 동안엔 `'omit'` 유지가 더 안전(불필요한 쿠키 전송 방지)합니다. 운영 환경 확정 후에 일괄 변경하세요.

---

## 4. `server/server.js`

v2 서버는 이미 `/api/upload-audio`, `/api/audio-files`, `/api/upload-fbx`, `/api/fbx-files`, `/api/upload-video`, `/api/video-files` 라우트를 가지고 있어서 **라우트 구조 변경은 필요 없습니다.** 다만 nginx 프로젝트에서 추가한 안전장치 일부를 옮겨오면 좋습니다.

### 4-1. 파일 삭제 시 디렉터리 트래버설 방지 (권장)

기존 v2 삭제 라우트는 `req.params.filename`을 그대로 `path.join` 합니다. 악의적인 입력(`../../etc/passwd`)을 막기 위해 `path.basename`으로 정규화합니다.

```js
// 음악 파일 삭제 (예시)
app.delete('/api/audio-files/:filename', (req, res) => {
  try {
    const safeName = path.basename(req.params.filename); // 추가: 디렉터리 트래버설 방지
    const filePath = path.join(__dirname, '../files/music', safeName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '파일 삭제 중 오류가 발생했습니다.' });
  }
});
```

`fbx-files`, `video-files` 삭제 라우트에도 동일하게 `path.basename(req.params.filename)` 한 줄을 넣어 주세요.

### 4-2. 업로드 응답에 public path 포함 (선택, UI 코드 단순화에 도움)

nginx 프로젝트는 업로드 성공 응답에 `publicPath: /files/{kind}/{filename}` 를 넣어 줍니다. 필요하면 v2에도 동일하게 보강 가능합니다.

```js
// 예: /api/upload-fbx
res.json({
  success: true,
  filename: uploadedFile.filename,
  path: `/files/fbx/${uploadedFile.filename}`,
  size: uploadedFile.size,
  timestamp: new Date().toISOString(),
});
```

### 4-3. 환경 변수 기반 PORT/CORS (선택)

운영 도커에서 포트/오리진을 외부에서 주입할 수 있도록 환경 변수로 분리해두면 편합니다.

```js
const PORT = Number.parseInt(process.env.PORT, 10) || 3001;
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
```

> `credentials: true` 와 클라이언트의 `credentials: 'include'`는 **세트로 동작**합니다. 인증을 도입할 경우 둘 다 켜져 있어야 쿠키가 정상 전달됩니다.

---

## 5. 운영 배포 시나리오별 체크리스트

### 시나리오 A. v2를 단독으로 도메인에 노출 (nginx → 노드 직접 프록시)

- [x] 섹션 2 (Frontend Config 3종): origin 폴백 적용
- [ ] 섹션 3 (SidebarAssets): 인증 미사용이면 `omit` 유지
- [x] 섹션 4-1: 디렉터리 트래버설 방지
- [x] 섹션 4-3: 환경변수 기반 CORS

**리버스프록시 측 경로 매핑 (예: nginx)**

```
location /api/    { proxy_pass http://stagebuilder_v2:3001; }
location /files/  { proxy_pass http://stagebuilder_v2:3001; }
location /        { proxy_pass http://stagebuilder_v2:3001; }  # 에디터 정적 파일
```

### 시나리오 B. v2를 `pivot/nginx` 통합 서버 뒤에 붙임 (JWT 인증 공유)

- [x] 섹션 2 (Frontend Config 3종): origin 폴백 적용
- [x] 섹션 3 (SidebarAssets): `credentials: 'include'`
- [x] 섹션 4-1: 디렉터리 트래버설 방지
- [ ] 섹션 4-3: CORS는 사실상 같은 오리진이라 큰 의미 없음 (단, dev 환경 대비)
- [ ] 추가 작업: v2의 `/api/*` 라우트 앞에 `requireAuth` 또는 nginx 측에서 JWT 검증 후 헤더로 전달

이 경우 `pivot/nginx/server.js` 처럼 `/api/*` 라우트들을 인증 미들웨어 뒤에 두거나, nginx 리버스프록시 단에서 토큰 검증을 끝내고 v2로는 신뢰된 트래픽만 보내는 두 가지 방식이 가능합니다.

---

## 6. 적용 후 동작 검증

브라우저 DevTools → Network 탭에서 다음을 확인:

1. `GET /api/health` → `{ status: "ok" }`
2. `GET /api/audio-files` → 배열 응답
3. `POST /api/upload-audio` (audio 패널 업로드) → 200, `files/music/` 에 파일 저장 확인
4. `GET /api/fbx-files`, `POST /api/upload-fbx`, `DELETE /api/fbx-files/{name}` 도 동일
5. `GET /api/video-files`, `POST /api/upload-video`, `DELETE /api/video-files/{name}` 도 동일
6. 운영 도메인에서 요청 URL이 `https://<your-domain>/api/...` 로 가는지 (절대 `http://localhost:3001`이 아니어야 함)

---

## 7. 참고: `pivot/nginx`에서 했던 원본 변경

원본 변경 내역(참고용):

- `server.js`
  - `STAGEBUILDER_FILES_ROOT` 상수로 저장 경로 단일화
  - 기존 `/html/stageBuilder/files/*` 라우트 → `/api/*`로 재정의
  - `/files` 중복 정적 서빙 제거
  - `safeListFiles`, `safeDeleteFile` 헬퍼 추가
- `editor/js/config/*-upload-config.js` 3종
  - `localhost:3001` → 통합 포트(3000) 또는 origin
- `editor/js/SidebarAssets.{audio,motion,video}.js`
  - `credentials: 'omit'` → `credentials: 'include'` (JWT 쿠키 전달)

v2의 경우 라우트 구조가 이미 `/api/*` 라서 server.js 쪽 변경 폭은 **훨씬 작습니다.** 핵심은 **Frontend Config 3종(섹션 2)** 이고, 나머지는 배포 시나리오에 따라 선택 적용하면 됩니다.
