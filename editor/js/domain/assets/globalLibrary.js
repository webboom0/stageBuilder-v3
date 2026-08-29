import { API, apiUrl, filesUrl } from '../../config/app-config.js';

/** @typedef {'character' | 'stage' | 'video' | 'audio'} AssetsTab */

/**
 * Shared server library under `files/` (fbx·characters, props, video, music).
 * Procedural samples (WalkLite, box/cylinder) are excluded.
 *
 * @param {AssetsTab} tab
 * @returns {Promise<Array<{
 *   url: string,
 *   path: string,
 *   name: string,
 *   displayName: string,
 *   filename: string,
 * }>>}
 */
export async function loadGlobalLibrary(tab) {
  if (tab === 'character') {
    return fetchLibraryList(API.fbxFiles);
  }
  if (tab === 'stage') {
    try {
      const res = await fetch(apiUrl(API.propFiles), { credentials: 'include' });
      if (!res.ok) return [];
      const files = await res.json();
      return mapLibraryFiles(Array.isArray(files) ? files : [], '/files/props/');
    } catch {
      return [];
    }
  }
  if (tab === 'video') {
    return fetchLibraryList(API.videoFiles, '/files/video/');
  }
  return fetchLibraryList(API.audioFiles, '/files/music/');
}

/**
 * @param {string} listPath
 * @param {string} [fallbackPrefix]
 */
async function fetchLibraryList(listPath, fallbackPrefix = '/files/fbx/') {
  try {
    const res = await fetch(apiUrl(listPath), { credentials: 'include' });
    if (!res.ok) return [];
    const files = await res.json();
    return mapLibraryFiles(Array.isArray(files) ? files : [], fallbackPrefix);
  } catch {
    return [];
  }
}

/**
 * @param {any[]} files
 * @param {string} fallbackPrefix
 */
function mapLibraryFiles(files, fallbackPrefix) {
  return files.map((f) => {
    const filename = f.filename || f.name || '';
    const path = f.path || `${fallbackPrefix}${filename}`;
    const url = path.startsWith('http') ? path : filesUrl(path);
    const label = (f.displayName || f.name || filename).replace(/\.[^.]+$/, '');
    return {
      url,
      path,
      name: label,
      displayName: f.displayName || f.name || filename,
      filename,
    };
  }).filter((f) => f.filename);
}

/** @param {AssetsTab} tab */
export function libraryFolderHint(tab) {
  if (tab === 'character') return 'files/fbx · files/characters';
  if (tab === 'stage') return 'files/props';
  if (tab === 'video') return 'files/video';
  return 'files/music';
}
