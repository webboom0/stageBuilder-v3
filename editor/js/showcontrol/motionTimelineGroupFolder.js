import { getGroupClipRange } from "./groupSegments.js";
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

function findTrackUuidForMember(editor, member, motionTimeline, usedUuids = new Set()) {
  if (!motionTimeline?.container || !member) return null;

  const label = String(member.displayName || "").trim();
  if (label) {
    for (const trackEl of motionTimeline.container.querySelectorAll(".timeline-track[data-uuid]")) {
      const uuid = trackEl.dataset.uuid;
      if (!uuid || usedUuids.has(uuid)) continue;
      const trackName = (trackEl.querySelector(".track-name")?.textContent || trackEl.dataset.objectName || "").trim();
      if (trackName === label) return uuid;
    }
  }

  const timelineData = editor.scene?.userData?.motionTimeline;
  const objectNames = timelineData?.objectNames || {};
  if (label) {
    const byName = Object.entries(objectNames).find(([uuid, name]) => !usedUuids.has(uuid) && name === label);
    if (byName) return byName[0];
  }

  const clips = timelineData?.clips || {};
  if (label) {
    const byClip = Object.entries(clips).find(([uuid, clip]) => {
      if (usedUuids.has(uuid)) return false;
      return clip?.name === label;
    });
    if (byClip) return byClip[0];
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
  let changed = false;

  Object.entries(saved).forEach(([groupId, info]) => {
    const group = sc.getGroup?.(groupId) || sc.ensureGroups?.().find((g) => g.id === groupId);
    if (!group) return;
    const uuids = Array.isArray(info?.trackUuids) ? info.trackUuids : [];
    uuids.forEach((uuid, index) => {
      if (!uuid) return;
      if (!group.members[index]) {
        group.members[index] = {
          id: `mem_restore_${index}`,
          displayName: objectNames[uuid] || info?.name || `Member ${index + 1}`,
          deployedUuid: uuid,
        };
        changed = true;
        return;
      }
      if (group.members[index].deployedUuid !== uuid) {
        group.members[index].deployedUuid = uuid;
        changed = true;
      }
      if (!group.members[index].displayName && objectNames[uuid]) {
        group.members[index].displayName = objectNames[uuid];
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
    editor.showControl?.deleteGroup?.(group.id);
    editor.signals?.timelineChanged?.dispatch?.();
    editor.signals?.sceneGraphChanged?.dispatch?.();
  };

  motionTimeline.container.appendChild(folder);
  return folder;
}

export function attachTrackToGroupFolder(editor, group, trackElement) {
  if (!trackElement || !group?.id) return;
  const folder = ensureGroupFolder(editor, group);
  if (!folder) return;
  const body = folder.querySelector(".track-group-body");
  trackElement.dataset.scGroupId = group.id;
  body.appendChild(trackElement);
  updateGroupFolderMeta(folder);
}

/**
 * 재-GO 후 멤버에 연결되지 않은 이전 그룹 트랙·씬 객체 정리
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
    let uuid = member?.deployedUuid;
    if (!uuid) uuid = findTrackUuidForMember(editor, member, motionTimeline, attached);
    if (!uuid || attached.has(uuid)) return;
    const trackEl = motionTimeline.container.querySelector(`.timeline-track[data-uuid="${uuid}"]`);
    if (trackEl) {
      attachTrackToGroupFolder(editor, group, trackEl);
      attached.add(uuid);
      if (!member.deployedUuid) member.deployedUuid = uuid;
    }
  });

  motionTimeline.container
    .querySelectorAll(`.timeline-track[data-sc-group-id="${group.id}"]`)
    .forEach((trackEl) => {
      const uuid = trackEl.dataset.uuid;
      if (uuid && !attached.has(uuid)) {
        attachTrackToGroupFolder(editor, group, trackEl);
        attached.add(uuid);
      }
    });
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
