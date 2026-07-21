import { catalogEntryKey } from "../utils/motionFbxCatalog.js";
import {
  isWalkLiteCatalogEntry,
  isCheonrokCatalogEntry,
  isKkekkoriCatalogEntry,
  WALK_LITE_FILENAME,
  WALK_LITE_PROCEDURAL_ID,
  CHEONROK_FILENAME,
  CHEONROK_PROCEDURAL_ID,
} from "../utils/walkLitePerformer.js";

function memberFilenameKey(member) {
  return catalogEntryKey({ filename: member?.filename, name: member?.displayName });
}

/** WalkLite / 천록 경량 멤버 — 카탈로그 삭제·정리에서 제외 */
export function isWalkLiteGroupMember(member) {
  if (!member || member.actorId != null) return false;
  const fn = String(member.filename || "").toLowerCase();
  if (
    fn === WALK_LITE_FILENAME.toLowerCase() ||
    fn === "walklite" ||
    fn === CHEONROK_FILENAME.toLowerCase() ||
    fn === "cheonroklite" ||
    fn === "cheonrok" ||
    fn === "kkekkorilite.fbx" ||
    fn === "kkekkorilite" ||
    fn === "kkekkori"
  ) {
    return true;
  }
  const path = String(member.path || "").toLowerCase();
  if (
    path.includes("procedural://walk-lite") ||
    path.includes(WALK_LITE_PROCEDURAL_ID) ||
    path.includes("procedural://cheonrok-lite") ||
    path.includes(CHEONROK_PROCEDURAL_ID) ||
    path.includes("procedural://kkekkori-lite") ||
    path.includes("kkekkori-lite")
  ) {
    return true;
  }
  return false;
}

function buildFilenameIndex(catalog) {
  const map = new Map();
  (catalog || []).forEach((entry, index) => {
    const key = catalogEntryKey(entry);
    if (key) map.set(key, { entry, index });
  });
  return map;
}

function findLiteProceduralCatalogIndex(catalog, predicate) {
  return (catalog || []).findIndex((entry) => predicate(entry));
}

/**
 * FBX 카탈로그 변경 시 그룹 멤버를 filename 기준으로 재매핑.
 * 카탈로그에서 사라진 FBX 멤버는 제거 (WalkLite·천록 제외).
 */
export function syncGroupMembersWithCatalog(showControl, catalog) {
  if (!showControl) return { removed: 0, updated: 0 };

  const byFilename = buildFilenameIndex(catalog);
  const walkLiteIdx = findLiteProceduralCatalogIndex(catalog, isWalkLiteCatalogEntry);
  const cheonrokIdx = findLiteProceduralCatalogIndex(catalog, isCheonrokCatalogEntry);
  const kkekkoriIdx = findLiteProceduralCatalogIndex(catalog, isKkekkoriCatalogEntry);
  let removed = 0;
  let updated = 0;

  for (const group of showControl.ensureGroups()) {
    const kept = [];
    for (const member of group.members || []) {
      if (!member || typeof member !== "object") continue;

      // Actor 슬롯은 FBX 카탈로그와 무관
      if (member.actorId != null) {
        kept.push(member);
        continue;
      }

      // 경량 프로시저럴 — 항상 유지, 인덱스만 갱신
      if (isWalkLiteGroupMember(member)) {
        const isCheonrok =
          isCheonrokCatalogEntry(member) ||
          String(member.filename || "")
            .toLowerCase()
            .includes("cheonrok");
        const isBird =
          isKkekkoriCatalogEntry(member) ||
          String(member.filename || "")
            .toLowerCase()
            .includes("kkekkori") ||
          String(member.path || "")
            .toLowerCase()
            .includes("kkekkori");
        const idx = isBird ? kkekkoriIdx : isCheonrok ? cheonrokIdx : walkLiteIdx;
        if (idx >= 0) {
          const entry = catalog[idx];
          if (member.catalogIndex !== idx) updated++;
          member.catalogIndex = idx;
          member.filename = entry.filename || member.filename;
          member.path = entry.path || member.path;
        }
        kept.push(member);
        continue;
      }

      const key = memberFilenameKey(member);
      const hit = key ? byFilename.get(key) : null;
      if (!hit) {
        removed++;
        if (member?.id) showControl.selectedGroupMemberIds?.delete?.(member.id);
        continue;
      }

      const { entry, index } = hit;
      let changed = false;
      if (member.catalogIndex !== index) {
        member.catalogIndex = index;
        changed = true;
      }
      if (entry.filename && member.filename !== entry.filename) {
        member.filename = entry.filename;
        changed = true;
      }
      if (entry.path && member.path !== entry.path) {
        member.path = entry.path;
        changed = true;
      }
      if (changed) updated++;
      kept.push(member);
    }
    group.members = kept;
  }

  // FBX 슬롯 선택 — 범위 밖 인덱스만 제거
  if (showControl.selectedFbxSlotIndices?.size) {
    for (const idx of [...showControl.selectedFbxSlotIndices]) {
      if (idx < 0 || idx >= catalog.length) {
        showControl.selectedFbxSlotIndices.delete(idx);
      }
    }
  }

  if (removed > 0 || updated > 0) {
    showControl.persistToSceneUserData();
  }

  return { removed, updated };
}
