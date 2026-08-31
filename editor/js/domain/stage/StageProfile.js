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

/** 공연 장르 — 프로젝트 생성/수정 폼 */
export const SHOW_GENRES = Object.freeze([
  '뮤지컬',
  '연극',
  '오페라',
  '발레',
  '무용',
  '콘서트',
  '클래식',
  '국악',
  '아동·가족',
  '기타',
]);

/**
 * 공연장소 + 규모 → stageProfile 프리셋
 * @type {ReadonlyArray<{ venue: string, scale: string, profileId: string }>}
 */
export const PROJECT_VENUE_GROUPS = Object.freeze([
  { venue: '대공연장', scale: '표준', profileId: 'grand-hall-standard' },
  { venue: '세종예술의전당', scale: '대공연장', profileId: 'sejong-grand' },
  { venue: '국립중앙박물관', scale: '극장 (용)', profileId: 'museum-yong' },
  { venue: '청양문화예술회관', scale: '대공연장', profileId: 'cheongyang-grand' },
  { venue: '예술의전당', scale: '오페라극장 (주무대)', profileId: 'sac-opera' },
]);

/** @returns {string[]} */
export function getProjectVenueNames() {
  return [...new Set(PROJECT_VENUE_GROUPS.map((g) => g.venue))];
}

/** @param {string} venue */
export function getProjectScalesForVenue(venue) {
  return PROJECT_VENUE_GROUPS.filter((g) => g.venue === venue);
}

/** @param {string} venue @param {string} scale */
export function getProjectVenueGroup(venue, scale) {
  return PROJECT_VENUE_GROUPS.find((g) => g.venue === venue && g.scale === scale) ?? null;
}

/** @param {string} profileId */
export function getProjectVenueGroupByProfileId(profileId) {
  return PROJECT_VENUE_GROUPS.find((g) => g.profileId === profileId) ?? PROJECT_VENUE_GROUPS[0];
}

/** @param {string} venue @param {string} scale */
export function formatProjectVenueLabel(venue, scale) {
  if (venue === '대공연장' && scale === '표준') return '대공연장 (표준)';
  return `${venue}/${scale}`;
}

/**
 * @param {{ stageProfile?: { id?: string } | null, venue?: string }} opts
 * @returns {{ venue: string, scale: string }}
 */
export function resolveProjectVenueInitial(opts = {}) {
  const { stageProfile, venue: venueText } = opts;
  if (stageProfile?.id) {
    const g = getProjectVenueGroupByProfileId(stageProfile.id);
    if (g) return { venue: g.venue, scale: g.scale };
  }
  if (venueText) {
    const slash = venueText.indexOf('/');
    if (slash > 0) {
      const v = venueText.slice(0, slash);
      const s = venueText.slice(slash + 1);
      const g = getProjectVenueGroup(v, s);
      if (g) return { venue: g.venue, scale: g.scale };
    }
    const byFull = PROJECT_VENUE_GROUPS.find(
      (g) => formatProjectVenueLabel(g.venue, g.scale) === venueText.trim(),
    );
    if (byFull) return { venue: byFull.venue, scale: byFull.scale };
  }
  const d = PROJECT_VENUE_GROUPS[0];
  return { venue: d.venue, scale: d.scale };
}

/** @param {string} venue @param {string} scale */
export function getStageProfileForVenueScale(venue, scale) {
  const group = getProjectVenueGroup(venue, scale);
  const preset = group ? getStageProfilePreset(group.profileId) : null;
  return preset ? { ...preset } : { ...DEFAULT_STAGE_PROFILE };
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
