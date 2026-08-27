import { API, apiUrl, filesUrl } from '../../config/app-config.js';
import { DEFAULT_STAGE_MESH_SAMPLES } from './stageMeshPrimitives.js';

/**
 * Stage props catalog.
 * v4 dev server: `/api/prop-files` → `files/props/`
 * PIVOT (legacy): no prop API — returns [] until server adds routes.
 *
 * @returns {Promise<Array<{
 *   url: string,
 *   name: string,
 *   displayName: string,
 *   filename: string,
 *   procedural?: string,
 *   color?: number,
 *   deletable: boolean,
 * }>>}
 */
export async function loadPropCatalog() {
  const samples = DEFAULT_STAGE_MESH_SAMPLES.map((s) => ({
    url: s.path,
    name: s.name,
    displayName: s.displayName,
    filename: s.filename,
    procedural: s.procedural,
    color: s.color,
    deletable: false,
  }));

  try {
    const res = await fetch(apiUrl(API.propFiles), { credentials: 'include' });
    if (res.status === 404) return samples;
    if (!res.ok) return samples;
    const files = await res.json();
    if (!Array.isArray(files)) return samples;
    return [...samples, ...mapPropFiles(files, '/files/props/')];
  } catch {
    return samples;
  }
}

/**
 * @param {any[]} files
 * @param {string} defaultPrefix
 */
function mapPropFiles(files, defaultPrefix) {
  return files.map((f) => {
    const filename = f.filename || f.name || '';
    const label = (f.displayName || f.name || filename).replace(/\.(fbx|obj)$/i, '');
    const path = f.path || `${defaultPrefix}${filename}`;
    const url = path.startsWith('http') ? path : filesUrl(path);
    return {
      url,
      name: label,
      displayName: label,
      filename,
      deletable: true,
    };
  });
}

/** @returns {Promise<boolean>} */
export async function probePropApiAvailable() {
  try {
    const res = await fetch(apiUrl(API.propFiles), { credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}
