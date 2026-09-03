/**
 * Fixture type presets — 3×6 overhead rig.
 * Proscenium fit anchors to HOUSE FOH targets (v3 PROSCENIUM_RIG_REF), not full _Floor.
 */

export const FIXTURE_REACH = 70;
export const BEAM_REF_ANGLE = 16;

/** v3 fixtureTypes — max drives SpotLight intensity (× lightScale).
 * reach = SpotLight.distance · beamLen = visual cone (runtime ×1.5 for a bit more length)
 */
export const FIXTURE_RIG_TYPES = Object.freeze({
  mh: { rig: 'mh', label: 'Moving Head', reach: 150, beamLen: 66, zoom: 13, max: 175 },
  wash: { rig: 'wash', label: 'LED Wash', reach: 150, beamLen: 66, zoom: 24, max: 135 },
  spot: { rig: 'spot', label: 'Profile Spot', reach: 150, beamLen: 66, zoom: 12, max: 165 },
  cyc: { rig: 'cyc', label: 'Cyc Wash', reach: 150, beamLen: 66, zoom: 34, max: 120 },
});

/** 3 batten rows × 6 columns = 18 fixtures */
export const ROW_DEFS = Object.freeze([
  { grp: 'mh', type: 'Moving Head', rig: 'mh', name: 'MH', short: 'MH' },
  { grp: 'foh', type: 'LED Wash', rig: 'wash', name: 'FOH', short: 'FOH' },
  { grp: 'back', type: 'LED Wash', rig: 'wash', name: 'Back', short: 'BK' },
]);

export const RIG_MATRIX = Object.freeze({
  cols: 6,
  rows: 3,
  battenY: 30,
  spanX: 68.6,
  spanZ: 66,
  /** v3 local Z — tighter than earlier 0.36/-0.40 */
  zFront: 0.18,
  zBack: -0.32,
});

/**
 * Proscenium acting zone (v3) — FOH targets anchor Z; width follows stage floor.
 */
export const PROSCENIUM_RIG_REF = Object.freeze({
  centerX: 4,
  centerZ: 10,
  centerZOffset: 16,
  spanX: 172,
  spanZ: 88,
  worldBattenY: 122,
});

export const RIG_FIT = Object.freeze({
  overheadRatio: 0.055,
  minOverheadWorld: 16,
  ceilingRatio: 0.50,
  /** Mid-high truss — was 0.24 (too low) / earlier 0.62 (too high) */
  battenHeightRatio: 0.38,
  minBattenHeightRatio: 0.28,
  /**
   * Lateral span vs acting zone. FOH spread drives fit; floor ratio is fallback only.
   */
  widthRatio: 0.62,
  /** Stage depth used around FOH aim (of floor depth), biased upstage */
  depthRatio: 0.48,
  minScale: 0.35,
  maxScale: 8,
});

export const STAGE_FRONT_SPOT_NAMES = Object.freeze([
  '_StageFrontSpot_L',
  '_StageFrontSpot_C',
  '_StageFrontSpot_R',
]);

/** Local Z of row r (0=MH front … last=Back), matching buildFixtureMatrix */
export function rigRowLocalZ(rowIndex, cfg = RIG_MATRIX) {
  const zHi = cfg.spanZ * (cfg.zFront ?? 0.5);
  const zLo = cfg.spanZ * (cfg.zBack ?? -0.5);
  if (cfg.rows <= 1) return 0;
  return zHi - rowIndex * ((zHi - zLo) / (cfg.rows - 1));
}

/** Full local Z span covered by the 3 battens */
export function rigLocalZExtent(cfg = RIG_MATRIX) {
  return Math.abs(rigRowLocalZ(0, cfg) - rigRowLocalZ(cfg.rows - 1, cfg));
}

export function rigFixtureCount() {
  return RIG_MATRIX.cols * RIG_MATRIX.rows;
}

/** grandMA3-style fixture IDs: 11–16, 21–26, 31–36 */
export function fixtureFidFromRowCol(r, c) {
  return (r + 1) * 10 + (c + 1);
}

export function parseFixtureFidFromGroup(group) {
  const m = String(group || '').match(/^light:fx:(\d+)(?::ai)?$/);
  return m ? Number(m[1]) : null;
}

/** @param {string} group */
export function isAiFollowGroup(group) {
  return /^light:fx:\d+:ai$/.test(String(group || ''));
}

export function fixtureTrackGroup(fid) {
  return `light:fx:${fid}`;
}

/** AI follow 전용 트랙 group */
export function fixtureAiTrackGroup(fid) {
  return `light:fx:${fid}:ai`;
}

/**
 * @param {Partial<{
 *   dim: number, pan: number, tilt: number, zoom: number, focus: number,
 *   r: number, g: number, b: number, cto: number, strobe: number,
 *   iris: number, prism: number, gobo: number,
 * }>} [overrides]
 */
export function mkFixtureAttr(overrides = {}) {
  return Object.assign(
    {
      dim: 0,
      pan: 0,
      tilt: 35,
      zoom: 16,
      focus: 35,
      r: 1,
      g: 1,
      b: 1,
      cto: 0,
      strobe: 0,
      iris: 100,
      prism: 0,
      gobo: 0,
    },
    overrides,
  );
}
