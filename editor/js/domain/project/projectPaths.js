import { apiUrl, filesUrl } from '../../config/app-config.js';

/** @typedef {'characters' | 'props' | 'audio' | 'video'} ProjectAssetKind */

/**
 * @param {string} projectId
 * @param {ProjectAssetKind} kind
 */
export function projectAssetsApiBase(projectId, kind) {
  return `/api/projects/${encodeURIComponent(projectId)}/assets/${kind}`;
}

/**
 * Public URL for a project asset (absolute path or relative assets/…).
 * @param {string} projectId
 * @param {string} relOrAbs — assets/audio/foo.mp3 or /files/projects/id/assets/…
 */
export function resolveProjectAssetUrl(projectId, relOrAbs) {
  const p = String(relOrAbs || '').trim();
  if (!p) return p;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  if (p.startsWith('/files/projects/')) return filesUrl(p);
  if (p.startsWith('files/projects/')) return filesUrl(`/${p}`);
  if (p.startsWith('assets/')) {
    return filesUrl(`/files/projects/${projectId}/${p}`);
  }
  return filesUrl(p);
}

/**
 * Normalize stored path to project-relative assets/… form.
 * @param {string} projectId
 * @param {string} path
 */
export function toProjectRelPath(projectId, path) {
  const p = String(path || '').trim();
  if (!p) return p;
  const prefix = `/files/projects/${projectId}/`;
  if (p.startsWith(prefix)) return p.slice(prefix.length);
  if (p.startsWith(`files/projects/${projectId}/`)) {
    return p.slice(`files/projects/${projectId}/`.length);
  }
  if (p.startsWith('assets/')) return p;
  // legacy global paths — keep as-is for load report
  return p;
}

/** @param {string} path */
export function isProjectScopedPath(path) {
  return /^assets\//.test(path) || /\/files\/projects\//.test(path);
}

/**
 * @param {string} projectId
 * @param {ProjectAssetKind} kind
 * @param {string} filename
 */
export function projectAssetRelPath(kind, filename) {
  const folder = kind === 'props' ? 'props' : kind;
  return `assets/${folder}/${filename}`;
}

export { apiUrl };
