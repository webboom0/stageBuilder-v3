import { fixtureFidFromRowCol, RIG_MATRIX } from './fixtureTypes.js';

/**
 * v3-style default fixture groups (MH / FOH / Back / All / Odd / Even).
 * @param {Array<{ fid: number, grp?: string }>} fixtures
 */
export function buildDefaultFixtureGroups(fixtures = []) {
  const byGrp = (g) => fixtures.filter((f) => f.grp === g).map((f) => f.fid);
  const rowIds = (r) => {
    const ids = [];
    for (let c = 0; c < RIG_MATRIX.cols; c++) {
      ids.push(fixtureFidFromRowCol(r, c));
    }
    return ids.filter((id) => fixtures.some((f) => f.fid === id));
  };

  return {
    1: { name: 'Moving Heads', ids: byGrp('mh').length ? byGrp('mh') : rowIds(0) },
    2: { name: 'FOH Wash', ids: byGrp('foh').length ? byGrp('foh') : rowIds(1) },
    3: { name: 'Back Wash', ids: byGrp('back').length ? byGrp('back') : rowIds(2) },
    4: { name: 'All', ids: fixtures.map((f) => f.fid) },
    5: { name: 'Odd Cols', ids: fixtures.filter((_, i) => i % 2 === 0).map((f) => f.fid) },
    6: { name: 'Even Cols', ids: fixtures.filter((_, i) => i % 2 === 1).map((f) => f.fid) },
  };
}
