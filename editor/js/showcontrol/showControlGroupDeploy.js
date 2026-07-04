import * as THREE from "three";
import {
  findSceneObjectForCatalogEntry,
  spawnCatalogEntryInScene,
} from "../utils/motionFbxCatalog.js";
import { buildMemberWaypoints, getGroupClipRange } from "./groupSegments.js";
import {
  attachTrackToGroupFolder,
  organizeDeployedGroup,
  pruneStaleGroupDeployTracks,
} from "./motionTimelineGroupFolder.js";
import {
  applyGroupMemberTimeline,
  getMotionTimeline,
} from "./groupTimelineKeyframes.js";

function countSameCatalogMembers(group, member) {
  const idx = Number(member?.catalogIndex);
  const file = member?.filename;
  return (group?.members || []).filter((m) => {
    if (Number.isFinite(idx) && Number(m?.catalogIndex) === idx) return true;
    if (file && m?.filename === file) return true;
    return false;
  }).length;
}

/** 이미 배치된 씬 객체를 다른 멤버가 쓰고 있으면 true */
export function isUuidAssignedToAnyMember(editor, uuid, exceptMemberId = null) {
  if (!uuid) return false;
  const groups = editor?.showControl?.ensureGroups?.() || [];
  return groups.some((g) =>
    (g.members || []).some(
      (m) => m?.deployedUuid === uuid && m.id !== exceptMemberId,
    ),
  );
}

/**
 * 재-GO(본인 deployedUuid)만 기존 객체 재사용.
 * 그 외에는 씬/다른 멤버에 같은 FBX가 있으면 무조건 복제.
 */
function shouldForceNewCatalogInstance(editor, group, member, catalogEntry) {
  if (member?.deployedUuid) {
    const existing = editor.scene?.getObjectByProperty?.("uuid", member.deployedUuid);
    if (existing && !isUuidAssignedToAnyMember(editor, existing.uuid, member.id)) {
      return false;
    }
    member.deployedUuid = null;
  }

  if (group && countSameCatalogMembers(group, member) > 1) return true;

  const idx = Number(member?.catalogIndex);
  const file = member?.filename || catalogEntry?.filename || catalogEntry?.name;
  const groups = editor?.showControl?.ensureGroups?.() || [];
  const usedByOtherMember = groups.some((g) =>
    (g.members || []).some((m) => {
      if (!m?.deployedUuid || m.id === member?.id) return false;
      if (Number.isFinite(idx) && Number(m.catalogIndex) === idx) return true;
      if (file && m.filename && m.filename === file) return true;
      return false;
    }),
  );
  if (usedByOtherMember) return true;

  const existing = findSceneObjectForCatalogEntry(editor, catalogEntry);
  if (existing) return true;

  return false;
}

function uniqueMemberDisplayName(group, member, entry) {
  const base =
    member?.displayName ||
    entry?.displayName ||
    entry?.name ||
    entry?.filename ||
    "Motion";
  const groupName = group?.name || "Group";
  // 그룹마다 구분되는 이름 — 트랙 이름 매칭으로 가로채지 않도록
  if (String(base).includes(`· ${groupName}`)) return base;
  return `${base} · ${groupName}`;
}

function ensureTrackForObject(editor, motionTimeline, object, displayName) {
  let trackEl = motionTimeline.container?.querySelector(
    `.timeline-track[data-uuid="${object.uuid}"]`,
  );
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

  ensureTrackForObject(editor, motionTimeline, object, displayName);
  applyGroupMemberTimeline(motionTimeline, editor, group, memberIndex, object.uuid);

  const trackEl = motionTimeline.container?.querySelector(
    `.timeline-track[data-uuid="${object.uuid}"]`,
  );
  if (trackEl && group) {
    attachTrackToGroupFolder(editor, group, trackEl);
  }
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

  const displayName = uniqueMemberDisplayName(group, member, entry);

  let object = null;
  if (member.deployedUuid) {
    object = editor.scene?.getObjectByProperty?.("uuid", member.deployedUuid) || null;
    // 다른 멤버가 이미 쓰는 객체면 재사용 금지
    if (object && isUuidAssignedToAnyMember(editor, object.uuid, member.id)) {
      object = null;
      member.deployedUuid = null;
    } else if (!object) {
      member.deployedUuid = null;
    }
  }
  if (!object) {
    const forceNew = shouldForceNewCatalogInstance(editor, group, member, entry);
    object = await spawnCatalogEntryInScene(editor, entry, {
      forceNew,
      displayName,
      group,
    });
  }
  if (!object) throw new Error(`FBX 배치 실패: ${displayName}`);

  // 복제본이 다른 멤버 UUID를 가리키면 안 됨
  if (isUuidAssignedToAnyMember(editor, object.uuid, member.id)) {
    object = await spawnCatalogEntryInScene(editor, entry, {
      forceNew: true,
      displayName,
      group,
    });
  }
  if (!object) throw new Error(`FBX 복제 배치 실패: ${displayName}`);

  member.deployedUuid = object.uuid;
  member.displayName = displayName;
  object.name = displayName;
  object.userData.scGroupId = group.id;
  object.userData.scMemberId = member.id;

  // 그룹 색상 → WalkLite·일반 FBX 모두 적용
  try {
    const { colorForWalkLiteGroup, applyGroupMotionColor } = await import(
      "../utils/walkLitePerformer.js"
    );
    applyGroupMotionColor(object, colorForWalkLiteGroup(editor, group));
  } catch (_) {
    /* noop */
  }

  return placeOnTimeline(editor, object, displayName, group, memberIndex);
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
  object.userData.scGroupId = group.id;
  object.userData.scMemberId = member.id;

  try {
    const { colorForWalkLiteGroup, applyGroupMotionColor } = await import(
      "../utils/walkLitePerformer.js"
    );
    applyGroupMotionColor(object, colorForWalkLiteGroup(editor, group));
  } catch (_) {
    /* noop */
  }

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
  const uuidsBefore = group.members.map((m) => m?.deployedUuid).filter(Boolean);

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
    const activeUuids = group.members.map((m) => m?.deployedUuid).filter(Boolean);
    pruneStaleGroupDeployTracks(editor, group, activeUuids, uuidsBefore);
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
