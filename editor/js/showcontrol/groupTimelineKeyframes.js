import * as THREE from "three";
import { buildMemberWaypoints } from "./groupSegments.js";

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
    const first = waypoints[0];
    obj.position.set(first.x, first.y ?? 0, first.z);
    obj.rotation.set(obj.rotation.x, THREE.MathUtils.degToRad(Number(first.rotY) || 0), obj.rotation.z);
  } finally {
    motionTimeline._inHistoryPlayback = false;
  }
  return true;
}

/** 그룹 멤버 이동 키프레임 (시작·끝) — 레거시 2키 */
export function applyMemberMoveKeyframes(motionTimeline, editor, uuid, pos, startTime, duration, rot = {}) {
  const waypoints = [
    {
      time: startTime,
      x: pos.fromX,
      y: pos.fromY ?? 0,
      z: pos.fromZ,
      rotY: rot.fromRotY ?? 0,
    },
    {
      time: startTime + duration,
      x: pos.toX,
      y: pos.toY ?? 0,
      z: pos.toZ,
      rotY: rot.toRotY ?? 0,
    },
  ];
  return applyMemberWaypointKeyframes(motionTimeline, editor, uuid, waypoints);
}

/** 그룹 segments 기반 멤버 키프레임 */
export function applyMemberGroupSegments(motionTimeline, editor, group, memberIndex, uuid) {
  const waypoints = buildMemberWaypoints(group, memberIndex);
  return applyMemberWaypointKeyframes(motionTimeline, editor, uuid, waypoints);
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
