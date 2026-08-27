/** Timeline domain constants — absolute seconds on the time axis */

export const INTERPOLATION = Object.freeze({
  LINEAR: 0,
  STEP: 1,
  SMOOTH: 2,
});

/** @typedef {'scalar' | 'vec3' | 'color' | 'bool' | 'clip' | 'motion' | 'light'} TrackKind */

/** @typedef {'motion' | 'stage' | 'light' | 'audio'} TimelineSection */

/** Duration change policy (P2-6) */
export const DURATION_MODE = Object.freeze({
  /** Scale all key times proportionally */
  SCALE_ALL: 'scaleAll',
  /** Keep absolute times; drop/clamp keys past new end */
  CLAMP_END: 'clampEnd',
});

export const DEFAULT_DURATION_SEC = 180;
export const DEFAULT_FPS = 30;
