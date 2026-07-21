/** 모션 객체 로드 후 타임라인 트랙 자동 연결 */

import { catalogEntryKey } from "./motionFbxCatalog.js";
import { isLiteProceduralCatalogEntry } from "./walkLitePerformer.js";

export function getMotionObjects(scene) {
  const list = [];
  if (!scene) return list;
  scene.traverse((obj) => {
    if (obj?.userData?.source === "motion") list.push(obj);
  });
  return list;
}

export function snapshotMotionUuids(scene) {
  return new Set(getMotionObjects(scene).map((o) => o.uuid));
}

function nameMatches(objName, baseName, fileName) {
  if (!objName) return false;
  const n = String(objName).toLowerCase();
  if (baseName && n === String(baseName).toLowerCase()) return true;
  if (fileName && n === String(fileName).replace(/\.fbx$/i, "").toLowerCase()) return true;
  if (baseName && n.includes(String(baseName).toLowerCase())) return true;
  return false;
}

/**
 * loadFiles 호출 직전에 시작하고, 새 motion 객체가 생기면 resolve
 */
export function waitForNewMotionObject(
  editor,
  beforeUuids,
  { fileName = "", displayName = "", timeoutMs = 45000 } = {},
) {
  const baseName = (displayName || fileName || "").replace(/\.fbx$/i, "");

  return new Promise((resolve) => {
    let done = false;
    const before = beforeUuids instanceof Set ? beforeUuids : new Set();

    const finish = (obj) => {
      if (done) return;
      done = true;
      try {
        editor?.signals?.objectAdded?.remove?.(onAdded);
      } catch (_) {
        /* ignore */
      }
      resolve(obj || null);
    };

    const findCandidate = () => {
      const added = getMotionObjects(editor.scene).filter((o) => !before.has(o.uuid));
      if (!added.length) return null;
      const byName = added.find((o) => nameMatches(o.name, baseName, fileName));
      return byName || added[added.length - 1];
    };

    const onAdded = (obj) => {
      if (!obj || obj.userData?.source !== "motion") return;
      if (before.has(obj.uuid)) return;
      if (baseName && !nameMatches(obj.name, baseName, fileName)) {
        finish(obj);
        return;
      }
      finish(obj);
    };

    if (editor?.signals?.objectAdded) {
      editor.signals.objectAdded.add(onAdded);
    }

    const started = Date.now();
    const poll = () => {
      if (done) return;
      const found = findCandidate();
      if (found) {
        finish(found);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        finish(null);
        return;
      }
      setTimeout(poll, 120);
    };
    poll();
  });
}

export function resolveMotionTrack(motionTimeline, objectUuid) {
  if (!motionTimeline || !objectUuid) return null;

  const existingEl = motionTimeline.container?.querySelector(
    `[data-uuid="${objectUuid}"]`,
  );
  const existingTracks =
    motionTimeline.timelineData?.getObjectTracks?.(objectUuid);
  const hasData = existingTracks && existingTracks.size > 0;

  if (!existingEl && !hasData) return null;

  return {
    element: existingEl,
    uuid: objectUuid,
    alreadyExists: !!(existingEl || hasData),
  };
}

export function ensureMotionTimelineTrack(editor, object) {
  if (!editor || !object?.uuid) return null;

  const motionTimeline =
    editor.motionTimeline ||
    editor.timeline?.timelines?.motion ||
    window.timeline?.timelines?.motion;

  if (!motionTimeline) return null;

  if (
    typeof motionTimeline.isValidObjectForMotionTrack === "function" &&
    !motionTimeline.isValidObjectForMotionTrack(object)
  ) {
    return null;
  }

  const existing = resolveMotionTrack(motionTimeline, object.uuid);
  if (existing) return existing;

  motionTimeline.addTrack(
    object.uuid,
    object.id,
    object.name || `Motion ${object.id}`,
  );

  // addTrack()은 history 경로에서 undefined 반환 — 실제 생성 여부는 DOM/데이터로 확인
  let track = resolveMotionTrack(motionTimeline, object.uuid);

  if (!track && typeof motionTimeline._addTrackInternal === "function") {
    track = motionTimeline._addTrackInternal(
      object.uuid,
      object.id,
      object.name || `Motion ${object.id}`,
    );
  }

  if (!track) return null;

  if (track.element && motionTimeline.editor?.timeline?.selectionBridge) {
    motionTimeline.editor.timeline.selectionBridge.selectMotionTrack(
      object.uuid,
    );
  } else if (track.element) {
    track.element.classList.add("timeline-track--selected");
  }

  editor.select?.(object);
  return track;
}

function isProceduralCatalogEntry(entry) {
  if (!entry) return false;
  if (isLiteProceduralCatalogEntry(entry)) return true;
  return String(entry.path || "").startsWith("procedural://");
}

function nextUniqueDisplayNameForEntry(editor, entry) {
  const base =
    entry.displayName || entry.name || String(entry.filename || "").replace(/\.fbx$/i, "") || "Motion";
  const key = catalogEntryKey(entry);
  const same = getMotionObjects(editor?.scene).filter((o) => {
    if (entry.procedural && o.userData?.procedural === entry.procedural) return true;
    const fn = String(o.userData?.fileName || "").toLowerCase();
    return key && fn === key;
  });
  if (!same.length) return base;
  return `${base} (${same.length + 1})`;
}

/** Assets Motion + 버튼: FBX·WalkLite(프로시저럴) 공통 — 씬 배치 + 트랙 생성 */
export async function addMotionCatalogEntryToSceneAndTrack(editor, entry, options = {}) {
  if (!editor || !entry) {
    throw new Error("모션 항목 정보가 없습니다.");
  }

  if (isProceduralCatalogEntry(entry)) {
    const { spawnCatalogEntryInScene } = await import("./motionFbxCatalog.js");
    const displayName = options.displayName || nextUniqueDisplayNameForEntry(editor, entry);
    const object = await spawnCatalogEntryInScene(editor, entry, {
      forceNew: true,
      displayName,
    });
    if (!object) throw new Error("테스트 모션 객체를 씬에 추가할 수 없습니다.");
    object.name = displayName;
    object.userData.displayName = displayName;

    const track = ensureMotionTimelineTrack(editor, object);
    if (!track) throw new Error("모션 타임라인 트랙을 생성할 수 없습니다.");
    return { object, track };
  }

  const path = entry.path;
  if (!path) throw new Error("FBX 경로가 없습니다.");

  const fileBlob = await fetch(path).then((r) => {
    if (!r.ok) throw new Error(`FBX 파일을 불러올 수 없습니다: ${path}`);
    return r.blob();
  });
  const file = new File([fileBlob], entry.filename || entry.name, {
    type: "application/octet-stream",
  });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  return loadMotionFileAndCreateTrack(editor, dataTransfer.files, {
    fileName: entry.filename || entry.name,
    displayName: options.displayName || entry.displayName || entry.name,
    path,
  });
}

export async function loadMotionFileAndCreateTrack(editor, fileList, meta = {}) {
  const before = snapshotMotionUuids(editor.scene);
  const waitPromise = waitForNewMotionObject(editor, before, meta);

  if (!editor?.loader?.loadFiles) {
    throw new Error("editor.loader.loadFiles를 찾을 수 없습니다.");
  }

  editor.loader.loadFiles(fileList);

  const object = await waitPromise;
  if (!object) {
    throw new Error("씬에 추가된 모션 객체를 찾을 수 없습니다.");
  }

  if (meta.path) {
    object.userData.filePath = meta.path;
  }
  if (meta.fileName) {
    object.userData.fileName = meta.fileName;
  }
  if (meta.displayName) {
    object.userData.displayName = meta.displayName;
  }

  const track = ensureMotionTimelineTrack(editor, object);
  if (!track) {
    throw new Error("모션 타임라인 트랙을 생성할 수 없습니다.");
  }

  return { object, track };
}
