// editor/js/config/video-upload-config.js

// 비디오 업로드 설정
export const VIDEO_UPLOAD_CONFIG = {
  SERVER: {
      HOST: 'http://localhost:3001',
  },
  ENDPOINTS: {
      UPLOAD: '/api/upload-video',
      GET_VIDEOS: '/api/video-files',
      DELETE_VIDEO: '/api/video-files',
      HEALTH: '/api/health'
  },
  UPLOAD: {
      MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB
      ALLOWED_TYPES: [
          'video/mp4',
          'video/webm', 
          'video/ogg',
          'video/avi',
          'video/mov'
      ]
  }
};

// 서버 URL 가져오기 (기존 파일들과 동일한 구조)
export function getVideoServerUrl() {
  return VIDEO_UPLOAD_CONFIG.SERVER.HOST;
}

// API URL 가져오기 (기존 파일들과 동일한 구조)
export function getVideoApiUrl(endpoint, filename = '') {
  const baseUrl = getVideoServerUrl();
  
  if (endpoint === VIDEO_UPLOAD_CONFIG.ENDPOINTS.DELETE_VIDEO && filename) {
      return `${baseUrl}${endpoint}/${encodeURIComponent(filename)}`;
  }
  
  return `${baseUrl}${endpoint}`;
}

// 파일 검증 함수 (기존 파일들과 동일한 구조)
export function validateVideoFile(file) {
  const validTypes = VIDEO_UPLOAD_CONFIG.UPLOAD.ALLOWED_TYPES;
  const maxSize = VIDEO_UPLOAD_CONFIG.UPLOAD.MAX_FILE_SIZE;
  
  if (!validTypes.includes(file.type)) {
      return {
          isValid: false,
          error: `지원되지 않는 비디오 형식입니다. ${validTypes.join(', ')} 파일만 지원됩니다.`
      };
  }
  
  if (file.size > maxSize) {
      return {
          isValid: false,
          error: `파일 크기가 너무 큽니다. ${(maxSize / (1024 * 1024)).toFixed(0)}MB 이하의 파일만 업로드 가능합니다.`
      };
  }
  
  return { isValid: true };
}