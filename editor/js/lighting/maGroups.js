import { fixtureFidFromRowCol, RIG_MATRIX } from "./fixtureTypes.js";

/** 3×6 리그 기본 그룹 (cosmos grandMA3 스타일) */
export function buildDefaultMaGroups(fixtures = []) {
  const byGrp = (g) => fixtures.filter((f) => f.grp === g).map((f) => f.fid);
  const rowIds = (r) => {
    const ids = [];
    for (let c = 0; c < RIG_MATRIX.cols; c++) {
      ids.push(fixtureFidFromRowCol(r, c));
    }
    return ids.filter((id) => fixtures.some((f) => f.fid === id));
  };

  return {
    1: { name: "Moving Heads", ids: byGrp("mh").length ? byGrp("mh") : rowIds(0) },
    2: { name: "FOH Wash", ids: byGrp("foh").length ? byGrp("foh") : rowIds(1) },
    3: { name: "Back Wash", ids: byGrp("back").length ? byGrp("back") : rowIds(2) },
    4: { name: "All", ids: fixtures.map((f) => f.fid) },
    5: { name: "Odd Cols", ids: fixtures.filter((_, i) => i % 2 === 0).map((f) => f.fid) },
    6: { name: "Even Cols", ids: fixtures.filter((_, i) => i % 2 === 1).map((f) => f.fid) },
  };
}

export const COLOR_PRESETS = {
  1: { name: "Warm", r: 1, g: 0.72, b: 0.42 },
  2: { name: "Cool", r: 0.62, g: 0.78, b: 1 },
  3: { name: "Blue", r: 0.16, g: 0.34, b: 1 },
  4: { name: "White", r: 1, g: 1, b: 1 },
};
