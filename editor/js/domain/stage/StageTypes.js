/** @typedef {'proscenium' | 'arena'} StageTypeId */

/** @type {Record<StageTypeId, { label: string; description: string }>} */
export const STAGE_TYPES = Object.freeze({
  proscenium: {
    label: '프로시니엄',
    description: '배경·측면 프레임 (바닥·원점 동일)',
  },
  arena: {
    label: '아레나',
    description: '개방형 배경 (바닥·원점 동일)',
  },
});

/** @param {string} id @returns {StageTypeId} */
export function normalizeStageType(id) {
  return id === 'arena' ? 'arena' : 'proscenium';
}
