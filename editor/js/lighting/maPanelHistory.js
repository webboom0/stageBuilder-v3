import { SetMaPanelLightingCommand } from "../commands/SetMaPanelLightingCommand.js";
import { fixtureTrackId } from "./fixtureLightTimeline.js";
import {
  applyHouseLightLevels,
  readHouseLightLevels,
  readStageGrand,
} from "./houseStageLights.js";

let _inHistoryPlayback = false;
let _gestureOldState = null;

function syncLightTimelineUI(editor, state) {
  const lt = editor?.lightTimeline;
  if (!lt || !state) return;

  if (state.playhead != null && Number.isFinite(state.playhead)) {
    lt.movePlayheadToTime?.(state.playhead);
    lt.currentTime = state.playhead;
  }

  const bridge = editor.timeline?.selectionBridge;
  bridge?.clearTrackHighlights?.();

  let trackId = state.selectedTrackId ?? null;
  if (!trackId) {
    const sel = editor.fixtureEngine?.getSelectionIds?.() || [];
    if (sel.length) trackId = fixtureTrackId(sel[0]);
  }

  if (trackId && lt.tracks.has(trackId)) {
    lt.selectedTrackId = trackId;
    const track = lt.tracks.get(trackId);
    track?.element?.classList.add("timeline-track--selected");
  } else {
    lt.selectedTrackId = null;
  }
}

export function isMaPanelHistoryPlayback() {
  return _inHistoryPlayback;
}

export function setMaPanelHistoryPlayback(on) {
  _inHistoryPlayback = !!on;
}

/** 조명 패널(픽스처·Fixture Bus·GRAND·HOUSE) 전체 스냅샷 */
export function captureMaPanelLightingState(editor) {
  const fe = editor?.fixtureEngine;
  const lt = editor?.lightTimeline;
  return {
    fixture: fe?.captureHistoryState?.() ?? null,
    house: readHouseLightLevels(editor?.scene),
    grand: readStageGrand(editor?.scene),
    workLight:
      editor?.scene?.userData?.workLightLevel ?? editor?._workLightLevel ?? 0,
    playhead: lt?.getPlayheadTimeSeconds?.() ?? lt?.currentTime ?? 0,
    selectedTrackId: lt?.selectedTrackId ?? null,
  };
}

export function applyMaPanelLightingState(editor, state) {
  if (!editor || !state) return;

  const fe = editor.fixtureEngine;
  if (state.fixture && fe) {
    const rigRemoved = state.fixture.built === false && fe.built;
    fe.applyHistoryState(state.fixture);
    if (rigRemoved) {
      editor.lightTimeline?.fixtureBridge?.removeAllFixtureTracks?.();
    }
  }

  if (state.house) {
    applyHouseLightLevels(editor, state.house);
  }

  if (editor.scene) {
    if (!editor.scene.userData) editor.scene.userData = {};
    if (state.grand != null) {
      editor.scene.userData.stageGrand = state.grand;
      editor._stageGrand = state.grand;
    }
  }

  if (state.workLight != null) {
    editor.setWorkLightLevel?.(state.workLight);
  }

  syncLightTimelineUI(editor, state);
  editor.refreshMaConsole?.();
  const lt = editor.lightTimeline;
  const t = state.playhead ?? lt?.getPlayheadTimeSeconds?.() ?? lt?.currentTime ?? 0;
  // 패널 편집 후 applyAtTime은 syncAttrFromTimeline로 선택 픽스처 attr/prog를 덮어씀
  if (fe?.built) {
    fe.update(t);
  } else {
    lt?.fixtureBridge?.applyAtTime?.(t);
  }
  editor.signals?.rendererUpdated?.dispatch?.();
}

export function beginMaPanelGesture(editor) {
  if (_gestureOldState || !editor) return;
  _gestureOldState = captureMaPanelLightingState(editor);
}

export function cancelMaPanelGesture() {
  _gestureOldState = null;
}

export function endMaPanelGesture(editor, label, mutateFn) {
  if (!editor) return;

  const oldState = _gestureOldState;
  _gestureOldState = null;

  if (_inHistoryPlayback || !editor.history) {
    mutateFn?.();
    return;
  }

  const cmd = new SetMaPanelLightingCommand(editor, label, mutateFn);
  if (oldState) cmd.oldState = oldState;
  editor.history.execute(cmd, label);
}

/**
 * 조명/그룹 패널 속성 변경 — Ctrl+Z 되돌리기 지원
 * @param {import('../Editor.js').Editor} editor
 * @param {string} label 히스토리 표시명 (같은 라벨·500ms 이내 슬라이더는 한 스텝으로 병합)
 * @param {() => void} mutateFn 실제 변경 로직
 */
export function runMaPanelEdit(editor, label, mutateFn) {
  if (!editor || typeof mutateFn !== "function") return;

  if (_inHistoryPlayback || !editor.history) {
    mutateFn();
    applyMaPanelLightingState(editor, captureMaPanelLightingState(editor));
    return;
  }

  const cmd = new SetMaPanelLightingCommand(editor, label, mutateFn);
  editor.history.execute(cmd, label);
}
