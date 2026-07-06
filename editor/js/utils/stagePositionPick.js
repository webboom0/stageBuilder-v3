import * as THREE from "three";

import { SetPositionCommand } from "../commands/SetPositionCommand.js";
import { getStageDeckWorldY } from "./stageGridAdaptive.js";
import { SEGMENT_KIND } from "../showcontrol/groupSegments.js";

const _raycaster = new THREE.Raycaster();
const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hit = new THREE.Vector3();

let escBound = false;

export function isMotionObjectForStagePick(object) {
  if (!object || object.isScene || object.isCamera) return false;
  return object.userData?.source === "motion";
}

export function getObjectPositionPickMode(editor) {
  const uuid = editor?._objectPositionPick?.objectUuid;
  return uuid ? { objectUuid: uuid } : null;
}

export function setObjectPositionPickMode(editor, objectUuid) {
  if (!editor) return false;
  const active = editor._objectPositionPick?.objectUuid;
  if (!objectUuid || active === objectUuid) {
    editor._objectPositionPick = null;
  } else {
    editor._objectPositionPick = { objectUuid };
    editor.showControl?.setGroupPathPickMode?.(null, null);
  }
  syncStagePickOverlay(editor);
  return !!editor._objectPositionPick;
}

export function clearObjectPositionPickMode(editor) {
  if (!editor?._objectPositionPick) return;
  editor._objectPositionPick = null;
  syncStagePickOverlay(editor);
}

export function isAnyStagePickActive(editor) {
  return !!(
    editor?.showControl?.getGroupPathPickMode?.() || getObjectPositionPickMode(editor)
  );
}

export function raycastStageGround(editor, nx, ny) {
  const cam = editor?.viewportCamera || editor?.camera;
  if (!cam) return null;

  _ground.constant = -getStageDeckWorldY(editor);
  _raycaster.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2) + 1), cam);
  if (!_raycaster.ray.intersectPlane(_ground, _hit)) return null;
  return _hit.clone();
}

/** Viewport 클릭(0–1 정규화) — 그룹·단일 모션 공통 */
export function applyStagePickFromNormalized(editor, nx, ny) {
  if (!editor) return false;

  if (editor.showControl?.getGroupPathPickMode?.()) {
    return editor.showControl.applyGroupPathPickFromNormalized(nx, ny);
  }

  const pick = getObjectPositionPickMode(editor);
  if (!pick?.objectUuid) return false;

  const hit = raycastStageGround(editor, nx, ny);
  if (!hit) return false;

  const object = editor.scene?.getObjectByProperty?.("uuid", pick.objectUuid);
  if (!object) {
    clearObjectPositionPickMode(editor);
    editor._objectPositionPickDone?.();
    return false;
  }

  const newPos = new THREE.Vector3(hit.x, object.position.y, hit.z);
  if (object.position.distanceTo(newPos) >= 0.001) {
    editor.execute(new SetPositionCommand(editor, object, newPos));
  }

  clearObjectPositionPickMode(editor);
  editor.signals?.objectChanged?.dispatch?.(object);
  editor.signals?.sceneGraphChanged?.dispatch?.();
  editor._objectPositionPickDone?.();
  return true;
}

export function syncStagePickOverlay(editor) {
  const groupPick = editor?.showControl?.getGroupPathPickMode?.();
  const objectPick = getObjectPositionPickMode(editor);
  const viewer =
    document.querySelector(".viewer.sb-program") || document.querySelector(".viewer");
  if (!viewer) return;

  let overlay = viewer.querySelector("#sb-stage-pick-overlay");

  if (!groupPick && !objectPick) {
    viewer.classList.remove("sb-stage-pick-mode");
    document.body.classList.remove("sb-stage-pick-active");
    overlay?.remove();
    return;
  }

  let label = "위치";
  if (objectPick) {
    const obj = editor.scene?.getObjectByProperty?.("uuid", objectPick.objectUuid);
    const name = obj?.name || obj?.userData?.displayName || "모션";
    label = `${name} 위치`;
  } else if (groupPick.mode === "from") {
    label = "시작 위치";
  } else if (groupPick.mode === "segmentAnchor") {
    const group = editor.showControl.getGroup(groupPick.groupId);
    const seg = group?.segments?.find((s) => s.id === groupPick.segmentId);
    label = seg?.kind === SEGMENT_KIND.exit ? "퇴장 위치" : "끝 위치";
  }

  viewer.classList.add("sb-stage-pick-mode");
  document.body.classList.add("sb-stage-pick-active");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "sb-stage-pick-overlay";
    overlay.innerHTML = `
      <div class="sb-stage-pick-banner">
        <span class="sb-stage-pick-banner-icon" aria-hidden="true">⌖</span>
        <span class="sb-stage-pick-banner-text"></span>
        <span class="sb-stage-pick-banner-esc">ESC 취소</span>
      </div>
    `;
    viewer.appendChild(overlay);
  }

  const textEl = overlay.querySelector(".sb-stage-pick-banner-text");
  if (textEl) textEl.textContent = `${label} 지정 — 무대를 클릭하세요`;
}

export function bindStagePickEsc(editor) {
  if (escBound) return;
  escBound = true;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!isAnyStagePickActive(editor)) return;
    editor.showControl?.setGroupPathPickMode?.(null, null);
    clearObjectPositionPickMode(editor);
    syncStagePickOverlay(editor);
    editor._showControlPathPickDone?.();
    editor._objectPositionPickDone?.();
  });
}

export function stagePickButtonHtml({ active, title, dataAttr, dataValue }) {
  const dataPart = dataAttr ? ` data-${dataAttr}="${dataValue ?? ""}"` : "";
  return `
    <button type="button" class="sb-stage-pick${active ? " picking" : ""}"${dataPart}>
      <span class="sb-stage-pick-icon" aria-hidden="true">⌖</span>
      <span class="sb-stage-pick-body">
        <strong class="sb-stage-pick-title">${title}</strong>
        <span class="sb-stage-pick-hint">${active ? "무대를 클릭하세요 →" : "버튼을 누른 뒤 무대 클릭"}</span>
      </span>
      ${active ? '<span class="sb-stage-pick-live">PICK</span>' : ""}
    </button>
  `;
}
