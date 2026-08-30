/** @typedef {'character' | 'stage' | 'video' | 'audio'} AssetsTab */

import { loadGlobalLibrary } from '../../domain/assets/globalLibrary.js';

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.ogg', '.avi']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);

/** @param {string} name */
function fileExt(name) {
  const i = String(name).lastIndexOf('.');
  if (i < 0) return '';
  return String(name).slice(i).toLowerCase();
}

/** @param {string} name */
function baseName(name) {
  return String(name).replace(/\.[^.]+$/, '').toLowerCase().trim();
}

/**
 * @param {{ kind: string, label: string, detail?: string }} warning
 * @returns {AssetsTab}
 */
export function assetsTabForWarning(warning) {
  const label = String(warning.label || '');
  const ext = fileExt(label);

  if (warning.kind === 'audio') return 'audio';
  if (warning.kind === 'video') return 'video';

  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (ext === '.obj') return 'stage';

  if (warning.kind === 'motion' || warning.kind === 'character') return 'character';
  return 'character';
}

/**
 * @param {string} uploadedName
 * @param {{ kind: string, label: string, detail?: string }} warning
 */
export function warningMatchesUploadedFile(uploadedName, warning) {
  const up = String(uploadedName || '').toLowerCase();
  const label = String(warning.label || '').toLowerCase();
  if (!up || !label) return false;
  if (up === label) return true;
  if (baseName(up) === baseName(label)) return true;
  const detail = String(warning.detail || '').toLowerCase();
  return detail.includes(up) || detail.includes(label);
}

/** @param {{ kind: string, label: string, detail?: string }} warning */
function warningFilenameCandidates(warning) {
  const out = new Set();
  const label = String(warning.label || '').trim();
  const detail = String(warning.detail || '');
  if (label) {
    out.add(label.toLowerCase());
    out.add(baseName(label));
  }
  const m = detail.match(/파일 없음\s*[—-]\s*(.+)$/i)
    || detail.match(/\/([^/?#"']+\.[^/?#"']+)/);
  if (m?.[1]) {
    try {
      const fn = decodeURIComponent(m[1]).trim();
      out.add(fn.toLowerCase());
      out.add(baseName(fn));
    } catch {
      out.add(String(m[1]).trim().toLowerCase());
      out.add(baseName(m[1]));
    }
  }
  return [...out].filter(Boolean);
}

/**
 * @param {{ kind: string, label: string, detail?: string }} warning
 * @param {Array<{ filename?: string, displayName?: string, name?: string }>} libItems
 */
export function findLibraryMatch(warning, libItems) {
  const wants = warningFilenameCandidates(warning);
  if (!wants.length || !libItems?.length) return null;
  for (const it of libItems) {
    const fn = String(it.filename || '').toLowerCase();
    const dn = String(it.displayName || it.name || '').toLowerCase();
    const fnBase = baseName(fn);
    const dnBase = baseName(dn);
    if (wants.some((w) => w === fn || w === fnBase || w === dn || w === dnBase)) {
      return it;
    }
  }
  return null;
}

/**
 * @param {Array<{ kind: string, label: string, detail?: string }>} warnings
 */
export async function enrichWarningsWithLibraryHints(warnings) {
  /** @type {Map<AssetsTab, any[]>} */
  const libCache = new Map();
  const tabs = [...new Set(warnings.map((w) => assetsTabForWarning(w)))];
  await Promise.all(tabs.map(async (tab) => {
    try {
      libCache.set(tab, await loadGlobalLibrary(tab));
    } catch {
      libCache.set(tab, []);
    }
  }));

  return warnings.map((w) => {
    const assetsTab = assetsTabForWarning(w);
    const lib = libCache.get(assetsTab) || [];
    const match = findLibraryMatch(w, lib);
    return {
      ...w,
      assetsTab,
      inLibrary: !!match,
      libraryFilename: match?.filename || null,
    };
  });
}
