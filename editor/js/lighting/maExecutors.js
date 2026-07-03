/** grandMA3-style executor presets (페이더 뱅크) */
export const DEFAULT_EXECUTORS = [
  {
    id: 1,
    name: "FOH Warm",
    group: 2,
    look: { dim: 75, r: 1, g: 0.72, b: 0.42 },
  },
  {
    id: 2,
    name: "MH Beam",
    group: 1,
    look: { dim: 100, r: 1, g: 1, b: 1, zoom: 13 },
  },
  {
    id: 3,
    name: "Cyc Blue",
    group: 3,
    look: { dim: 65, r: 0.16, g: 0.34, b: 1 },
  },
  {
    id: 4,
    name: "SpotCross",
    group: 1,
    look: { dim: 90, r: 1, g: 0.95, b: 0.88, pan: 15, tilt: 42 },
  },
  {
    id: 5,
    name: "OpenWhite",
    group: 4,
    look: { dim: 100, r: 1, g: 1, b: 1 },
  },
];

export function loadExecutors(scene) {
  const saved = scene?.userData?.maExecutors;
  if (!Array.isArray(saved) || !saved.length) {
    return DEFAULT_EXECUTORS.map((e) => ({
      ...e,
      level: e.id === 2 || e.id === 4 ? 100 : e.id === 1 ? 30 : e.id === 3 ? 70 : 90,
      selected: e.id === 5,
    }));
  }
  return saved;
}

export function saveExecutors(scene, list) {
  if (!scene.userData) scene.userData = {};
  scene.userData.maExecutors = list.map(({ id, name, group, look, level, selected }) => ({
    id,
    name,
    group,
    look,
    level,
    selected,
  }));
}

export function resolveExecutorIds(fe, groups, exec) {
  if (!fe) return [];
  if (exec.group && groups[exec.group]?.ids?.length) return groups[exec.group].ids;
  return fe.getFixtures?.().map((f) => f.fid) || [];
}

/** 페이더 레벨(0~100)에 맞춰 executor look 적용 */
export function applyExecutorLevel(fe, groups, exec) {
  if (!fe?.built) return;
  const ids = resolveExecutorIds(fe, groups, exec);
  const t = Math.max(0, Math.min(1, (Number(exec.level) || 0) / 100));
  const look = exec.look || {};
  ids.forEach((id) => {
    const f = fe.getFixture(id);
    if (!f) return;
    const dim = Math.round((look.dim ?? 100) * t);
    fe.setProgAttr(id, "dim", dim);
    if (t > 0) {
      if (look.r != null) fe.setProgAttr(id, "r", look.r);
      if (look.g != null) fe.setProgAttr(id, "g", look.g);
      if (look.b != null) fe.setProgAttr(id, "b", look.b);
      if (look.pan != null) fe.setProgAttr(id, "pan", look.pan);
      if (look.tilt != null) fe.setProgAttr(id, "tilt", look.tilt);
      if (look.zoom != null) fe.setProgAttr(id, "zoom", look.zoom);
      if (look.focus != null) fe.setProgAttr(id, "focus", look.focus);
    }
  });
}

/** 현재 선택 상태를 executor에 저장 */
export function storeExecutorFromSelection(fe, exec) {
  if (!fe) return exec;
  const sel = fe.getSelectionIds();
  if (!sel.length) return exec;
  const f0 = fe.getFixture(sel[0]);
  const live = f0?.live || f0?.attr || {};
  exec.look = {
    dim: Math.round(live.dim ?? 0),
    r: live.r ?? 1,
    g: live.g ?? 1,
    b: live.b ?? 1,
    pan: live.pan ?? 0,
    tilt: live.tilt ?? 0,
    zoom: live.zoom ?? 20,
    focus: live.focus ?? 50,
  };
  if (sel.length > 1) exec.group = null;
  return exec;
}
