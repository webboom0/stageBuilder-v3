/**
 * Collect warnings while loading a scene (Phase 6 load report).
 */
import { collectManifestAssets } from './SceneDocument.js';
import { resolveProjectAssetUrl } from './projectPaths.js';

export function createSceneLoadReport() {
  /** @type {Array<{ kind: string, label: string, detail?: string }>} */
  const warnings = [];

  return {
    /** @param {string} kind @param {string} label @param {string} [detail] */
    addWarning(kind, label, detail) {
      warnings.push({ kind, label, detail: detail || undefined });
    },
    get warnings() {
      return [...warnings];
    },
    hasIssues() {
      return warnings.length > 0;
    },
  };
}

/**
 * HEAD-check asset URLs referenced in scene doc.
 * @param {string} projectId
 * @param {object} doc
 * @param {ReturnType<typeof createSceneLoadReport>} report
 */
export async function verifySceneAssets(projectId, doc, report) {
  const paths = collectManifestAssets(doc);

  await Promise.all(paths.map(async (relPath) => {
    const label = String(relPath || '').split('/').pop() || relPath;
    if (!relPath || String(relPath).startsWith('procedural')) return;
    if (String(relPath).startsWith('blob:')) {
      report.addWarning('audio', label, 'blob URL — 저장되지 않은 임시 경로');
      return;
    }
    let url;
    try {
      url = resolveProjectAssetUrl(projectId, relPath);
    } catch (err) {
      report.addWarning('asset', label, err.message || '경로 해석 실패');
      return;
    }
    try {
      const res = await fetch(url, { method: 'HEAD', credentials: 'include' });
      if (!res.ok) {
        report.addWarning('asset', label, `파일 없음 (HTTP ${res.status})`);
      }
    } catch (err) {
      report.addWarning('asset', label, err.message || '접근 실패');
    }
  }));
}
