/**
 * StageBuilder v4 — single source for API base URL.
 * Change ONLY this file (or window.__STAGEBUILDER_API__) to switch local ↔ production.
 */

const LOCAL_DEV_DEFAULT = 'http://localhost:3000';

function resolveApiBaseUrl() {
  if (typeof window !== 'undefined' && window.__STAGEBUILDER_API__) {
    return String(window.__STAGEBUILDER_API__).replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return LOCAL_DEV_DEFAULT;
    }
    return window.location.origin;
  }

  return LOCAL_DEV_DEFAULT;
}

export const API_BASE_URL = resolveApiBaseUrl();

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${p}`;
}

export const API = {
  health: '/api/health',
  uploadAudio: '/api/upload-audio',
  audioFiles: '/api/audio-files',
  deleteAudio: '/api/audio-files',
  uploadFbx: '/api/upload-fbx',
  fbxFiles: '/api/fbx-files',
  deleteFbx: '/api/fbx-files',
  uploadVideo: '/api/upload-video',
  videoFiles: '/api/video-files',
  deleteVideo: '/api/video-files',
  projects: '/api/projects',
};

export const FILES_BASE = `${API_BASE_URL}/files`;
