import { catalogEntryKey } from "../utils/motionFbxCatalog.js";
import {
  isWalkLiteCatalogEntry,
  WALK_LITE_FILENAME,
  WALK_LITE_PROCEDURAL_ID,
} from "../utils/walkLitePerformer.js";

function memberFilenameKey(member) {
  return catalogEntryKey({ filename: member?.filename, name: member?.displayName });
}

/** WalkLite(테스터) 멤버 — 카탈로그 삭제·정리에서 제외 */
export function isWalkLiteGroupMember(member) {
  if (!member || member.actorId != null) return false;
  const fn = String(member.filename || "").toLowerCase();
  if (fn === WALK_LITE_FILENAME.toLowerCase() || fn === "walklite") return true;
  const path = String(member.path || "").toLowerCase();
  if (path.includes("procedural://walk-lite") || path.includes(WALK_LITE_PROCEDURAL_ID)) {
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

function findWalkLiteCatalogIndex(catalog) {
  return (catalog || []).findIndex((entry) => isWalkLiteCatalogEntry(entry));
}

/**
 * FBX 카탈로그 변경 시 그룹 멤버를 filename 기준으로 재매핑.
 * 카탈로그에서 사라진 FBX 멤버는 제거 (WalkLite 제외).
 */
export function syncGroupMembersWithCatalog(showControl, catalog) {
  if (!showControl) return { removed: 0, updated: 0 };

  const byFilename = buildFilenameIndex(catalog);
  const walkLiteIdx = findWalkLiteCatalogIndex(catalog);
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

      // 테스터(WalkLite) — 항상 유지, 인덱스만 갱신
      if (isWalkLiteGroupMember(member)) {
        if (walkLiteIdx >= 0) {
          const entry = catalog[walkLiteIdx];
          if (member.catalogIndex !== walkLiteIdx) updated++;
          member.catalogIndex = walkLiteIdx;
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
