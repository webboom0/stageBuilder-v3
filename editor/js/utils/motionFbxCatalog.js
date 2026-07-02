import { getFbxApiUrl, FBX_UPLOAD_CONFIG } from "../config/fbx-upload-config.js";

/** 서버 없음·연결 실패·목록 비어 있음 → 패널에 항상 이 목록 표시 (files/fbx) */
export const DEFAULT_LOCAL_FBX_LIST = [
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
    if (fileName === key || fileName === base) found = o;
    else if (filePath && entry.path && filePath.endsWith(catalogEntryKey(entry))) found = o;
    else if (objName === base || objName === key.replace(/\.fbx$/i, "")) found = o;
  });

  return found;
}

export async function spawnCatalogEntryInScene(editor, entry) {
  const existing = findSceneObjectForCatalogEntry(editor, entry);
  if (existing) return existing;

  const { waitForNewMotionObject, snapshotMotionUuids } = await import("./motionTimelineAutoTrack.js");

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
    displayName: entry.displayName || entry.name,
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

  editor.signals?.objectAdded?.dispatch?.(object);
  editor.signals?.sceneGraphChanged?.dispatch();
  return object;
}

/** @deprecated 그룹 GO는 spawnCatalogEntryInScene + placeOnTimeline 사용 */
export async function ensureCatalogEntryInScene(editor, entry) {
  return spawnCatalogEntryInScene(editor, entry);
}
