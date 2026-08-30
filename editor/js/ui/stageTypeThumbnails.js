/** @type {Record<import('../domain/stage/StageTypes.js').StageTypeId, string>} */
export const STAGE_TYPE_THUMB_SVG = Object.freeze({
  proscenium: `
<svg viewBox="0 0 48 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M6 24h36v3H6z" fill="#3d4550"/>
  <path d="M10 24V13l4-4h20l4 4v11" stroke="#8a95a8" stroke-width="1.1" fill="rgba(55,62,74,0.55)"/>
  <path d="M14 9h20" stroke="#6f7a8c" stroke-width="0.9"/>
  <path d="M13 13q11-6 22 0" stroke="#b8c4d4" stroke-width="1.2" fill="none"/>
  <path d="M14 13v11M34 13v11" stroke="#6f7a8c" stroke-width="0.7" opacity="0.75"/>
  <path d="M10 24h28l-2 4H12z" fill="#4f5866" stroke="#7a8698" stroke-width="0.8"/>
  <path d="M8 27h32" stroke="#9aabbc" stroke-width="0.6" opacity="0.45"/>
</svg>`.trim(),
  arena: `
<svg viewBox="0 0 48 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="24" cy="17" rx="21" ry="11" stroke="#556070" stroke-width="0.7" opacity="0.45"/>
  <ellipse cx="24" cy="17" rx="16" ry="8" stroke="#556070" stroke-width="0.6" opacity="0.35"/>
  <ellipse cx="24" cy="17" rx="10.5" ry="6.5" fill="#4f5866" stroke="#8a95a8" stroke-width="1"/>
  <ellipse cx="24" cy="17" rx="5.5" ry="3.4" fill="rgba(90,100,115,0.35)" stroke="#9aabbc" stroke-width="0.6" opacity="0.7"/>
  <circle cx="24" cy="17" r="1.1" fill="#c8d4e4" opacity="0.75"/>
  <path d="M4 24q20-4 40 0" stroke="#6f7a8c" stroke-width="0.6" opacity="0.35"/>
</svg>`.trim(),
});

/**
 * @param {import('../domain/stage/StageTypes.js').StageTypeId} typeId
 * @param {string} label
 */
export function buildStageTypeButtonHtml(typeId, label) {
  const thumb = STAGE_TYPE_THUMB_SVG[typeId] ?? '';
  return `
    <span class="sb-stage-type-btn__thumb">${thumb}</span>
    <span class="sb-stage-type-btn__label">${label}</span>
  `.trim();
}
