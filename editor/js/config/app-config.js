/**
 * StageBuilder v4 — deployment config (PIVOT-compatible).
 *
 * LOCAL DEV (localhost):
 *   - Assets API → http://localhost:3000 only (v4 server/server.js)
 *   - Never connects to pivot.mhsoft.co.kr
 *   - Stage shell FBX → ../files/stage/ (relative, same local server)
 *
 * PIVOT deploy (pivot.mhsoft.co.kr/stageBuilder/):
 *   - Assets API → window.location.origin (same host)
 *   - Upload editor/ only; do not change pivot server.js
 *
 * Cloudflare Pages test (editor on *.pages.dev, API on Render 등):
 *   - Build injects window.__STAGEBUILDER_API__ = 'https://api.example.com'
 *   - Stage shell FBX → API /files/stage/
 *
 * Optional override:
 *   window.__STAGEBUILDER_API__ = 'http://127.0.0.1:3000'
 */

const LOCAL_DEV_DEFAULT = 'http://localhost:3000';

/** @param {string} url */
function isProductionPivotUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes('mhsoft.co.kr') || host.includes('pivot.');
  } catch {
    return /mhsoft\.co\.kr|pivot\./i.test(url);
  }
}

/** @param {string} hostname */
function isLocalDevHost(hostname) {
  if (!hostname) return true;
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

function resolveApiBaseUrl() {
  if (typeof window === 'undefined') {
    return LOCAL_DEV_DEFAULT;
  }

  const { hostname, origin, protocol } = window.location;
  const override = window.__STAGEBUILDER_API__;

  if (override) {
    const url = String(override).replace(/\/$/, '');
    if ((protocol === 'file:' || isLocalDevHost(hostname)) && isProductionPivotUrl(url)) {
      console.warn(
        '[StageBuilder] Local dev cannot use production PIVOT API. Using',
        LOCAL_DEV_DEFAULT,
      );
      return LOCAL_DEV_DEFAULT;
    }
    return url;
  }

  // file:// or unknown — treat as local dev
  if (protocol === 'file:' || isLocalDevHost(hostname)) {
    return LOCAL_DEV_DEFAULT;
  }

  // Same-origin deploy (e.g. pivot.mhsoft.co.kr/stageBuilder/)
  return origin;
}

export const API_BASE_URL = resolveApiBaseUrl();

/** True when editor runs on localhost / file:// — API locked to local server */
export const IS_LOCAL_DEV = typeof window !== 'undefined'
  && (window.location.protocol === 'file:' || isLocalDevHost(window.location.hostname));

/** User-uploaded media — Characters / Props / Audio / Video (Assets panel only) */
export const FILES_BASE = `${API_BASE_URL}/files`;

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${p}`;
}

/**
 * Resolve a user-asset path from API (`/files/fbx/foo.fbx`) to a fetch URL.
 * @param {string} path
 */
export function filesUrl(path) {
  if (!path) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    if (IS_LOCAL_DEV && isProductionPivotUrl(path)) {
      console.warn('[StageBuilder] Blocked production asset URL in local dev:', path);
      return path;
    }
    return path;
  }
  if (path.startsWith('/')) return apiUrl(path);
  return apiUrl(`/${path}`);
}

/**
 * Stage building shell FBX — served from API /files/stage/.
 * Same-origin (PIVOT) or remote API (Cloudflare Pages test).
 * @param {string} filename
 */
export function stageShellUrl(filename) {
  return `${FILES_BASE}/stage/${filename}`;
}

export const API = {
  health: '/api/health',
  uploadAudio: '/api/upload-audio',
  audioFiles: '/api/audio-files',
  deleteAudio: '/api/audio-files',
  uploadFbx: '/api/upload-fbx',
  fbxFiles: '/api/fbx-files',
  deleteFbx: '/api/fbx-files',
  uploadProp: '/api/upload-prop',
  propFiles: '/api/prop-files',
  deleteProp: '/api/prop-files',
  uploadVideo: '/api/upload-video',
  videoFiles: '/api/video-files',
  deleteVideo: '/api/video-files',
  projects: '/api/projects',
};

/** pivot/nginx/server.js has no prop API — client falls back to fbx routes on deploy */
export const PIVOT_LEGACY_ASSETS = Object.freeze({
  characterFilesPrefix: '/files/fbx/',
  propUploadUsesFbx: true,
});
