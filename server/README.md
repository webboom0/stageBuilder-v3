# 🎵 음악 업로드 서버

StageBuilder v2의 음악 파일 업로드를 처리하는 Node.js 서버입니다.

## 🚀 설치 및 실행

### 1. 의존성 설치
```bash
cd server
npm install
```

### 2. 서버 실행
```bash
# 일반 실행
npm start

# 개발 모드 (자동 재시작)
npm run dev
```

### 3. 서버 접속
- **서버 주소**: http://localhost:3001
- **API 엔드포인트**: http://localhost:3001/api

## 📁 파일 구조

```
server/
├── audio-upload-server.js    # 메인 서버 파일
├── package.json              # 의존성 설정
└── README.md                 # 이 파일

files/
└── music/                    # 업로드된 음악 파일 저장 위치
```

## 🔌 API 엔드포인트

### 1. 음악 파일 업로드
- **POST** `/api/upload-audio`
- **설명**: 음악 파일을 서버에 업로드
- **요청**: `multipart/form-data` (audioFile 필드)
- **응답**: 업로드 성공/실패 정보

### 2. 음악 파일 목록 조회
- **GET** `/api/audio-files`
- **설명**: 업로드된 모든 음악 파일 목록 조회
- **응답**: 음악 파일 정보 배열

### 3. 음악 파일 삭제
- **DELETE** `/api/audio-files/:filename`
- **설명**: 특정 음악 파일 삭제
- **응답**: 삭제 성공/실패 정보

## 🎵 지원 파일 형식

- **MP3** (.mp3)
- **WAV** (.wav)
- **OGG** (.ogg)
- **M4A** (.m4a)
- **AAC** (.aac)
- **FLAC** (.flac)

## ⚠️ 제한사항

- **최대 파일 크기**: 50MB
- **저장 위치**: `/files/music` 폴더
- **파일명**: 중복 방지를 위해 타임스탬프 추가

## 🔧 설정

### 포트 변경
`audio-upload-server.js` 파일에서 `PORT` 변수를 수정:

```javascript
const PORT = 3001; // 원하는 포트 번호로 변경
```

### 업로드 경로 변경
`storage.destination` 함수에서 경로를 수정:

```javascript
const uploadPath = path.join(__dirname, '../files/music'); // 원하는 경로로 변경
```

## 🐛 문제 해결

### 1. 포트 충돌
다른 서비스가 3001 포트를 사용 중인 경우:
```bash
# 포트 사용 확인
netstat -ano | findstr :3001

# 포트 변경 후 서버 재시작
```

### 2. 권한 오류
파일 업로드 폴더에 쓰기 권한이 없는 경우:
```bash
# 폴더 권한 확인 및 수정
chmod 755 files/music
```

### 3. CORS 오류
프론트엔드에서 API 호출 시 CORS 오류가 발생하는 경우:
```javascript
// CORS 설정 확인
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000']
}));
```

## 📝 로그

서버는 다음 정보를 콘솔에 출력합니다:
- 서버 시작 정보
- 파일 업로드 성공/실패
- 파일 삭제 정보
- 오류 발생 시 상세 정보

## 🔒 보안 고려사항

- 파일 형식 검증
- 파일 크기 제한
- 업로드 경로 제한
- 에러 핸들링

## 📞 지원

문제가 발생하거나 질문이 있는 경우:
1. 콘솔 로그 확인
2. 파일 권한 확인
3. 포트 충돌 확인
4. 네트워크 연결 상태 확인

