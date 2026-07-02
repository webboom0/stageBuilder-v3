import * as THREE from "three";
import { spawnCatalogEntryInScene } from "../utils/motionFbxCatalog.js";
import { buildMemberWaypoints, getGroupClipRange } from "./groupSegments.js";
import { organizeDeployedGroup } from "./motionTimelineGroupFolder.js";
import {
  applyClipToSprite,
  applyMemberGroupSegments,
  getMotionTimeline,
  setClipPreset,
} from "./groupTimelineKeyframes.js";

function ensureTrackForObject(editor, motionTimeline, object, displayName) {
  let trackEl = motionTimeline.container?.querySelector(`[data-uuid="${object.uuid}"]`);
  if (trackEl) return trackEl;

  const track =
    motionTimeline._addTrackInternal?.(
      object.uuid,
      object.id,
      displayName || object.name || "Motion",
      true,
      { skipValidation: true },
    ) || null;

  if (!track?.element) {
    throw new Error(`트랙 UI 생성 실패: ${displayName || object.name}`);
  }

  return track.element;
}

async function placeOnTimeline(editor, object, displayName, group, memberIndex) {
  const motionTimeline = getMotionTimeline(editor);
  if (!motionTimeline) {
    throw new Error("모션 타임라인을 찾을 수 없습니다. 타임라인 패널이 보이는지 확인하세요.");
  }

  const { startTime, duration } = getGroupClipRange(group);
  const wps = buildMemberWaypoints(group, memberIndex);
  const first = wps[0];

  object.visible = true;
  if (first) {
    object.position.set(first.x, first.y ?? 0, first.z);
    object.rotation.set(
      object.rotation.x,
      THREE.MathUtils.degToRad(Number(first.rotY) || 0),
      object.rotation.z,
    );
  }

  setClipPreset(editor, object.uuid, startTime, duration);
  ensureTrackForObject(editor, motionTimeline, object, displayName);
  applyClipToSprite(motionTimeline, object.uuid, startTime, duration);
  applyMemberGroupSegments(motionTimeline, editor, group, memberIndex, object.uuid);

  const trackEl = motionTimeline.container?.querySelector(`[data-uuid="${object.uuid}"]`);
  motionTimeline.restoreKeyframesUIFromTimelineData?.(trackEl, object.uuid);

  motionTimeline.timelineData?.precomputeAnimationData?.(
    motionTimeline.getClipInfoCallback?.(),
    motionTimeline.totalSeconds ?? motionTimeline.options?.totalSeconds ?? 180,
    motionTimeline.fps,
  );
  motionTimeline.updateUI?.();
  motionTimeline.updateAnimation?.(startTime);
  editor.signals?.sceneGraphChanged?.dispatch();
  editor.signals?.timelineChanged?.dispatch();
  return object;
}

async function deployCatalogMember(editor, member, catalog, group, memberIndex) {
  const entry =
    (Number.isFinite(member.catalogIndex) && catalog[member.catalogIndex]) || {
      path: member.path,
      filename: member.filename,
      name: member.displayName,
      displayName: member.displayName,
    };

  let object = null;
  if (member.deployedUuid) {
    object = editor.scene?.getObjectByProperty?.("uuid", member.deployedUuid) || null;
  }
  if (!object) {
    object = await spawnCatalogEntryInScene(editor, entry);
  }
  if (!object) throw new Error(`FBX 배치 실패: ${member.displayName || entry.displayName}`);

  member.deployedUuid = object.uuid;
  member.displayName = member.displayName || object.name || entry.displayName;

  return placeOnTimeline(editor, object, member.displayName, group, memberIndex);
}

async function deployActorMember(editor, member, group, memberIndex) {
  const actorId = Number(member.actorId);
  if (!Number.isFinite(actorId)) return null;

  const { ActorsManager } = await import("../actors/ActorsManager.js");
  if (!editor.actorsManager) {
    editor.actorsManager = new ActorsManager(editor);
    editor.actorsManager.restoreFromSceneUserData();
    editor.actorsManager.attach();
  }

  let entry = editor.actorsManager.getActor(actorId);
  if (!entry) entry = editor.actorsManager.spawn(actorId);
  if (!entry?.object) return null;

  const object = entry.object;
  member.deployedUuid = object.uuid;

  const wps = buildMemberWaypoints(group, memberIndex);
  const last = wps[wps.length - 1];
  if (last) entry.target.set(last.x, 0, last.z);

  const result = await placeOnTimeline(editor, object, object.name, group, memberIndex);
  editor.actorsManager.persistToSceneUserData();
  return result;
}

export async function deployGroupToStage(editor, group, catalog = []) {
  if (!editor || !group) return { ok: false, count: 0, errors: ["그룹이 없습니다."] };

  editor.connectTimelineInstances?.();

  const members = Array.isArray(group.members) ? group.members : [];
  if (!members.length) {
    return { ok: false, count: 0, errors: ["그룹에 등록된 멤버가 없습니다. FBX 번호를 먼저 등록하세요."] };
  }

  const motionTimeline = getMotionTimeline(editor);
  if (!motionTimeline) {
    return {
      ok: false,
      count: 0,
      errors: ["모션 타임라인을 찾을 수 없습니다. 에디터 하단 타임라인이 로드됐는지 확인하세요."],
    };
  }

  let count = 0;
  const errors = [];

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    try {
      if (member?.actorId != null) {
        const obj = await deployActorMember(editor, member, group, i);
        if (obj) count++;
        else errors.push(`Actor ${member.actorId} 배치 실패`);
      } else {
        const obj = await deployCatalogMember(editor, member, catalog, group, i);
        if (obj) count++;
        else errors.push(`${member.displayName || "멤버"} 배치 실패`);
      }
    } catch (e) {
      console.error("그룹 멤버 배치 실패:", member, e);
      errors.push(e?.message || String(e));
    }
  }

  if (count > 0) {
    organizeDeployedGroup(editor, group);
  }

  motionTimeline.updateUI?.();
  editor.signals?.timelineChanged?.dispatch?.();
  return { ok: count > 0 && errors.length === 0, count, errors };
}

export function getMemberDeployedUuid(member) {
  if (!member) return null;
  if (typeof member === "string") return member;
  return member.deployedUuid || member.uuid || null;
}
