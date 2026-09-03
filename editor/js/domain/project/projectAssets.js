import { apiUrl, filesUrl } from '../../config/app-config.js';
import { readHttpUploadError } from '../assets/uploadError.js';
import { projectAssetsApiBase, resolveProjectAssetUrl } from './projectPaths.js';
import { DEFAULT_MOTION_SAMPLES } from '../motion/motionCatalog.js';
import { DEFAULT_STAGE_MESH_SAMPLES } from '../motion/stageMeshPrimitives.js';

/** @typedef {'character' | 'stage' | 'video' | 'audio'} AssetsTab */

/** @param {AssetsTab} tab */
function kindForTab(tab) {
  if (tab === 'character') return 'characters';
  if (tab === 'stage') return 'props';
  if (tab === 'video') return 'video';
  return 'audio';
}

/**
 * @param {string} projectId
 * @param {AssetsTab} tab
 */
export async function loadProjectAssets(projectId, tab) {
  const kind = kindForTab(tab);
  const res = await fetch(apiUrl(projectAssetsApiBase(projectId, kind)), {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('프로젝트 에셋 목록을 불러오지 못했습니다.');
  const files = await res.json();
  const server = (Array.isArray(files) ? files : []).map((f) => {
    const rel = f.relPath || f.path?.replace(`/files/projects/${projectId}/`, '') || '';
    const relNorm = rel.replace(/^\/+/, '');
    const serverPath = f.path?.startsWith('/files/projects/')
      ? f.path
      : (relNorm.startsWith('assets/')
        ? `/files/projects/${projectId}/${relNorm}`
        : (f.path || relNorm));
    const url = resolveProjectAssetUrl(projectId, relNorm || f.path);
    const label = (f.displayName || f.name || f.filename || '').replace(/\.[^.]+$/, '');
    return {
      url,
      path: serverPath,
      name: label,
      displayName: label,
      filename: f.filename,
      deletable: true,
    };
  });

  if (tab === 'character') {
    const onServer = new Set(server.map((f) => String(f.filename || '').toLowerCase()));
    const samples = DEFAULT_MOTION_SAMPLES.filter(
      (s) => !onServer.has(s.filename.toLowerCase()),
    ).map((s) => ({
      url: s.path,
      path: s.path,
      name: s.name,
      displayName: s.displayName,
      filename: s.filename,
      procedural: s.procedural,
      deletable: false,
    }));
    return [...samples, ...server];
  }

  if (tab === 'stage') {
    const samples = DEFAULT_STAGE_MESH_SAMPLES.map((s) => ({
      url: s.path,
      path: s.path,
      name: s.name,
      displayName: s.displayName,
      filename: s.filename,
      procedural: s.procedural,
      color: s.color,
      deletable: false,
    }));
    return [...samples, ...server];
  }

  return server;
}

/**
 * @param {string} projectId
 * @param {AssetsTab} tab
 * @param {File} file
 */
export async function uploadProjectAsset(projectId, tab, file) {
  const kind = kindForTab(tab);
  const field = kind === 'characters' ? 'fbxFile'
    : kind === 'props' ? 'propFile'
      : kind === 'audio' ? 'audioFile'
        : 'video';
  const fd = new FormData();
  fd.append(field, file);
  const res = await fetch(apiUrl(`${projectAssetsApiBase(projectId, kind)}`), {
    method: 'POST',
    body: fd,
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(await readHttpUploadError(res));
  }
  return res.json();
}

/**
 * @param {string} projectId
 * @param {AssetsTab} tab
 * @param {string} filename
 */
export async function deleteProjectAsset(projectId, tab, filename) {
  const kind = kindForTab(tab);
  const res = await fetch(
    apiUrl(`${projectAssetsApiBase(projectId, kind)}/${encodeURIComponent(filename)}`),
    { method: 'DELETE', credentials: 'include' },
  );
  if (!res.ok) throw new Error('삭제 실패');
}

/**
 * Copy a file from shared library (`files/fbx`, `props`, `video`, `music`) into project assets.
 * @param {string} projectId
 * @param {AssetsTab} tab
 * @param {string} filename library filename (basename)
 */
export async function importProjectAssetFromLibrary(projectId, tab, filename) {
  const kind = kindForTab(tab);
  const res = await fetch(
    apiUrl(`${projectAssetsApiBase(projectId, kind)}/import-library`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ filename }),
    },
  );
  if (!res.ok) {
    let msg = '라이브러리 가져오기 실패';
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

export { filesUrl };
