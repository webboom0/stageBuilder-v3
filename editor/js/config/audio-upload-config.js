// 음악 업로드 서버 설정
export const AUDIO_UPLOAD_CONFIG = {
  // 서버 기본 URL (개발 환경)
  SERVER_URL: 'http://localhost:3001',
  
  // API 엔드포인트
  ENDPOINTS: {
    UPLOAD: '/api/upload-audio',
    GET_FILES: '/api/audio-files',
    DELETE_FILE: '/api/audio-files'
  },
  
  // 파일 업로드 설정
  UPLOAD: {
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    ALLOWED_TYPES: [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
      'audio/mp4', 'audio/aac', 'audio/flac'
    ],
    ALLOWED_EXTENSIONS: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']
  },
  
  // UI 설정
  UI: {
    PROGRESS_ANIMATION_DURATION: 2000, // 진행률 애니메이션 지속 시간 (ms)
    SUCCESS_MESSAGE_DURATION: 3000,    // 성공 메시지 표시 시간 (ms)
    ERROR_MESSAGE_DURATION: 5000       // 오류 메시지 표시 시간 (ms)
  }
};

// 환경별 설정
export const getServerUrl = () => {
  // 프로덕션 환경에서는 실제 서버 URL 사용
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return window.location.origin; // 현재 도메인 사용
  }
  
  // 개발 환경에서는 설정된 서버 URL 사용
  return AUDIO_UPLOAD_CONFIG.SERVER_URL;
};

// API URL 생성 헬퍼 함수
export const getApiUrl = (endpoint) => {
  const serverUrl = getServerUrl();
  console.log("######serverUrl", serverUrl);
  return `${serverUrl}${endpoint}`;
};

// 설정 유효성 검사
export const validateConfig = () => {
  const config = AUDIO_UPLOAD_CONFIG;
  
  if (!config.SERVER_URL) {
    console.error('서버 URL이 설정되지 않았습니다.');
    return false;
  }
  
  if (!config.ENDPOINTS.UPLOAD || !config.ENDPOINTS.GET_FILES) {
    console.error('필수 API 엔드포인트가 설정되지 않았습니다.');
    return false;
  }
  
  if (!config.UPLOAD.MAX_FILE_SIZE || config.UPLOAD.MAX_FILE_SIZE <= 0) {
    console.error('유효하지 않은 최대 파일 크기 설정입니다.');
    return false;
  }
  
  return true;
};

// 기본 내보내기
export default AUDIO_UPLOAD_CONFIG;

