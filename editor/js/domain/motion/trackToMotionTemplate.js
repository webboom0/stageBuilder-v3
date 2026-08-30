import { normalizeRotYDeg } from './groupSegments.js';
import { normalizeMotionTemplate } from './motionTemplates.js';
import { trackKeyframesToPatternDraft } from './trackKeyframePattern.js';

const PRESET_POS_EPS = 0.5;

/**
 * Convert a motion track's keyframes into a reusable pattern-library template
 * (offsets relative to the first key — applied with pose.fromX/fromZ on use).
 * Copies position-preset links from MotionItem.anim when coordinates still match.
 *
 * @param {import('../timeline/Track.js').Track | null | undefined} track
 * @param {import('./MotionDirector.js').MotionItem | null | undefined} motionItem
 * @param {string} [label]
 */
export function trackToMotionTemplate(track, motionItem, label = '') {
  const draft = trackKeyframesToPatternDraft(track, motionItem);
  const keys = draft?.keyframes ?? [];
  if (keys.length < 2) return null;

  const first = keys[0];
  const baseX = Number(first.offsetX) || 0;
  const baseZ = Number(first.offsetZ) || 0;
  const baseRot = normalizeRotYDeg(first.deltaRotY ?? 0);
  const presetIds = resolvePresetIdsFromAnim(keys, motionItem?.anim);

  let cumulative = 0;
  const keyframes = keys.map((kf, i) => {
    if (i > 0) cumulative += Math.max(0.1, Number(kf.timeOffset) || 0);
    const kind = kf.kind || (i === 0 ? 'move' : 'move');
    return {
      timeOffset: cumulative,
      offsetX: (Number(kf.offsetX) || 0) - baseX,
      offsetZ: (Number(kf.offsetZ) || 0) - baseZ,
      deltaRotY: normalizeRotYDeg((Number(kf.deltaRotY) ?? baseRot) - baseRot),
      opacity: kind === 'exit' ? 0 : clamp01(kf.opacity ?? 1),
      visible: kind !== 'exit' && kf.visible !== false,
      presetId: presetIds[i] ?? null,
    };
  });

  const resolvedLabel = String(label || draft.label || track?.name || '패턴').trim() || '패턴';
  return normalizeMotionTemplate({
    label: resolvedLabel,
    opacity: keyframes[0]?.opacity ?? 1,
    keyframes,
  });
}

/**
 * @param {import('../../ui/keyframeTemplateUi.js').DraftKeyframe[]} absKeys
 * @param {import('./motionAnim.js').MotionAnim | null | undefined} anim
 * @returns {(string | null)[]}
 */
function resolvePresetIdsFromAnim(absKeys, anim) {
  /** @type {(string | null)[]} */
  const ids = absKeys.map(() => null);
  if (!anim || !absKeys.length) return ids;

  // 패턴 탭에서 연결한 시작 프리셋은 트랙 저장 시 그대로 가져온다
  if (anim.fromPresetId) {
    ids[0] = anim.fromPresetId;
  }

  const segs = Array.isArray(anim.segments) ? anim.segments : [];
  for (const seg of segs) {
    const pid = seg.anchorPresetId || null;
    if (!pid || seg.kind === 'hold') continue;
    const sx = Number(seg.anchorX) || 0;
    const sz = Number(seg.anchorZ) || 0;
    for (let i = 1; i < absKeys.length; i++) {
      if (ids[i]) continue;
      const kind = absKeys[i].kind || 'move';
      if (kind === 'hold') continue;
      if (nearPos(Number(absKeys[i].offsetX) || 0, Number(absKeys[i].offsetZ) || 0, sx, sz)) {
        ids[i] = pid;
        break;
      }
    }
  }

  // 좌표 매칭 실패 시 이동/퇴장 구간 순서대로 폴백
  const linkedSegs = segs.filter((s) => s.anchorPresetId && s.kind !== 'hold');
  let si = 0;
  for (let i = 1; i < absKeys.length && si < linkedSegs.length; i++) {
    if (ids[i]) continue;
    const kind = absKeys[i].kind || 'move';
    if (kind === 'hold') continue;
    ids[i] = linkedSegs[si].anchorPresetId || null;
    si += 1;
  }

  return ids;
}

/**
 * @param {number} ax @param {number} az @param {number} bx @param {number} bz
 */
function nearPos(ax, az, bx, bz) {
  return Math.abs(Number(ax) - Number(bx)) < PRESET_POS_EPS
    && Math.abs(Number(az) - Number(bz)) < PRESET_POS_EPS;
}

/**
 * @param {import('../timeline/Track.js').Track | null | undefined} track
 * @param {import('./MotionDirector.js').MotionItem | null | undefined} motionItem
 */
export function canSaveTrackToPatternLibrary(track, motionItem) {
  if (!track || track.locked || track.kind !== 'motion' || !motionItem) return false;
  const draft = trackKeyframesToPatternDraft(track, motionItem);
  return (draft?.keyframes?.length ?? 0) >= 2;
}

/** @param {number} n */
function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(1, v));
}
