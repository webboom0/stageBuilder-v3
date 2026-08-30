/** Drag-and-drop MIME for Assets → timeline (Characters / Stage). */
export const ASSET_DRAG_MIME = 'application/x-stagebuilder-asset';
/** @deprecated use {@link ASSET_DRAG_MIME} */
export const STAGE_ASSET_DRAG_MIME = ASSET_DRAG_MIME;

/**
 * @param {DataTransfer} dt
 * @returns {boolean}
 */
export function hasAssetDrag(dt) {
  return dt?.types?.includes?.(ASSET_DRAG_MIME) ?? false;
}

/** @deprecated use {@link hasAssetDrag} */
export const hasStageAssetDrag = hasAssetDrag;

/**
 * @param {'character' | 'stage'} kind
 * @param {{
 *   url?: string,
 *   name?: string,
 *   displayName?: string,
 *   filename?: string,
 *   procedural?: string,
 *   color?: number,
 * }} entry
 * @returns {string}
 */
export function serializeAssetDrag(kind, entry) {
  return JSON.stringify({
    kind: kind === 'stage' ? 'stage' : 'character',
    url: entry.url,
    name: entry.displayName || entry.name,
    procedural: entry.procedural,
    color: entry.color,
    filename: entry.filename,
  });
}

/**
 * @param {{
 *   url?: string,
 *   name?: string,
 *   displayName?: string,
 *   filename?: string,
 *   procedural?: string,
 *   color?: number,
 * }} entry
 * @returns {string}
 */
export function serializeStageAssetDrag(entry) {
  return serializeAssetDrag('stage', entry);
}

/**
 * @param {{
 *   url?: string,
 *   name?: string,
 *   displayName?: string,
 *   filename?: string,
 *   procedural?: string,
 *   color?: number,
 * }} entry
 * @returns {string}
 */
export function serializeCharacterAssetDrag(entry) {
  return serializeAssetDrag('character', entry);
}

/**
 * @param {string} raw
 * @returns {{
 *   kind: 'character' | 'stage',
 *   url?: string,
 *   name?: string,
 *   procedural?: string,
 *   color?: number,
 *   filename?: string,
 * } | null}
 */
export function parseAssetDrag(raw) {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data?.name && !data?.url && !data?.procedural) return null;
    return {
      kind: data.kind === 'stage' ? 'stage' : 'character',
      url: data.url,
      name: data.name,
      procedural: data.procedural,
      color: data.color,
      filename: data.filename,
    };
  } catch {
    return null;
  }
}

/** @param {string} raw */
export function parseStageAssetDrag(raw) {
  const parsed = parseAssetDrag(raw);
  if (!parsed) return null;
  const { kind, ...entry } = parsed;
  return entry;
}

/** Drag-and-drop MIME for Assets → trash delete. */
export const ASSET_DELETE_DRAG_MIME = 'application/x-stagebuilder-asset-delete';

/**
 * @param {DataTransfer} dt
 * @returns {boolean}
 */
export function hasAssetDeleteDrag(dt) {
  return dt?.types?.includes?.(ASSET_DELETE_DRAG_MIME) ?? false;
}

/**
 * @param {{
 *   url?: string,
 *   name?: string,
 *   displayName?: string,
 *   filename?: string,
 * }} entry
 * @returns {string}
 */
export function serializeAssetDeleteDrag(entry) {
  return JSON.stringify({
    key: entry.filename || entry.url || entry.name || '',
    filename: entry.filename,
    url: entry.url,
    name: entry.displayName || entry.name,
  });
}

/**
 * @param {string} raw
 * @returns {{ key: string, filename?: string, url?: string, name?: string } | null}
 */
export function parseAssetDeleteDrag(raw) {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const key = data?.key || data?.filename || data?.url;
    if (!key) return null;
    return {
      key: String(key),
      filename: data.filename,
      url: data.url,
      name: data.name,
    };
  } catch {
    return null;
  }
}
