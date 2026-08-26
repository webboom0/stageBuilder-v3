import { API, apiUrl } from '../../config/app-config.js';
import { WALK_LITE_PROCEDURAL_ID } from './walkLitePerformer.js';

/**
 * Motion catalog — v3 style: one WalkLite sample + server FBX.
 * Tint color is set in Properties, not via multiple sample variants.
 */
export const DEFAULT_MOTION_SAMPLES = [
  {
    path: `procedural://${WALK_LITE_PROCEDURAL_ID}`,
    name: 'WalkLite',
    displayName: 'WalkLite (경량)',
    filename: 'WalkLite.fbx',
    procedural: WALK_LITE_PROCEDURAL_ID,
  },
];

/**
 * @returns {Promise<Array<{
 *   url: string,
 *   name: string,
 *   displayName: string,
 *   filename: string,
 *   procedural?: string,
 *   deletable: boolean,
 * }>>}
 */
export async function loadMotionCatalog() {
  /** @type {any[]} */
  let server = [];
  try {
    const res = await fetch(apiUrl(API.fbxFiles), { credentials: 'include' });
    if (res.ok) {
      const files = await res.json();
      if (Array.isArray(files)) {
        server = files.map((f) => {
          const filename = f.filename || f.name || '';
          const label = (f.displayName || f.name || filename).replace(/\.fbx$/i, '');
          const path = f.path || `/files/fbx/${filename}`;
          const url = path.startsWith('http') ? path : apiUrl(path);
          return {
            url,
            name: label,
            displayName: label,
            filename,
            deletable: true,
          };
        });
      }
    }
  } catch {
    /* offline — sample only */
  }

  const onServer = new Set(server.map((f) => String(f.filename || '').toLowerCase()));
  const samples = DEFAULT_MOTION_SAMPLES.filter((s) => !onServer.has(s.filename.toLowerCase())).map((s) => ({
    url: s.path,
    name: s.name,
    displayName: s.displayName,
    filename: s.filename,
    procedural: s.procedural,
    deletable: false,
  }));

  return [...samples, ...server];
}
