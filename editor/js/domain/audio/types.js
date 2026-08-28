/** @typedef {{
 *   id: string,
 *   trackId: string,
 *   label: string,
 *   sourcePath: string,
 *   timelineStartSec: number,
 *   durationSec: number,
 *   sourceInSec: number,
 *   sourceOutSec: number,
 *   sourceDurationSec?: number,
 *   volume: number,
 *   muted: boolean,
 * }} AudioClip */

export const MIN_CLIP_SEC = 0.05;

export const DEFAULT_CLIP_VOLUME = 1;
