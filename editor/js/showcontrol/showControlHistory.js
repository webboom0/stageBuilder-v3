import { SetShowControlCommand } from "../commands/SetShowControlCommand.js";

let _inHistoryPlayback = false;

export function isShowControlHistoryPlayback() {
  return _inHistoryPlayback;
}

export function setShowControlHistoryPlayback(on) {
  _inHistoryPlayback = !!on;
}

/** 그룹 / Ensemble 레지스트리 전체 스냅샷 */
export function captureShowControlState(editor) {
  const sc = editor?.showControl;
  if (!sc) return null;

  return {
    registry: JSON.parse(
      JSON.stringify(sc.registry || { motion: [], lights: [], groups: [] }),
    ),
    selectedGroupId: sc.selectedGroupId ?? null,
    selectedGroupMemberIds: [...(sc.selectedGroupMemberIds || [])],
    selectedFbxSlotIndices: [...(sc.selectedFbxSlotIndices || [])],
  };
}

export function applyShowControlState(editor, state) {
  if (!editor || !state) return;

  const sc = editor.showControl;
  if (!sc) return;

  sc.registry = JSON.parse(JSON.stringify(state.registry));
  sc.ensureGroups();
  sc._normalizeRegistry?.();
  sc.selectedGroupId = state.selectedGroupId ?? sc.selectedGroupId;
  sc.selectedGroupMemberIds = new Set(state.selectedGroupMemberIds || []);
  sc.selectedFbxSlotIndices = new Set(state.selectedFbxSlotIndices || []);
  sc.persistToSceneUserData();

  import("./motionTimelineGroupFolder.js").then(({ syncGroupFoldersWithRegistry }) => {
    syncGroupFoldersWithRegistry(editor);
    editor.signals?.timelineChanged?.dispatch?.();
  });

  editor.refreshShowControl?.();
}

/**
 * 그룹/Ensemble 패널 변경 — Ctrl+Z 되돌리기 지원
 * @param {import('../Editor.js').Editor} editor
 * @param {string} label
 * @param {() => void} mutateFn
 */
export function runShowControlEdit(editor, label, mutateFn) {
  if (!editor || typeof mutateFn !== "function") return;

  if (_inHistoryPlayback || !editor.history) {
    mutateFn();
    applyShowControlState(editor, captureShowControlState(editor));
    return;
  }

  const cmd = new SetShowControlCommand(editor, label, mutateFn);
  editor.history.execute(cmd, label);
}
