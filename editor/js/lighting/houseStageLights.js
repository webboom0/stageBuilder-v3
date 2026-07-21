import * as THREE from "three";
import { NANSEOL_FRONT_SPOT_PRESETS } from "../Sidebar.Nanseol.js";

const STORAGE_KEY = "houseStageLights";

export const FOH_SPOT_SUFFIXES = ["L", "C", "R"];

/** 빔 사이즈 슬라이더 0~1 → SpotLight.angle (rad) */
export const FOH_ANGLE_MIN = 0.22;
export const FOH_ANGLE_MAX = 1.05;

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

const FOH_PRESET_BY_SUFFIX = Object.fromEntries(
  NANSEOL_FRONT_SPOT_PRESETS.map((p) => {
    const suffix = p.name.replace("난설_조명_앞_", "");
    return [suffix, p];
  }),
);

export function size01ToAngle(size01) {
  const s = Math.max(0, Math.min(1, Number(size01) || 0));
  return FOH_ANGLE_MIN + s * (FOH_ANGLE_MAX - FOH_ANGLE_MIN);
}

export function angleToSize01(angle) {
  const a = Number(angle);
  if (!Number.isFinite(a)) return 0.5;
  return Math.max(0, Math.min(1, (a - FOH_ANGLE_MIN) / (FOH_ANGLE_MAX - FOH_ANGLE_MIN)));
}

export function hexToRgb01(hex, fallback = { r: 1, g: 1, b: 1 }) {
  try {
    const c = new THREE.Color(hex);
    return { r: c.r, g: c.g, b: c.b };
  } catch {
    return { ...fallback };
  }
}

export function rgb01ToHex(r, g, b) {
  const c = new THREE.Color(
    Math.max(0, Math.min(1, Number(r) || 0)),
    Math.max(0, Math.min(1, Number(g) || 0)),
    Math.max(0, Math.min(1, Number(b) || 0)),
  );
  return `#${c.getHexString()}`;
}

function defaultSizeForSuffix(suffix) {
  const preset = FOH_PRESET_BY_SUFFIX[suffix];
  return angleToSize01(preset?.angle ?? 0.65);
}

export function getStageGroup(scene) {
  return scene?.children?.find((c) => c.name === "Stage") || null;
}

export function getHouseFillLight(scene) {
  const stage = getStageGroup(scene);
  return stage?.children?.find((c) => c?.name === "_Light" && c?.isHemisphereLight) || null;
}

export function getFohSpot(scene, suffix) {
  return getStageGroup(scene)?.children?.find((c) => c.name === `_StageFrontSpot_${suffix}`) || null;
}

export function defaultHouseLightLevels() {
  return {
    fill: 0,
    fohL: 0,
    fohC: 0,
    fohR: 0,
    colorFill: "#ffffff",
    colorL: "#ffffff",
    colorC: "#ffffff",
    colorR: "#ffffff",
    sizeL: defaultSizeForSuffix("L"),
    sizeC: defaultSizeForSuffix("C"),
    sizeR: defaultSizeForSuffix("R"),
  };
}

export function readHouseLightLevels(scene) {
  const saved = scene?.userData?.[STORAGE_KEY];
  if (saved) return { ...defaultHouseLightLevels(), ...saved };
  return defaultHouseLightLevels();
}

export function persistHouseLightLevels(scene, levels) {
  if (!scene) return;
  if (!scene.userData) scene.userData = {};
  scene.userData[STORAGE_KEY] = { ...levels };
}

function applyFill(scene, levels) {
  const light = getHouseFillLight(scene);
  if (!light) return;
  const base = light.userData?.baseIntensity ?? HOUSE_LIGHT_BASE.fill;
  const level01 = Math.max(0, Math.min(1, Number(levels.fill) || 0));
  light.intensity = level01 * base;
  const rgb = hexToRgb01(levels.colorFill || "#ffffff");
  light.color.setRGB(rgb.r, rgb.g, rgb.b);
}

function applyFoh(scene, suffix, levels) {
  const light = getFohSpot(scene, suffix);
  if (!light) return;
  const key = `foh${suffix}`;
  const colorKey = `color${suffix}`;
  const sizeKey = `size${suffix}`;
  const base = light.userData?.baseIntensity ?? HOUSE_LIGHT_BASE.foh[suffix] ?? 4;
  const level01 = Math.max(0, Math.min(1, Number(levels[key]) || 0));
  light.intensity = level01 * base;
  const rgb = hexToRgb01(levels[colorKey] || "#ffffff");
  light.color.setRGB(rgb.r, rgb.g, rgb.b);
  if (light.angle !== undefined) {
    light.angle = size01ToAngle(levels[sizeKey] ?? 0.5);
  }
}

/** 하우스·FOH 전체 적용 (밝기·색·사이즈) */
export function applyHouseLightLevels(editor, levels) {
  const scene = editor?.scene;
  if (!scene) return;
  const merged = { ...defaultHouseLightLevels(), ...levels };
  applyFill(scene, merged);
  applyFoh(scene, "L", merged);
  applyFoh(scene, "C", merged);
  applyFoh(scene, "R", merged);
  persistHouseLightLevels(scene, merged);
  editor.signals?.rendererUpdated?.dispatch?.();
}

export function setHouseLightLevel(editor, key, level01) {
  const levels = readHouseLightLevels(editor.scene);
  levels[key] = Math.max(0, Math.min(1, Number(level01) || 0));
  applyHouseLightLevels(editor, levels);
  return levels;
}

/** colorFill / colorL|C|R — #rrggbb */
export function setHouseLightColor(editor, key, hex) {
  const levels = readHouseLightLevels(editor.scene);
  levels[key] = String(hex || "#ffffff");
  applyHouseLightLevels(editor, levels);
  return levels;
}

/** sizeL|C|R — 0~1 */
export function setHouseLightSize(editor, key, size01) {
  const levels = readHouseLightLevels(editor.scene);
  levels[key] = Math.max(0, Math.min(1, Number(size01) || 0));
  applyHouseLightLevels(editor, levels);
  return levels;
}

/** 채널 스냅샷 (타임라인 키프레임용) */
export function getHouseChannelCapture(editor, channel) {
  const levels = readHouseLightLevels(editor?.scene);
  if (channel === "fill") {
    const rgb = hexToRgb01(levels.colorFill);
    return {
      dim: Math.round((levels.fill ?? 0) * 100),
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      size: 50,
    };
  }
  const suffix = channel; // L | C | R
  const rgb = hexToRgb01(levels[`color${suffix}`]);
  return {
    dim: Math.round((levels[`foh${suffix}`] ?? 0) * 100),
    r: rgb.r,
    g: rgb.g,
    b: rgb.b,
    size: Math.round((levels[`size${suffix}`] ?? 0.5) * 100),
  };
}

export function applyHouseChannelCapture(editor, channel, cap) {
  const levels = readHouseLightLevels(editor?.scene);
  const dim01 = Math.max(0, Math.min(1, (Number(cap.dim) || 0) / 100));
  const size01 = Math.max(0, Math.min(1, (Number(cap.size) ?? 50) / 100));
  const hex = rgb01ToHex(cap.r ?? 1, cap.g ?? 1, cap.b ?? 1);
  if (channel === "fill") {
    levels.fill = dim01;
    levels.colorFill = hex;
  } else {
    levels[`foh${channel}`] = dim01;
    levels[`color${channel}`] = hex;
    levels[`size${channel}`] = size01;
  }
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

export const DEFAULT_STARTUP_GRAND = 0.05;
/** WORK 버튼 ON 시와 동일한 작업등 레벨 */
export const DEFAULT_STARTUP_WORK_LIGHT = 0.62;

export function readStageGrand(scene) {
  return scene?.userData?.stageGrand ?? 0;
}

/** 새 프로젝트 시작 조명 — GRAND 5%(환경광+약한 작업등), FOH·픽스처 0
 *  예전처럼 WORK 62%로 시작하지 않음. GRAND 비율대로만 밝힘.
 */
export function applyStartupBlackout(editor) {
  if (!editor?.scene) return;
  applyHouseLightLevels(editor, defaultHouseLightLevels());
  // GRAND 5% → work(×0.65) + fill(×0.35). WORK 버튼을 따로 62%로 켜지 않음.
  applyStageGrand(editor, DEFAULT_STARTUP_GRAND);
  // grand*0.35 Fill만으로는 거의 암전 → 무대 윤곽이 보이도록 Fill 하한
  const fillFloor = 0.12;
  const levels = readHouseLightLevels(editor.scene);
  if ((levels.fill ?? 0) < fillFloor) {
    setHouseLightLevel(editor, "fill", fillFloor);
  }
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
