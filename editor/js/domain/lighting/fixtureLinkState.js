/**
 * Fingerprint of everything a linked fixture bake reads, so the timeline can show
 * a "needs refresh" badge when the character (or the fixture itself) has moved.
 */

/** Rounding keeps float noise from flagging an unchanged scene as stale. */
const POS_STEP = 1e-3;
const TIME_STEP = 1e-4;

/**
 * @param {import('../timeline/Track.js').Track | null} motionTrack
 * @param {import('three').Object3D | null} fixtureObj aim origin
 * @returns {string} '' when there is nothing to compare against
 */
export function motionLinkFingerprint(motionTrack, fixtureObj) {
  if (!motionTrack) return '';
  /** @type {(string | number)[]} */
  const parts = [];

  const clip = motionTrack.presenceClip;
  if (clip) {
    parts.push(
      'c',
      q(clip.startSec, TIME_STEP),
      q(clip.leadInSec, TIME_STEP),
      q(clip.leadOutSec, TIME_STEP),
      q(clip.bodyInSec, TIME_STEP),
      q(clip.bodyOutSec, TIME_STEP),
      // enter/exit poses drive the sampled position outside the body range
      JSON.stringify(clip.enterPose ?? null),
      JSON.stringify(clip.exitPose ?? null),
    );
  }

  for (const kf of motionTrack.keys?.list?.() || []) {
    const v = kf.value || {};
    const p = Array.isArray(v.position) ? v.position : [0, 0, 0];
    parts.push(
      q(kf.timeSec, TIME_STEP),
      q(p[0], POS_STEP),
      q(p[1], POS_STEP),
      q(p[2], POS_STEP),
      v.visible === false ? 0 : 1,
      q(v.opacity ?? 1, POS_STEP),
    );
  }

  // Moving the fixture changes the aim just as much as moving the character
  if (fixtureObj?.position) {
    parts.push(
      'f',
      q(fixtureObj.position.x, POS_STEP),
      q(fixtureObj.position.y, POS_STEP),
      q(fixtureObj.position.z, POS_STEP),
    );
  }

  return hash(parts.join(','));
}

function q(n, step) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v / step);
}

/** FNV-1a — short, stable, and fast enough to run on every key edit burst. */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
