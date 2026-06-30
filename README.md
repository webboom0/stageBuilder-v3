# StageBuilder v3 (중간 작업용)

`stageBuilder_v2`에서 **실행에 필요한 파일만** 복사한 중간 작업 공간입니다.

## 포함된 것

| 폴더 | 설명 |
|------|------|
| `editor/` | 메인 앱 (index.html, 타임라인, 무대, 저장/불러오기) |
| `build/` | Three.js 빌드 (`three.module.js`) |
| `examples/jsm/` | Three.js addons (로더, TransformControls 등) |
| `files/` | 무대 FBX, 아이콘, 샘플 에셋 |
| `server/` | 음악/FBX/영상 업로드 API (포트 3001) |

## 제외된 것 (v2 대비)

- `src/` — Three.js 소스 (불필요, `build/` 사용)
- `examples/*.html` — Three.js 데모 페이지 (~900개)
- `node_modules/` — 서버에서 `npm install`로 재설치
- `test_*.html` — 개발용 테스트 페이지
- React 프로토타입 (`src/components/`)
- 백업/복사본 (`*copy*`, `*#*` 파일)

## 실행 방법

### 1. 에디터 (필수)

```powershell
cd E:\SynologyDrive\StageBuilder_v2_new\StageBuilder_v3
npx serve .
```

브라우저: `http://localhost:3000/editor/`

또는 Cursor **Live Server**로 `editor/index.html` 열기 (포트 5502, `.liveserverrc` 참고)

### 2. 업로드 API (음악/FBX/영상 업로드 시)

```powershell
cd E:\SynologyDrive\StageBuilder_v2_new\StageBuilder_v3\server
npm install
npm start
```

## v3 작업 현황

- [x] Premiere 통합 타임라인 (Motion/Light/Audio 동시 표시, 탭 제거)
- [x] 타임라인 왼쪽 Clip/Keyframe 인스펙터 패널
- [x] Cosmos/Premiere UI 테마 (`premiere-workspace.css`)
- [x] 패널(Scene, 무대, Properties, Assets) 스타일 통일
- [ ] 키프레임 편집 undo/redo `commands/` 통합
- [ ] 타임라인 드래그 UX 개선

v2는 그대로 두고 v3에서만 실험·수정합니다. 안정화 후 v2에 반영하거나 v3를 새 메인으로 승격할 수 있습니다.

## 원본

복사 출처: `E:\SynologyDrive\StageBuilder_v2_new\stageBuilder_v2`
