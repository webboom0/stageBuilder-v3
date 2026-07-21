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
  ["position", "rotation"].forEach((prop) => {
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

export function clearObjectMotionKeyframes(motionTimeline, uuid, options = {}) {
  const objectTracks = motionTimeline?.timelineData?.getObjectTracks?.(uuid);
  if (!objectTracks) return;
  const only = options.only;
  objectTracks.forEach((trackData, prop) => {
    if (Array.isArray(only) && only.length && !only.includes(prop)) return;
    trackData.clearAllKeyframes?.();
  });
}

/**
 * 그룹 경로용 — position/rotation만 키로 기록.
 * scale·색은 멤버 기본 속성(baseScale/tintColor)으로 유지.
 */
function addGroupPoseKeyframe(motionTimeline, uuid, time, object) {
  const position = object.position.clone();
  let rotation = new THREE.Vector3(
    object.rotation.x,
    object.rotation.y,
    object.rotation.z,
  );
  if (motionTimeline.options?.rotationAxisLock === "y") {
    rotation = new THREE.Vector3(0, rotation.y, 0);
  }

  [
    { type: "position", value: position },
    { type: "rotation", value: rotation },
  ].forEach(({ type, value }) => {
    let track = motionTimeline.timelineData.tracks.get(uuid)?.get(type);
    if (!track) track = motionTimeline.timelineData.addTrack(uuid, type);
    if (!track) return;

    const existingIndex = track.findKeyframeIndex(time);
    if (existingIndex !== -1) {
      track.updateKeyframeValue(existingIndex, value);
      return;
    }

    if (type === "position") {
      track.addKeyframe(time, value, INTERPOLATION.SMOOTHSTEP);
      return;
    }

    const index = track.keyframeCount;
    track.times[index] = time;
    track.values[index * 3] = value.x;
    track.values[index * 3 + 1] = value.y;
    track.values[index * 3 + 2] = value.z;
    track.interpolations[index] = INTERPOLATION.SMOOTHSTEP;
    track.keyframeCount++;
    track.dirty = true;
    track.sortKeyframes();
  });
}

function applyTintToObject(object, color) {
  if (!object || color == null || color === "") return;
  try {
    const c = new THREE.Color(color);
    const hex = c.getHex();
    object.traverse((o) => {
      if (!o.isMesh || o.userData?.isTesterBadge) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mat) => {
        if (mat?.color && typeof mat.color.setHex === "function") {
          mat.color.setHex(hex);
          mat.needsUpdate = true;
        }
      });
    });
    if (!object.userData) object.userData = {};
    object.userData.tintable = true;
    object.userData.tintColor = hex;
    object.userData.walkLiteColor = hex;
    object.userData.scCustomTint = true;
  } catch (_) {
    /* ignore */
  }
}

function applyScaleFromMember(obj, member) {
  const scale = member?.baseScale;
  if (!obj || scale == null) return;
  if (typeof scale === "object") {
    const x = Number(scale.x);
    const y = Number(scale.y);
    const z = Number(scale.z);
    if ([x, y, z].every((n) => Number.isFinite(n))) obj.scale.set(x, y, z);
  } else if (Number.isFinite(Number(scale))) {
    obj.scale.setScalar(Number(scale));
  }
}

/** 멤버에 저장된 기본 색·크기를 오브젝트에 적용 */
export function applyMemberBaseAppearance(editor, member, obj) {
  if (!obj || !member) return;
  applyScaleFromMember(obj, member);
  if (member.tintColor != null && member.tintColor !== "") {
    applyTintToObject(obj, member.tintColor);
  }
  editor?.signals?.rendererUpdated?.dispatch?.();
}

/** 속성 패널에서 바꾼 색·크기를 그룹 멤버 기본값으로 저장 */
export function persistMemberBaseAppearance(editor, object) {
  if (!editor?.showControl || !object) return false;
  const groupId = object.userData?.scGroupId;
  if (!groupId) return false;

  const group = editor.showControl.getGroup?.(groupId);
  if (!group?.members?.length) return false;

  const member =
    group.members.find((m) => m?.deployedUuid === object.uuid) ||
    group.members.find((m) => m?.id && m.id === object.userData?.scMemberId);
  if (!member) return false;

  member.baseScale = {
    x: object.scale.x,
    y: object.scale.y,
    z: object.scale.z,
  };

  const tint = object.userData?.tintColor ?? object.userData?.walkLiteColor;
  if (tint != null && tint !== "") {
    member.tintColor = tint;
    object.userData.scCustomTint = true;
  }

  // 예전에 키에 박힌 scale이 있으면 제거 → 기본 크기가 전 구간에 유지
  try {
    const mt = getMotionTimeline(editor);
    if (mt) {
      clearObjectMotionKeyframes(mt, object.uuid, { only: ["scale"] });
      mt.timelineData.dirty = true;
      mt.timelineData.precomputeAnimationData?.(
        mt.getClipInfoCallback?.(),
        mt.options?.totalSeconds || 180,
        mt.fps,
      );
    }
  } catch (_) {
    /* ignore */
  }

  editor.showControl.persistToSceneUserData?.();
  return true;
}

/** 웨이포인트 → 키프레임 (position/rotation만). scale 키는 비움 */
export function applyMemberWaypointKeyframes(
  motionTimeline,
  editor,
  uuid,
  waypoints,
  options = {},
) {
  const obj = editor.scene?.getObjectByProperty?.("uuid", uuid);
  if (!obj || !motionTimeline || !waypoints?.length) return false;

  const member = options.member;
  if (member) applyScaleFromMember(obj, member);

  // 이동만 갱신. scale 트랙은 비워 오브젝트/멤버 기본 크기 사용. visible은 유지.
  clearObjectMotionKeyframes(motionTimeline, uuid, {
    only: ["position", "rotation", "scale"],
  });

  motionTimeline._inHistoryPlayback = true;
  try {
    for (const wp of waypoints) {
      obj.position.set(wp.x, wp.y ?? 0, wp.z);
      obj.rotation.set(
        obj.rotation.x,
        THREE.MathUtils.degToRad(Number(wp.rotY) || 0),
        obj.rotation.z,
      );
      addGroupPoseKeyframe(motionTimeline, uuid, wp.time, obj);
    }
    for (const wp of waypoints) {
      if (wp.spanEasing) {
        setKeyframeSpanEasing(motionTimeline, uuid, wp.time, wp.spanEasing);
      }
    }
    const first = waypoints[0];
    obj.position.set(first.x, first.y ?? 0, first.z);
    obj.rotation.set(
      obj.rotation.x,
      THREE.MathUtils.degToRad(Number(first.rotY) || 0),
      obj.rotation.z,
    );
  } finally {
    motionTimeline._inHistoryPlayback = false;
  }

  if (member) applyMemberBaseAppearance(editor, member, obj);
  if (motionTimeline.timelineData) motionTimeline.timelineData.dirty = true;
  return true;
}

/** 그룹 segments 기반 멤버 키프레임 */
export function applyMemberGroupSegments(motionTimeline, editor, group, memberIndex, uuid) {
  const member = group?.members?.[memberIndex];
  const waypoints = buildMemberWaypoints(group, memberIndex);
  return applyMemberWaypointKeyframes(motionTimeline, editor, uuid, waypoints, {
    group,
    member,
  });
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
