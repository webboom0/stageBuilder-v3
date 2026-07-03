import * as THREE from "three";
import { INTERPOLATION } from "../timeline/TimelineCore.js";
import { buildMemberWaypoints, getGroupClipRange, normalizeSegmentEasing } from "./groupSegments.js";

function easingToInterpolation(easing) {
  return normalizeSegmentEasing(easing) === "smooth"
    ? INTERPOLATION.SMOOTHSTEP
    : INTERPOLATION.LINEAR;
}

function setKeyframeSpanEasing(motionTimeline, uuid, time, easing) {
  const objectTracks = motionTimeline.timelineData?.getObjectTracks?.(uuid);
  if (!objectTracks) return;
  const interp = easingToInterpolation(easing);
  ["position", "rotation", "scale"].forEach((prop) => {
    const track = objectTracks.get(prop);
    if (!track) return;
    const idx = track.findKeyframeIndex(time);
    if (idx !== -1) track.interpolations[idx] = interp;
  });
}

export function getMotionTimeline(editor) {
  editor?.connectTimelineInstances?.();
  return (
    editor?.motionTimeline ||
    editor?.timeline?.timelines?.motion ||
    window.timeline?.timelines?.motion ||
    null
  );
}

export function clearObjectMotionKeyframes(motionTimeline, uuid) {
  const objectTracks = motionTimeline?.timelineData?.getObjectTracks?.(uuid);
  if (!objectTracks) return;
  objectTracks.forEach((trackData) => trackData.clearAllKeyframes?.());
}

/** 그룹 트랙: 클립 UI=전체 타임라인, 가시성은 playStart~playEnd (퇴장 구간일 때만 playEnd에서 숨김) */
export function setGroupClipPreset(editor, objectUuid, playStart, playDuration, options = {}) {
  const motionTimeline = getMotionTimeline(editor);
  const totalSeconds = motionTimeline?.options?.totalSeconds || 180;
  const endsWithExit = !!options.endsWithExit;
  const playEnd = endsWithExit
    ? playStart + Math.max(0.1, playDuration)
    : totalSeconds;
  if (!editor.scene.userData.motionTimeline) editor.scene.userData.motionTimeline = {};
  if (!editor.scene.userData.motionTimeline.clips) {
    editor.scene.userData.motionTimeline.clips = {};
  }
  editor.scene.userData.motionTimeline.clips[objectUuid] = {
    left: 0,
    width: 100,
    duration: totalSeconds,
    initialLeft: 0,
    scGroupClip: "full",
    playStart,
    playEnd,
    playDuration,
    endsWithExit,
    hideAfterShow: endsWithExit,
  };
}

export function applyGroupTimelineClip(motionTimeline, objectUuid, playStart, playDuration, options = {}) {
  const totalSeconds = motionTimeline?.options?.totalSeconds || 180;
  const trackEl = motionTimeline.container?.querySelector(`[data-uuid="${objectUuid}"]`);
  const sprite = trackEl?.querySelector?.(".animation-sprite");
  if (!sprite) return false;

  const endsWithExit = !!options.endsWithExit;
  const playEnd = endsWithExit
    ? playStart + Math.max(0.1, playDuration)
    : totalSeconds;

  sprite.style.left = "0%";
  sprite.style.width = "100%";
  sprite.dataset.scGroupClip = "full";
  sprite.dataset.playStart = String(playStart);
  sprite.dataset.playEnd = String(playEnd);
  sprite.dataset.playDuration = String(playDuration);
  sprite.dataset.endsWithExit = endsWithExit ? "1" : "0";
  sprite.dataset.hideAfterShow = endsWithExit ? "1" : "0";
  sprite.dataset.duration = String(totalSeconds);
  sprite.dataset.initialLeft = "0";
  sprite.dataset.previousDuration = String(totalSeconds);

  if (trackEl) trackEl.dataset.scGroupTrack = "1";

  motionTimeline.updateKeyframesInClip?.({ uuid: objectUuid }, sprite);
  return true;
}

/** @deprecated 일반 트랙용 — 그룹은 applyGroupTimelineClip 사용 */
export function setClipPreset(editor, objectUuid, startTime, duration) {
  const motionTimeline = getMotionTimeline(editor);
  const totalSeconds = motionTimeline?.options?.totalSeconds || 180;
  const left = (Math.max(0, startTime) / totalSeconds) * 100;
  const width = (Math.max(0.1, duration) / totalSeconds) * 100;
  if (!editor.scene.userData.motionTimeline) editor.scene.userData.motionTimeline = {};
  if (!editor.scene.userData.motionTimeline.clips) {
    editor.scene.userData.motionTimeline.clips = {};
  }
  editor.scene.userData.motionTimeline.clips[objectUuid] = {
    left,
    width: Math.min(width, Math.max(0.1, 100 - left)),
    duration: Math.max(0.1, duration),
    initialLeft: left,
  };
}

export function applyClipToSprite(motionTimeline, objectUuid, startTime, duration) {
  const totalSeconds = motionTimeline?.options?.totalSeconds || 180;
  const trackEl = motionTimeline.container?.querySelector(`[data-uuid="${objectUuid}"]`);
  const sprite = trackEl?.querySelector?.(".animation-sprite");
  if (!sprite) return false;

  const left = (Math.max(0, startTime) / totalSeconds) * 100;
  const width = (Math.max(0.1, duration) / totalSeconds) * 100;
  sprite.style.left = `${left}%`;
  sprite.style.width = `${Math.min(width, Math.max(0.1, 100 - left))}%`;
  sprite.dataset.duration = String(Math.max(0.1, duration));
  sprite.dataset.initialLeft = String(left);
  sprite.dataset.previousDuration = sprite.dataset.duration;
  delete sprite.dataset.scGroupClip;
  delete sprite.dataset.playStart;
  delete sprite.dataset.playEnd;

  motionTimeline.updateKeyframesInClip?.({ uuid: objectUuid }, sprite);
  return true;
}

/** 웨이포인트 배열로 키프레임 적용 — 기존 키는 먼저 제거 */
export function applyMemberWaypointKeyframes(motionTimeline, editor, uuid, waypoints) {
  const obj = editor.scene?.getObjectByProperty?.("uuid", uuid);
  if (!obj || !motionTimeline || !waypoints?.length) return false;

  clearObjectMotionKeyframes(motionTimeline, uuid);

  motionTimeline._inHistoryPlayback = true;
  try {
    for (const wp of waypoints) {
      obj.position.set(wp.x, wp.y ?? 0, wp.z);
      obj.rotation.set(obj.rotation.x, THREE.MathUtils.degToRad(Number(wp.rotY) || 0), obj.rotation.z);
      motionTimeline._addKeyframeInternal?.(uuid, "position", wp.time, null);
    }
    for (const wp of waypoints) {
      if (wp.spanEasing) setKeyframeSpanEasing(motionTimeline, uuid, wp.time, wp.spanEasing);
    }
    const first = waypoints[0];
    obj.position.set(first.x, first.y ?? 0, first.z);
    obj.rotation.set(obj.rotation.x, THREE.MathUtils.degToRad(Number(first.rotY) || 0), obj.rotation.z);
  } finally {
    motionTimeline._inHistoryPlayback = false;
  }
  if (motionTimeline.timelineData) motionTimeline.timelineData.dirty = true;
  return true;
}

/** 그룹 segments 기반 멤버 키프레임 */
export function applyMemberGroupSegments(motionTimeline, editor, group, memberIndex, uuid) {
  const waypoints = buildMemberWaypoints(group, memberIndex);
  return applyMemberWaypointKeyframes(motionTimeline, editor, uuid, waypoints);
}

export function applyGroupMemberTimeline(motionTimeline, editor, group, memberIndex, uuid) {
  const totalSeconds = motionTimeline?.options?.totalSeconds || 180;
  const { startTime, duration, endsWithExit } = getGroupClipRange(group, totalSeconds);
  const clipOpts = { endsWithExit };
  setGroupClipPreset(editor, uuid, startTime, duration, clipOpts);
  applyGroupTimelineClip(motionTimeline, uuid, startTime, duration, clipOpts);
  return applyMemberGroupSegments(motionTimeline, editor, group, memberIndex, uuid);
}

export function resolveSelectedGroupMemberUuid(editor, group) {
  const groupUuids = (group?.members || []).map((m) => m?.deployedUuid).filter(Boolean);
  if (!groupUuids.length) return null;

  const motionTimeline = getMotionTimeline(editor);
  const candidates = [
    editor?.selected?.uuid,
    motionTimeline?.selectedKeyframe?.objectId,
    motionTimeline?.selectedSprite?.closest?.(".timeline-track")?.dataset?.uuid,
  ].filter(Boolean);

  return candidates.find((u) => groupUuids.includes(u)) || null;
}

/** scope: 'selected' | 'all' */
export function resolveSyncMemberUuids(editor, group, scope = "selected") {
  const groupUuids = (group?.members || []).map((m) => m?.deployedUuid).filter(Boolean);
  if (!groupUuids.length) return [];

  if (scope === "all") return groupUuids;

  const selected = resolveSelectedGroupMemberUuid(editor, group);
  return selected ? [selected] : [];
}

export function finalizeMotionTimeline(motionTimeline, startTime) {
  if (!motionTimeline) return;
  const totalSeconds = motionTimeline.totalSeconds ?? motionTimeline.options?.totalSeconds ?? 180;
  motionTimeline.timelineData.dirty = true;
  motionTimeline.timelineData.precomputeAnimationData?.(
    motionTimeline.getClipInfoCallback?.(),
    totalSeconds,
    motionTimeline.fps,
  );
  motionTimeline.updateUI?.();
  motionTimeline.updateAnimation?.(startTime);
}
