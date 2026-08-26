/**
 * Stage profile — meters (W × D), origin center.
 *
 * v3 FBX + floor geometry is authored at V3_FBX_REFERENCE (20×22.5m = scale 1.0×).
 * User-facing defaults follow typical 국내 대공연장 규격 (가로 15~20m, 깊이 10~14.5m).
 */

/** @internal v3 VideoEdit floor / building shell — do not change without remeasuring FBX */
export const V3_FBX_REFERENCE = Object.freeze({
  widthM: 20,
  depthM: 22.5,
});

/** @deprecated use V3_FBX_REFERENCE — kept for imports */
export const SAC_OPERA_DEFAULT = Object.freeze({
  id: 'sac-opera',
  name: '예술의전당 오페라극장 (주무대)',
  widthM: 20,
  depthM: 22.5,
  areaM2: 450,
  heightM: 12,
  prosceniumWidthM: 20,
  origin: 'center',
  humanHeightM: 1.7,
  unit: 'meter',
});

/** Typical grand hall — 청양·세종급 프로시니엄 16m, 깊이 13.5m */
export const GRAND_HALL_DEFAULT = Object.freeze({
  id: 'grand-hall-standard',
  name: '대공연장 (표준)',
  widthM: 16,
  depthM: 13.5,
  areaM2: 216,
  heightM: 9.5,
  prosceniumWidthM: 16,
  prosceniumHeightM: 9.5,
  origin: 'center',
  humanHeightM: 1.7,
  unit: 'meter',
});

export const DEFAULT_STAGE_PROFILE = GRAND_HALL_DEFAULT;

/**
 * Real-world hall presets (W × D × 프로시니엄 H where known).
 * @type {ReadonlyArray<typeof GRAND_HALL_DEFAULT>}
 */
export const STAGE_PROFILE_PRESETS = Object.freeze([
  GRAND_HALL_DEFAULT,
  Object.freeze({
    id: 'sejong-grand',
    name: '세종예술의전당 대공연장',
    widthM: 16,
    depthM: 12,
    areaM2: 192,
    heightM: 10,
    prosceniumWidthM: 16,
    prosceniumHeightM: 10,
    origin: 'center',
    humanHeightM: 1.7,
    unit: 'meter',
  }),
  Object.freeze({
    id: 'museum-yong',
    name: '국립중앙박물관 극장 (용)',
    widthM: 15,
    depthM: 14.5,
    areaM2: 217.5,
    heightM: 8,
    prosceniumWidthM: 15,
    prosceniumHeightM: 8,
    origin: 'center',
    humanHeightM: 1.7,
    unit: 'meter',
  }),
  Object.freeze({
    id: 'cheongyang-grand',
    name: '청양문화예술회관 대공연장',
    widthM: 16,
    depthM: 13.5,
    areaM2: 216,
    heightM: 7.48,
    prosceniumWidthM: 16,
    prosceniumHeightM: 7.48,
    origin: 'center',
    humanHeightM: 1.7,
    unit: 'meter',
  }),
  SAC_OPERA_DEFAULT,
]);

/** @param {string} id */
export function getStageProfilePreset(id) {
  return STAGE_PROFILE_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * @param {Partial<typeof GRAND_HALL_DEFAULT>} overrides
 */
export function createStageProfile(overrides = {}) {
  const widthM = overrides.widthM ?? GRAND_HALL_DEFAULT.widthM;
  const depthM = overrides.depthM ?? GRAND_HALL_DEFAULT.depthM;
  return Object.freeze({
    ...GRAND_HALL_DEFAULT,
    ...overrides,
    widthM,
    depthM,
    areaM2: overrides.areaM2 ?? widthM * depthM,
  });
}

/**
 * @param {typeof GRAND_HALL_DEFAULT} profile
 */
export function validateStageProfile(profile) {
  if (!profile || profile.widthM <= 0 || profile.depthM <= 0) {
    throw new Error('StageProfile widthM and depthM must be positive');
  }
  return profile;
}
