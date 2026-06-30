// FBX 파일 업로드 설정
export const FBX_UPLOAD_CONFIG = {
  // 서버 기본 URL (개발 환경)
  SERVER_URL: 'http://localhost:3001',
  
  // API 엔드포인트
  ENDPOINTS: {
    UPLOAD: '/api/upload-fbx',
    GET_FILES: '/api/fbx-files',
    DELETE_FILE: '/api/fbx-files',
    HEALTH: '/api/health',
  },

  // 업로드 설정
  UPLOAD: {
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
    ALLOWED_TYPES: ['application/octet-stream'], // FBX는 바이너리
    ALLOWED_EXTENSIONS: ['fbx'],
    CHUNK_SIZE: 1024 * 1024, // 1MB 청크
  },

  // 파일 관리 설정
  FILE_MANAGEMENT: {
    AUTO_REFRESH: true,
    REFRESH_INTERVAL: 5000, // 5초
    MAX_DISPLAY_FILES: 100,
  },

  // 에러 메시지
  ERROR_MESSAGES: {
    FILE_TOO_LARGE: '파일 크기가 100MB를 초과합니다.',
    INVALID_FILE_TYPE: 'FBX 파일만 업로드 가능합니다.',
    UPLOAD_FAILED: '파일 업로드에 실패했습니다.',
    DELETE_FAILED: '파일 삭제에 실패했습니다.',
    SERVER_ERROR: '서버 오류가 발생했습니다.',
    NETWORK_ERROR: '네트워크 오류가 발생했습니다.',
  },

  // 성공 메시지
  SUCCESS_MESSAGES: {
    UPLOAD_SUCCESS: '파일 업로드가 완료되었습니다.',
    DELETE_SUCCESS: '파일이 삭제되었습니다.',
    REFRESH_SUCCESS: '목록이 새로고침되었습니다.',
  }
};

// 🚀 환경별 설정 (오디오와 동일하게)
export const getFbxServerUrl = () => {
  // 프로덕션 환경에서는 실제 서버 URL 사용
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return window.location.origin; // 현재 도메인 사용
  }
  
  // 개발 환경에서는 설정된 서버 URL 사용
  return FBX_UPLOAD_CONFIG.SERVER_URL;
};

// API URL 생성 헬퍼 함수 (오디오와 동일하게)
export const getFbxApiUrl = (endpoint) => {
  const serverUrl = getFbxServerUrl();
  return `${serverUrl}${endpoint}`;
};

// 파일 유효성 검사 함수
export function validateFBXFile(file) {
  // 파일 크기 검사
  if (file.size > FBX_UPLOAD_CONFIG.UPLOAD.MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: FBX_UPLOAD_CONFIG.ERROR_MESSAGES.FILE_TOO_LARGE
    };
  }

  // 파일 확장자 검사
  const fileName = file.name.toLowerCase();
  if (!FBX_UPLOAD_CONFIG.UPLOAD.ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext))) {
    return {
      isValid: false,
      error: FBX_UPLOAD_CONFIG.ERROR_MESSAGES.INVALID_FILE_TYPE
    };
  }

  return { isValid: true };
}

// 파일 크기 포맷팅 함수
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 파일명 정리 함수
export function sanitizeFileName(fileName) {
  // 특수문자 제거 및 공백을 언더스코어로 변경
  return fileName
    .replace(/[^a-zA-Z0-9가-힣._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}