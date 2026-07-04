import { getGroupClipRange } from "./groupSegments.js";
import { runShowControlEdit } from "./showControlHistory.js";
import {
  applyGroupMemberTimeline,
  finalizeMotionTimeline,
  getMotionTimeline,
  resolveSelectedGroupMemberUuid,
  resolveSyncMemberUuids,
} from "./groupTimelineKeyframes.js";

function injectGroupFolderStyles() {
  if (document.getElementById("sb-timeline-group-folder-css")) return;
  const style = document.createElement("style");
  style.id = "sb-timeline-group-folder-css";
  style.textContent = `
    .timeline-track-group{
      border:1px solid rgba(255,204,68,0.22);
      border-radius:8px;
      margin:6px 4px 8px;
      background:rgba(255,204,68,0.04);
      overflow:hidden;
    }
    .timeline-track-group.collapsed .track-group-body{ display:none; }
    .track-group-header{
      display:flex;
      align-items:center;
      gap:8px;
      padding:3px 10px;
      background:rgba(255,204,68,0.10);
      border-bottom:1px solid rgba(255,204,68,0.14);
      font-size:11px;
      color:rgba(255,255,255,0.88);
    }
    .track-group-toggle{
      width:16px;height:16px;border:0;background:transparent;color:rgba(255,255,255,0.75);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;
    }
    .track-group-name{ font-weight:700; letter-spacing:0.03em; }
    .track-group-meta{ margin-left:auto; color:rgba(255,255,255,0.45); font-size:10px; }
    .track-group-delete{
      width:22px;height:22px;border:1px solid rgba(255,120,120,0.35);border-radius:6px;
      background:rgba(0,0,0,0.25);color:rgba(255,140,140,0.95);cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;
    }
    .timeline-track-group .track-group-body .timeline-track{
      margin:4px 6px 6px;
      border-left:2px solid rgba(255,204,68,0.18);
    }
  `;
  document.head.appendChild(style);
}

function isTrackOwnedByOtherGroup(editor, uuid, groupId) {
  if (!uuid || !groupId) return false;
  const groups = editor?.showControl?.ensureGroups?.() || [];
  return groups.some(
    (g) =>
      g.id !== groupId &&
      (g.members || []).some((m) => m?.deployedUuid === uuid),
  );
}

function findTrackUuidForMember(editor, member, motionTimeline, usedUuids = new Set(), groupId = null) {
  if (!motionTimeline?.container || !member) return null;

  // 이름 매칭으로 다른 그룹 트랙을 가져오지 않음 — deployedUuid만 신뢰
  if (member.deployedUuid && !usedUuids.has(member.deployedUuid)) {
    if (groupId && isTrackOwnedByOtherGroup(editor, member.deployedUuid, groupId)) {
      return null;
    }
    const el = motionTimeline.container.querySelector(
      `.timeline-track[data-uuid="${member.deployedUuid}"]`,
    );
    if (el) return member.deployedUuid;
  }

  return null;
}

function updateGroupFolderMeta(folder) {
  if (!folder) return;
  const count = folder.querySelectorAll(".track-group-body .timeline-track[data-uuid]").length;
  const meta = folder.querySelector(".track-group-meta");
  if (meta) meta.textContent = `${count} tracks`;
}

/** 타임라인 DOM 기준 그룹↔트랙 매핑 저장 */
export function persistGroupFoldersToUserData(editor) {
  const motionTimeline = getMotionTimeline(editor);
  if (!motionTimeline?.container || !editor?.scene?.userData) return;

  const folders = {};
  motionTimeline.container.querySelectorAll(".timeline-track-group[data-sc-group-id]").forEach((folder) => {
    const groupId = folder.dataset.scGroupId;
    if (!groupId) return;
    const trackUuids = [...folder.querySelectorAll(".track-group-body .timeline-track[data-uuid]")]
      .map((el) => el.dataset.uuid)
      .filter(Boolean);
    folders[groupId] = {
      name: folder.querySelector(".track-group-name")?.textContent?.trim() || "그룹",
      trackUuids,
    };
  });

  if (!editor.scene.userData.motionTimeline) editor.scene.userData.motionTimeline = {};
  editor.scene.userData.motionTimeline.groupFolders = folders;
}

function applySavedGroupFoldersToMembers(editor) {
  const sc = editor?.showControl;
  const saved = editor?.scene?.userData?.motionTimeline?.groupFolders;
  if (!sc || !saved || typeof saved !== "object") return;

  const objectNames = editor.scene.userData.motionTimeline?.objectNames || {};
  // 다른 그룹이 이미 소유한 deployedUuid는 덮어쓰지 않음
  const ownedUuids = new Set();
  (sc.ensureGroups?.() || []).forEach((g) => {
    (g.members || []).forEach((m) => {
      if (m?.deployedUuid) ownedUuids.add(m.deployedUuid);
    });
  });

  let changed = false;

  Object.entries(saved).forEach(([groupId, info]) => {
    const group = sc.getGroup?.(groupId) || sc.ensureGroups?.().find((g) => g.id === groupId);
    if (!group) return;
    const uuids = Array.isArray(info?.trackUuids) ? info.trackUuids : [];
    uuids.forEach((uuid, index) => {
      if (!uuid) return;
      // 이미 다른 그룹 멤버에 연결된 트랙은 복원하지 않음
      const ownerElsewhere = (sc.ensureGroups?.() || []).some(
        (g) =>
          g.id !== groupId &&
          (g.members || []).some((m) => m?.deployedUuid === uuid),
      );
      if (ownerElsewhere) return;

      if (!group.members[index]) {
        // 인덱스에 멤버가 없을 때만 복원 (기존 멤버 목록을 덮어쓰지 않음)
        if (ownedUuids.has(uuid)) return;
        group.members[index] = {
          id: `mem_restore_${index}`,
          displayName: objectNames[uuid] || info?.name || `Member ${index + 1}`,
          deployedUuid: uuid,
        };
        ownedUuids.add(uuid);
        changed = true;
        return;
      }
      const member = group.members[index];
      // 이미 deployedUuid가 있으면 폴더 저장본으로 덮어쓰지 않음
      if (member.deployedUuid) {
        if (!member.displayName && objectNames[member.deployedUuid]) {
          member.displayName = objectNames[member.deployedUuid];
          changed = true;
        }
        return;
      }
      if (!ownedUuids.has(uuid)) {
        member.deployedUuid = uuid;
        ownedUuids.add(uuid);
        changed = true;
      }
      if (!member.displayName && objectNames[uuid]) {
        member.displayName = objectNames[uuid];
        changed = true;
      }
    });
  });

  if (changed) sc.persistToSceneUserData?.();
}

function findSceneObjectForMember(editor, member, usedUuids = new Set()) {
  if (!member) return null;

  if (member.deployedUuid && !usedUuids.has(member.deployedUuid)) {
    const byUuid = editor.scene?.getObjectByProperty?.("uuid", member.deployedUuid);
    if (byUuid) return byUuid;
  }

  if (member.actorId != null) {
    let found = null;
    editor.scene?.traverse?.((o) => {
      if (found || usedUuids.has(o.uuid)) return;
      if (Number(o?.userData?.actorId) === Number(member.actorId)) found = o;
    });
    if (found) return found;
  }

  const fileNeedle = String(member.filename || member.path || "")
    .toLowerCase()
    .split(/[/\\]/)
    .pop();
  if (fileNeedle) {
    let found = null;
    editor.scene?.traverse?.((o) => {
      if (found || usedUuids.has(o.uuid) || o?.userData?.source !== "motion") return;
      const fileName = String(o.userData?.fileName || o.userData?.filename || "").toLowerCase();
      const filePath = String(o.userData?.filePath || o.userData?.sourceFile || "").toLowerCase();
      if (fileName.includes(fileNeedle) || filePath.includes(fileNeedle)) found = o;
    });
    if (found) return found;
  }

  const label = member.displayName;
  if (label) {
    let found = null;
    editor.scene?.traverse?.((o) => {
      if (found || usedUuids.has(o.uuid) || o?.userData?.source !== "motion") return;
      if (o.name === label) found = o;
    });
    if (found) return found;
  }

  return null;
}

/** 프로젝트 로드 후 저장된 deployedUuid ↔ 씬 객체 UUID 재연결 */
export function reconcileGroupDeployedUuids(editor) {
  const sc = editor?.showControl;
  if (!sc) return;

  const motionTimeline = getMotionTimeline(editor);
  const groups = sc.ensureGroups?.() || [];
  let changed = false;

  applySavedGroupFoldersToMembers(editor);

  groups.forEach((group) => {
    const used = new Set();
    (group.members || []).forEach((member) => {
      let uuid = null;
      const obj = findSceneObjectForMember(editor, member, used);
      if (obj) uuid = obj.uuid;
      if (!uuid) uuid = findTrackUuidForMember(editor, member, motionTimeline, used);
      if (uuid && member.deployedUuid !== uuid) {
        member.deployedUuid = uuid;
        changed = true;
      }
      if (uuid) used.add(uuid);
      else if (member.deployedUuid) used.add(member.deployedUuid);
    });
  });

  if (changed) sc.persistToSceneUserData?.();
}

export function findGroupFolder(motionTimeline, groupId) {
  if (!motionTimeline?.container || !groupId) return null;
  return motionTimeline.container.querySelector(`.timeline-track-group[data-sc-group-id="${groupId}"]`);
}

/** ShowControl 레지스트리와 타임라인 그룹 폴더 동기화 (되돌리기 시 고아 폴더 제거) */
export function syncGroupFoldersWithRegistry(editor) {
  const motionTimeline = getMotionTimeline(editor);
  if (!motionTimeline?.container) return;

  const groups = editor?.showControl?.ensureGroups?.() || [];
  const validIds = new Set(groups.map((g) => g.id));

  [...motionTimeline.container.querySelectorAll(".timeline-track-group[data-sc-group-id]")].forEach(
    (folder) => {
      const groupId = folder.dataset.scGroupId;
      if (groupId && !validIds.has(groupId)) {
        purgeGroupFromTimeline(editor, groupId, { removeSceneObjects: true });
      }
    },
  );

  groups.forEach((g) => ensureGroupFolder(editor, g));
  motionTimeline.updateUI?.();
}

export function ensureGroupFolder(editor, group) {
  injectGroupFolderStyles();
  const motionTimeline = getMotionTimeline(editor);
  if (!motionTimeline || !group?.id) return null;

  let folder = findGroupFolder(motionTimeline, group.id);
  if (folder) {
    folder.querySelector(".track-group-name").textContent = group.name || "그룹";
    updateGroupFolderMeta(folder);
    return folder;
  }

  folder = document.createElement("div");
  folder.className = "timeline-track-group";
  folder.dataset.scGroupId = group.id;
  folder.innerHTML = `
    <div class="track-group-header">
      <button type="button" class="track-group-toggle" aria-expanded="true">▾</button>
      <span class="track-group-name">${group.name || "그룹"}</span>
      <span class="track-group-meta">${group.members?.length || 0} tracks</span>
      <button type="button" class="track-group-delete" title="그룹 삭제">✕</button>
    </div>
    <div class="track-group-body"></div>
  `;

  folder.querySelector(".track-group-toggle").onclick = () => {
    folder.classList.toggle("collapsed");
    const open = !folder.classList.contains("collapsed");
    folder.querySelector(".track-group-toggle").textContent = open ? "▾" : "▸";
    folder.querySelector(".track-group-toggle").setAttribute("aria-expanded", String(open));
  };

  folder.querySelector(".track-group-delete").onclick = () => {
    if (!window.confirm(`"${group.name}" 그룹과 포함된 트랙을 모두 삭제할까요?`)) return;
    runShowControlEdit(editor, "그룹 삭제", () => {
      editor.showControl?.deleteGroup?.(group.id);
    });
  };

  motionTimeline.container.appendChild(folder);
  return folder;
}

export function attachTrackToGroupFolder(editor, group, trackElement) {
  if (!trackElement || !group?.id) return;

  const uuid = trackElement.dataset?.uuid;
  // 다른 그룹 멤버 소유 트랙은 이동·태그 변경 금지
  if (uuid && isTrackOwnedByOtherGroup(editor, uuid, group.id)) return;

  const currentGroupId = trackElement.dataset?.scGroupId;
  if (currentGroupId && currentGroupId !== group.id) {
    // 다른 그룹 폴더에 이미 속한 트랙은 가로채지 않음
    if (isTrackOwnedByOtherGroup(editor, uuid, group.id)) return;
    const otherGroup = editor?.showControl?.getGroup?.(currentGroupId);
    if (otherGroup?.members?.some((m) => m?.deployedUuid === uuid)) return;
  }

  const folder = ensureGroupFolder(editor, group);
  if (!folder) return;
  const body = folder.querySelector(".track-group-body");
  trackElement.dataset.scGroupId = group.id;
  body.appendChild(trackElement);
  updateGroupFolderMeta(folder);

  const prevFolder = currentGroupId && currentGroupId !== group.id
    ? findGroupFolder(getMotionTimeline(editor), currentGroupId)
    : null;
  if (prevFolder) updateGroupFolderMeta(prevFolder);
}

/**
 * 재-GO 후 멤버에 연결되지 않은 이전 그룹 트랙·씬 객체 정리.
 * 다른 그룹이 쓰는 UUID는 절대 삭제하지 않음.
 */
export function pruneStaleGroupDeployTracks(editor, group, activeUuids, previousUuids = []) {
  const motionTimeline = getMotionTimeline(editor);
  if (!motionTimeline || !group?.id) return;

  const keep = new Set((activeUuids || []).filter(Boolean));
  const stale = new Set();

  (previousUuids || []).forEach((uuid) => {
    if (uuid && !keep.has(uuid)) stale.add(uuid);
  });

  motionTimeline.container
    .querySelectorAll(`.timeline-track[data-sc-group-id="${group.id}"][data-uuid]`)
    .forEach((el) => {
      const uuid = el.dataset.uuid;
      if (uuid && !keep.has(uuid)) stale.add(uuid);
    });

  const folder = findGroupFolder(motionTimeline, group.id);
  folder?.querySelectorAll(".timeline-track[data-uuid]")?.forEach((el) => {
    const uuid = el.dataset.uuid;
    if (uuid && !keep.has(uuid)) stale.add(uuid);
  });

  stale.forEach((uuid) => {
    // 다른 그룹 멤버가 소유한 트랙/객체는 삭제 금지
    if (isTrackOwnedByOtherGroup(editor, uuid, group.id)) return;

    const obj = editor.scene?.getObjectByProperty?.("uuid", uuid);
    if (obj?.parent) obj.parent.remove(obj);
    motionTimeline._removeTrackCompletelyInternal?.(uuid);
  });

  if (stale.size) {
    updateGroupFolderMeta(folder);
    motionTimeline.updateUI?.();
  }
}

export function purgeGroupFromTimeline(editor, groupId, { removeSceneObjects = true } = {}) {
  const motionTimeline = getMotionTimeline(editor);
  const folder = motionTimeline ? findGroupFolder(motionTimeline, groupId) : null;
  const uuids = [];

  if (folder) {
    folder.querySelectorAll(".timeline-track[data-uuid]").forEach((el) => {
      if (el.dataset.uuid) uuids.push(el.dataset.uuid);
    });
  }

  const sc = editor?.showControl;
  const group = sc?.getGroup?.(groupId);
  if (group?.members?.length) {
    group.members.forEach((m) => {
      const u = m?.deployedUuid;
      if (u && !uuids.includes(u)) uuids.push(u);
    });
  }

  uuids.forEach((uuid) => {
    if (removeSceneObjects) {
      const obj = editor.scene?.getObjectByProperty?.("uuid", uuid);
      if (obj?.parent) obj.parent.remove(obj);
    }
    motionTimeline?._removeTrackCompletelyInternal?.(uuid);
  });

  folder?.remove();

  if (group && sc) {
    group.members.forEach((m) => {
      m.deployedUuid = null;
    });
    sc.persistToSceneUserData?.();
  }

  motionTimeline?.updateUI?.();
  return uuids.length;
}

/**
 * GROUP MOVE 설정을 배치된 트랙에 반영
 * @param {'selected'|'all'} scope — selected: 타임라인/씬에서 선택한 그룹 멤버만
 */
export function syncGroupTimelineMove(editor, group, scope = "selected") {
  editor?.connectTimelineInstances?.();
  const motionTimeline = getMotionTimeline(editor);
  if (!motionTimeline || !group?.members?.length) return { ok: false, synced: 0, scope };

  const targetUuids = resolveSyncMemberUuids(editor, group, scope);
  if (!targetUuids.length) {
    return { ok: false, synced: 0, scope, reason: scope === "selected" ? "no_selection" : "no_members" };
  }

  const { startTime, duration } = getGroupClipRange(group);
  let synced = 0;

  group.members.forEach((member, i) => {
    const uuid = member?.deployedUuid;
    if (!uuid || !targetUuids.includes(uuid)) return;

    const obj = editor.scene?.getObjectByProperty?.("uuid", uuid);
    if (!obj) return;

    const trackEl = motionTimeline.container?.querySelector(`.timeline-track[data-uuid="${uuid}"]`);
    if (!trackEl) return;

    applyGroupMemberTimeline(motionTimeline, editor, group, i, uuid);

    motionTimeline.restoreKeyframesUIFromTimelineData?.(trackEl, uuid);
    synced += 1;
  });

  if (!synced) {
    return { ok: false, synced: 0, scope, reason: "no_tracks" };
  }

  finalizeMotionTimeline(motionTimeline, startTime);
  ensureGroupFolder(editor, group);
  editor.signals?.timelineChanged?.dispatch?.();
  editor.signals?.sceneGraphChanged?.dispatch?.();
  return { ok: true, synced, scope, selectedUuid: resolveSelectedGroupMemberUuid(editor, group) };
}

export function organizeDeployedGroup(editor, group) {
  if (!group?.members?.length) return;
  const motionTimeline = getMotionTimeline(editor);
  if (!motionTimeline) return;

  const folder = ensureGroupFolder(editor, group);
  if (!folder) return;

  const attached = new Set();
  group.members.forEach((member) => {
    // deployedUuid만 사용 — 이름 매칭으로 다른 그룹 트랙을 가져오지 않음
    const uuid = findTrackUuidForMember(
      editor,
      member,
      motionTimeline,
      attached,
      group.id,
    );
    if (!uuid || attached.has(uuid)) return;
    if (isTrackOwnedByOtherGroup(editor, uuid, group.id)) return;

    const trackEl = motionTimeline.container.querySelector(
      `.timeline-track[data-uuid="${uuid}"]`,
    );
    if (trackEl) {
      attachTrackToGroupFolder(editor, group, trackEl);
      attached.add(uuid);
    }
  });

  // 이 그룹 폴더에만 있는 트랙 정리(다른 그룹 소유면 태그 제거 후 폴더 밖으로)
  folder.querySelectorAll(".timeline-track[data-uuid]").forEach((trackEl) => {
    const uuid = trackEl.dataset.uuid;
    if (!uuid) return;
    if (attached.has(uuid)) return;
    if (isTrackOwnedByOtherGroup(editor, uuid, group.id)) {
      delete trackEl.dataset.scGroupId;
      motionTimeline.container.appendChild(trackEl);
      return;
    }
    // 이 그룹 active 멤버가 아니면 폴더에 두지 않음(삭제는 prune가 담당)
  });

  updateGroupFolderMeta(folder);
}

/** 프로젝트 로드 후 배치된 그룹 트랙을 폴더로 재구성 */
export function restoreAllGroupFolders(editor) {
  editor?.connectTimelineInstances?.();
  const motionTimeline = getMotionTimeline(editor);
  if (!motionTimeline?.container) return;

  motionTimeline.container.querySelectorAll(".timeline-track-group").forEach((folder) => folder.remove());

  reconcileGroupDeployedUuids(editor);

  const groups = editor?.showControl?.ensureGroups?.() || [];
  groups.forEach((group) => {
    if (group.members?.some((m) => m?.deployedUuid)) {
      organizeDeployedGroup(editor, group);
    }
  });
}

/** 프로젝트 로드 완료 후 — 폴더 재구성 + 그룹 클립/키프레임 재적용 */
export function resyncAllGroupsAfterProjectLoad(editor) {
  editor?.connectTimelineInstances?.();
  const motionTimeline = getMotionTimeline(editor);
  const sc = editor?.showControl;
  if (!motionTimeline || !sc) return;

  restoreAllGroupFolders(editor);

  const totalSeconds = motionTimeline.options?.totalSeconds || 180;
  const groups = sc.ensureGroups?.() || [];
  let playStart = 0;

  groups.forEach((group) => {
    if (!group?.members?.length) return;
    let synced = 0;

    group.members.forEach((member, memberIndex) => {
      const uuid = member?.deployedUuid;
      if (!uuid) return;

      const trackEl = motionTimeline.container?.querySelector(`.timeline-track[data-uuid="${uuid}"]`);
      if (!trackEl) return;

      applyGroupMemberTimeline(motionTimeline, editor, group, memberIndex, uuid);
      motionTimeline.restoreKeyframesUIFromTimelineData?.(trackEl, uuid);
      synced += 1;
    });

    if (synced > 0) {
      ({ startTime: playStart } = getGroupClipRange(group, totalSeconds));
      organizeDeployedGroup(editor, group);
    }
  });

  const hasGroupTracks = groups.some((g) => g.members?.some((m) => m?.deployedUuid));
  if (hasGroupTracks) {
    const first = groups.find((g) => g.members?.some((m) => m?.deployedUuid));
    if (first) ({ startTime: playStart } = getGroupClipRange(first, totalSeconds));
    finalizeMotionTimeline(motionTimeline, playStart);
    motionTimeline.updateAnimation?.(playStart);
    editor.signals?.timelineChanged?.dispatch?.();
  }
}
