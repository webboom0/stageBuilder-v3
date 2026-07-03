import { NANSEOL_FRONT_SPOT_PRESETS } from "../Sidebar.Nanseol.js";

const STORAGE_KEY = "houseStageLights";

export const FOH_SPOT_SUFFIXES = ["L", "C", "R"];

/** NANSEOL 프리셋 기준 최대 밝기 (슬라이더 100% = 이 값) */
export const HOUSE_LIGHT_BASE = {
  fill: 0.92,
  foh: Object.fromEntries(
    NANSEOL_FRONT_SPOT_PRESETS.map((p) => [
      p.name.replace("난설_조명_앞_", ""),
      p.intensity,
    ]),
  ),
};

export function getStageGroup(scene) {
  return scene?.children?.find((c) => c.name === "Stage") || null;
}

export function getHouseFillLight(scene) {
  const stage = getStageGroup(scene);
  return stage?.children?.find((c) => c.name === "_Light" && c.isHemisphereLight) || null;
}

export function getFohSpot(scene, suffix) {
  return getStageGroup(scene)?.children?.find((c) => c.name === `_StageFrontSpot_${suffix}`) || null;
}

export function readHouseLightLevels(scene) {
  const saved = scene?.userData?.[STORAGE_KEY];
  if (saved) return { ...defaultHouseLightLevels(), ...saved };
  return defaultHouseLightLevels();
}

export function defaultHouseLightLevels() {
  return {
    fill: 0,
    fohL: 0,
    fohC: 0,
    fohR: 0,
  };
}

export function persistHouseLightLevels(scene, levels) {
  if (!scene) return;
  if (!scene.userData) scene.userData = {};
  scene.userData[STORAGE_KEY] = { ...levels };
}

function applyFill(scene, level01) {
  const light = getHouseFillLight(scene);
  if (!light) return;
  const base = light.userData?.baseIntensity ?? HOUSE_LIGHT_BASE.fill;
  light.intensity = Math.max(0, Math.min(1, level01)) * base;
}

function applyFoh(scene, suffix, level01) {
  const light = getFohSpot(scene, suffix);
  if (!light) return;
  const base = light.userData?.baseIntensity ?? HOUSE_LIGHT_BASE.foh[suffix] ?? 4;
  light.intensity = Math.max(0, Math.min(1, level01)) * base;
}

/** 0~1 슬라이더 → 하우스·FOH 조명 적용 */
export function applyHouseLightLevels(editor, levels) {
  const scene = editor?.scene;
  if (!scene) return;
  applyFill(scene, levels.fill ?? 0);
  applyFoh(scene, "L", levels.fohL ?? 0);
  applyFoh(scene, "C", levels.fohC ?? 0);
  applyFoh(scene, "R", levels.fohR ?? 0);
  persistHouseLightLevels(scene, levels);
  editor.signals?.rendererUpdated?.dispatch?.();
}

export function setHouseLightLevel(editor, key, level01) {
  const levels = readHouseLightLevels(editor.scene);
  levels[key] = Math.max(0, Math.min(1, Number(level01) || 0));
  applyHouseLightLevels(editor, levels);
  return levels;
}

/** GRAND — 무대 전체 밝기 (WORK + Stage Fill). 핀·픽스처 스팟과 분리 */
export function applyStageGrand(editor, level01) {
  const v = Math.max(0, Math.min(1, Number(level01) || 0));
  if (!editor?.scene) return v;
  if (!editor.scene.userData) editor.scene.userData = {};
  editor.scene.userData.stageGrand = v;
  editor._stageGrand = v;
  editor.setWorkLightLevel?.(v * 0.65);
  setHouseLightLevel(editor, "fill", v * 0.35);
  return v;
}

export const DEFAULT_STARTUP_GRAND = 0.1;

export function readStageGrand(scene) {
  return scene?.userData?.stageGrand ?? 0;
}

/** 새 프로젝트 시작 조명 — GRAND 10%, FOH·픽스처 출력 0 */
export function applyStartupBlackout(editor) {
  if (!editor?.scene) return;
  applyHouseLightLevels(editor, defaultHouseLightLevels());
  applyStageGrand(editor, DEFAULT_STARTUP_GRAND);
  const fe = editor.fixtureEngine;
  if (fe) {
    if (fe.built) {
      fe.setAllDim?.(0);
    }
    fe.setFixtureBus?.(1);
    fe.setBlackout?.(false);
    fe.clearProgrammer?.();
  }
}

/** ensureDefaultStageLights 직후 — baseIntensity 메타만 보장 */
export function tagHouseLightsForBlackout(stageGroup) {
  if (!stageGroup) return;
  const hemi = stageGroup.children.find((c) => c.name === "_Light" && c.isHemisphereLight);
  if (hemi && hemi.userData.baseIntensity == null) {
    hemi.userData.baseIntensity = HOUSE_LIGHT_BASE.fill;
  }
  for (const suffix of FOH_SPOT_SUFFIXES) {
    const spot = stageGroup.children.find((c) => c.name === `_StageFrontSpot_${suffix}`);
    if (spot && spot.userData.baseIntensity == null) {
      spot.userData.baseIntensity = HOUSE_LIGHT_BASE.foh[suffix] ?? spot.intensity;
    }
  }
}
