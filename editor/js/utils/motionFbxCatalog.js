import { getFbxApiUrl, FBX_UPLOAD_CONFIG } from "../config/fbx-upload-config.js";

/** 서버 없음·연결 실패·목록 비어 있음 → 패널에 항상 이 목록 표시 (files/fbx) */
export const DEFAULT_LOCAL_FBX_LIST = [
  // cosmos HTML 스타일 경량 워커 (실제 FBX 없음, 프로시저럴)
  {
    path: "procedural://walk-lite",
    name: "WalkLite",
    displayName: "WalkLite (경량)",
    filename: "WalkLite.fbx",
    procedural: "walk-lite",
  },
  { path: "../files/fbx/Sitting.fbx", name: "Sitting", displayName: "Sitting", filename: "Sitting.fbx" },
  { path: "../files/fbx/Character1.fbx", name: "Character1", displayName: "Character1", filename: "Character1.fbx" },
  { path: "../files/fbx/Character2.fbx", name: "Character2", displayName: "Character2", filename: "Character2.fbx" },
  { path: "../files/fbx/Belly Dance.fbx", name: "Belly Dance", displayName: "Belly Dance", filename: "Belly Dance.fbx" },
  { path: "../files/fbx/Samba Dancing.fbx", name: "Samba Dancing", displayName: "Samba Dancing", filename: "Samba Dancing.fbx" },
];

function cloneDefaultLocalFbxList() {
  return DEFAULT_LOCAL_FBX_LIST.map((f) => ({ ...f }));
}

function fbxListFilenameKey(f) {
  return String(f.filename || f.name || "").toLowerCase();
}

function prependLocalOnlyFbx(serverList) {
  const onServer = new Set((serverList || []).map(fbxListFilenameKey).filter(Boolean));
  const extra = DEFAULT_LOCAL_FBX_LIST.filter((f) => {
    const k = fbxListFilenameKey(f);
    return k && !onServer.has(k);
  }).map((f) => ({ ...f }));
  return extra.length ? [...extra, ...serverList] : serverList;
}

function fetchFbxListWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, credentials: "include" }).finally(() => clearTimeout(t));
}

/** Assets > Motion 패널과 동일한 FBX 카탈로그 */
export async function loadMotionFbxCatalog() {
  const url = getFbxApiUrl(FBX_UPLOAD_CONFIG.ENDPOINTS.GET_FILES);
  try {
    const response = await fetchFbxListWithTimeout(url, 5000);
    if (!response.ok) return cloneDefaultLocalFbxList();

    let fbxFiles;
    try {
      fbxFiles = await response.json();
    } catch {
      return cloneDefaultLocalFbxList();
    }

    if (!Array.isArray(fbxFiles) || fbxFiles.length === 0) {
      return cloneDefaultLocalFbxList();
    }

    const processedFiles = fbxFiles.map((file) => ({
      path: `..${file.path}`,
      name: file.name,
      displayName: file.displayName,
      filename: file.filename,
    }));
    return prependLocalOnlyFbx(processedFiles);
  } catch {
    return cloneDefaultLocalFbxList();
  }
}

export function catalogEntryKey(entry) {
  return String(entry?.filename || entry?.name || "").toLowerCase();
}

export function findSceneObjectForCatalogEntry(editor, entry) {
  if (!editor?.scene || !entry) return null;
  const key = catalogEntryKey(entry);
  const base = key.replace(/\.fbx$/i, "");
  let found = null;

  editor.scene.traverse((o) => {
    if (found || o?.userData?.source !== "motion") return;
    const fileName = String(o.userData?.fileName || "").toLowerCase();
    const filePath = String(o.userData?.filePath || "").toLowerCase();
    const objName = String(o.name || "").toLowerCase();
    const procedural = String(o.userData?.procedural || "").toLowerCase();
    if (entry.procedural && procedural === String(entry.procedural).toLowerCase()) {
      found = o;
      return;
    }
    if (fileName === key || fileName === base) found = o;
    else if (filePath && entry.path && filePath.endsWith(catalogEntryKey(entry))) found = o;
    else if (objName === base || objName === key.replace(/\.fbx$/i, "")) found = o;
  });

  return found;
}

async function spawnWalkLiteInScene(editor, entry, options = {}) {
  const {
    createWalkLitePerformer,
    WALK_LITE_FILENAME,
    colorForWalkLiteGroup,
    WALK_LITE_GROUP_COLORS,
  } = await import("./walkLitePerformer.js");
  const { AddObjectCommand } = await import("../commands/AddObjectCommand.js");
  const { captureMotionWorldReferenceHeight } = await import("./motionDisplayUnits.js");

  const displayName =
    options.displayName || entry.displayName || entry.name || "WalkLite (경량)";

  let color = options.color;
  if (color == null && options.group) {
    color = colorForWalkLiteGroup(editor, options.group);
  }
  if (color == null && Number.isFinite(options.groupIndex)) {
    color = WALK_LITE_GROUP_COLORS[options.groupIndex % WALK_LITE_GROUP_COLORS.length];
  }

  const object = createWalkLitePerformer({ displayName, color });
  object.userData.source = "motion";
  object.userData.fileName = entry.filename || WALK_LITE_FILENAME;
  object.userData.filePath = entry.path || "procedural://walk-lite";
  object.userData.displayName = displayName;
  if (options.group?.id) object.userData.scGroupId = options.group.id;
  object.name = displayName;

  // FBX 로드와 동일: 표시 단위(1.7m) 기준 높이 캡처
  captureMotionWorldReferenceHeight?.(object, editor);

  if (editor.history && AddObjectCommand) {
    editor.execute(new AddObjectCommand(editor, object));
  } else {
    editor.scene.add(object);
    editor.signals?.objectAdded?.dispatch?.(object);
    editor.signals?.sceneGraphChanged?.dispatch?.();
  }

  return object;
}

export async function spawnCatalogEntryInScene(editor, entry, options = {}) {
  const forceNew = !!options.forceNew;
  if (!forceNew) {
    const existing = findSceneObjectForCatalogEntry(editor, entry);
    if (existing) return existing;
  }

  const { isWalkLiteCatalogEntry } = await import("./walkLitePerformer.js");
  if (isWalkLiteCatalogEntry(entry)) {
    return spawnWalkLiteInScene(editor, entry, options);
  }

  const { waitForNewMotionObject, snapshotMotionUuids } = await import("./motionTimelineAutoTrack.js");

  const displayName =
    options.displayName || entry.displayName || entry.name || entry.filename || "Motion";
  const fileBlob = await fetch(entry.path).then((r) => {
    if (!r.ok) throw new Error(`FBX 파일을 불러올 수 없습니다: ${entry.path}`);
    return r.blob();
  });
  const file = new File([fileBlob], entry.filename || entry.name, { type: "application/octet-stream" });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  if (!editor?.loader?.loadFiles) {
    throw new Error("editor.loader.loadFiles를 찾을 수 없습니다.");
  }

  const meta = {
    fileName: entry.filename || entry.name,
    displayName,
    path: entry.path,
  };
  const before = snapshotMotionUuids(editor.scene);
  editor.loader.loadFiles(dataTransfer.files);
  const object = await waitForNewMotionObject(editor, before, meta);
  if (!object) throw new Error("씬에 추가된 모션 객체를 찾을 수 없습니다.");

  object.userData.source = object.userData.source || "motion";
  if (meta.path) object.userData.filePath = meta.path;
  if (meta.fileName) object.userData.fileName = meta.fileName;
  if (meta.displayName) object.userData.displayName = meta.displayName;
  if (displayName) object.name = displayName;

  editor.signals?.objectAdded?.dispatch?.(object);
  editor.signals?.sceneGraphChanged?.dispatch();
  return object;
}

/** @deprecated 그룹 GO는 spawnCatalogEntryInScene + placeOnTimeline 사용 */
export async function ensureCatalogEntryInScene(editor, entry) {
  return spawnCatalogEntryInScene(editor, entry);
}
