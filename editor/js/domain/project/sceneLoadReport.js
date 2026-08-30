/**
 * Collect warnings while loading a scene (Phase 6 load report).
 */
import { collectManifestAssets } from './SceneDocument.js';
import { resolveProjectAssetUrl } from './projectPaths.js';

/** @param {string} label @param {string} [detail] */
function missingFileKey(label, detail) {
  const d = String(detail || '');
  if (!d.includes('404') && !d.includes('파일 없음') && !d.includes('Not Found')) return null;
  const base = String(label).replace(/\.[^.]+$/i, '').toLowerCase().trim();
  return base || null;
}

/** @param {string} [detail] */
export function formatLoadWarningDetail(detail) {
  if (!detail) return undefined;
  const d = String(detail);
  if (d.includes('404') || d.includes('Not Found') || d.includes('파일 없음')) {
    const m = d.match(/\/([^/?#"']+\.[^/?#"']+)/);
    if (m) {
      try {
        return `파일 없음 — ${decodeURIComponent(m[1])}`;
      } catch {
        return `파일 없음 — ${m[1]}`;
      }
    }
    return '파일 없음 (HTTP 404)';
  }
  if (d.length > 96) return `${d.slice(0, 93)}…`;
  return d;
}

export function createSceneLoadReport() {
  /** @type {Array<{ kind: string, label: string, detail?: string, _mk?: string }>} */
  const warnings = [];

  return {
    /** @param {string} kind @param {string} label @param {string} [detail] */
    addWarning(kind, label, detail) {
      const formatted = formatLoadWarningDetail(detail);
      const mk = missingFileKey(label, detail || formatted);
      if (mk && warnings.some((w) => w._mk === mk)) return;
      const dup = warnings.find((w) => w.kind === kind && w.label === label && w.detail === formatted);
      if (dup) return;
      warnings.push({ kind, label, detail: formatted, _mk: mk || undefined });
    },
    get warnings() {
      return warnings.map(({ kind, label, detail }) => ({ kind, label, detail }));
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
