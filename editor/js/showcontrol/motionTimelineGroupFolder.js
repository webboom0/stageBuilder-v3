import { getGroupClipRange } from "./groupSegments.js";
import {
  applyClipToSprite,
  applyMemberGroupSegments,
  finalizeMotionTimeline,
  getMotionTimeline,
  resolveSelectedGroupMemberUuid,
  resolveSyncMemberUuids,
  setClipPreset,
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
      padding:6px 10px;
      background:rgba(255,204,68,0.10);
      border-bottom:1px solid rgba(255,204,68,0.14);
      font-size:11px;
      color:rgba(255,255,255,0.88);
    }
    .track-group-toggle{
      width:22px;height:22px;border:0;background:transparent;color:rgba(255,255,255,0.75);cursor:pointer;
    }
    .track-group-name{ font-weight:700; letter-spacing:0.03em; }
    .track-group-meta{ margin-left:auto; color:rgba(255,255,255,0.45); font-size:10px; }
    .track-group-delete{
      width:22px;height:22px;border:1px solid rgba(255,120,120,0.35);border-radius:6px;
      background:rgba(0,0,0,0.25);color:rgba(255,140,140,0.95);cursor:pointer;font-size:12px;
    }
    .timeline-track-group .track-group-body .timeline-track{
      margin:4px 6px 6px;
      border-left:2px solid rgba(255,204,68,0.18);
    }
  `;
  document.head.appendChild(style);
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
    folder.querySelector(".track-group-meta").textContent = `${group.members?.length || 0} tracks`;
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
  folder.querySelector(".track-group-meta").textContent = `${body.querySelectorAll(".timeline-track").length} tracks`;
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

    setClipPreset(editor, uuid, startTime, duration);
    applyClipToSprite(motionTimeline, uuid, startTime, duration);
    applyMemberGroupSegments(motionTimeline, editor, group, i, uuid);

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

  group.members.forEach((member) => {
    const uuid = member?.deployedUuid;
    if (!uuid) return;
    const trackEl = motionTimeline.container.querySelector(`.timeline-track[data-uuid="${uuid}"]`);
    if (trackEl) attachTrackToGroupFolder(editor, group, trackEl);
  });
}

/** 프로젝트 로드 후 배치된 그룹 트랙을 폴더로 재구성 */
export function restoreAllGroupFolders(editor) {
  const groups = editor?.showControl?.ensureGroups?.() || [];
  groups.forEach((group) => {
    if (group.members?.some((m) => m?.deployedUuid)) {
      organizeDeployedGroup(editor, group);
    }
  });
}
