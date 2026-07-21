import * as THREE from "three";
import { AddObjectCommand } from "./commands/AddObjectCommand.js";
import { RemoveObjectCommand } from "./commands/RemoveObjectCommand.js";
import { aimPanTilt } from "./lighting/fixtureRig.js";
import { fixtureTrackId } from "./lighting/fixtureLightTimeline.js";
import { applyHouseLightLevels } from "./lighting/houseStageLights.js";
import { applyGroupMotionColor } from "./utils/walkLitePerformer.js";
import {
  normalizeSegment,
  SEGMENT_KIND,
  syncLegacyFieldsFromSegments,
} from "./showcontrol/groupSegments.js";
import { computeFormationOffsets } from "./showcontrol/groupFormation.js";
import {
  clearObjectMotionKeyframes,
  persistMemberBaseAppearance,
} from "./showcontrol/groupTimelineKeyframes.js";

/**
 * 5막 꿈꾸는 나라 — 녹화모션_1 기준 동선 + 조정된 홀드
 *
 * 0~32    효명세자 중앙 대기 → 쓰러짐·소멸
 * 33~93   악단: 격자 입장 → 15s 홀드 → 원형 이동 10s → 15s 홀드 → 퇴장
 * 95~125  효명 재등장 + 정조·천록 (홀드 10s)
 * 128~168 도장·이야기꾼 (이야기꾼 입장 ~10s)
 */

const MOVE_DUR = 10;
const S1_HOLD = 30;
const S3_HOLD = 10; // 정조·천록·효명 동시 홀드 (기존 30 → 10)
const AKDAN_GRID_HOLD = 15;
const AKDAN_REFORM = 10; // 격자 → 원형
const AKDAN_CIRCLE_HOLD = 15; // 원형 홀드 (CUE 키 이름 유지)

/** 큐 타임 (초) */
const CUE = {
  s1SpotIn: 1,
  s1Hold: S1_HOLD, // 30
  s1Gone: S1_HOLD + 2, // 32
  s2Start: S1_HOLD + 3, // 33
  s2Arrive: S1_HOLD + 3 + MOVE_DUR, // 43
  s2GridHoldEnd: S1_HOLD + 3 + MOVE_DUR + AKDAN_GRID_HOLD, // 58
  s2CircleArrive:
    S1_HOLD + 3 + MOVE_DUR + AKDAN_GRID_HOLD + AKDAN_REFORM, // 68
  s2CircleHoldEnd:
    S1_HOLD +
    3 +
    MOVE_DUR +
    AKDAN_GRID_HOLD +
    AKDAN_REFORM +
    AKDAN_CIRCLE_HOLD, // 83
  s2Gone:
    S1_HOLD +
    3 +
    MOVE_DUR +
    AKDAN_GRID_HOLD +
    AKDAN_REFORM +
    AKDAN_CIRCLE_HOLD +
    MOVE_DUR, // 93
  s3Start:
    S1_HOLD +
    3 +
    MOVE_DUR +
    AKDAN_GRID_HOLD +
    AKDAN_REFORM +
    AKDAN_CIRCLE_HOLD +
    MOVE_DUR +
    2, // 95
  s3Arrive:
    S1_HOLD +
    3 +
    MOVE_DUR +
    AKDAN_GRID_HOLD +
    AKDAN_REFORM +
    AKDAN_CIRCLE_HOLD +
    MOVE_DUR +
    2 +
    MOVE_DUR, // 105
  s3HoldEnd:
    S1_HOLD +
    3 +
    MOVE_DUR +
    AKDAN_GRID_HOLD +
    AKDAN_REFORM +
    AKDAN_CIRCLE_HOLD +
    MOVE_DUR +
    2 +
    MOVE_DUR +
    S3_HOLD, // 115
  s3Gone:
    S1_HOLD +
    3 +
    MOVE_DUR +
    AKDAN_GRID_HOLD +
    AKDAN_REFORM +
    AKDAN_CIRCLE_HOLD +
    MOVE_DUR +
    2 +
    MOVE_DUR +
    S3_HOLD +
    MOVE_DUR, // 125
  s5Start: 128,
  s5Approach: 138, // 이야기꾼 입장 10초
  s5Turn: 139.2,
  s5Face: 143,
  s5Hold: 160,
  s5Gone: 168,
  end: 175,
};

const DURATION = CUE.end;

/** @deprecated 조명/나무 호환 — 악단 무대 체류 끝(원형 홀드 종료) */
CUE.s2HoldEnd = CUE.s2CircleHoldEnd;

/** 큐 오프셋 실행용 스냅샷 (4·5막 통합 시) */
const CUE_BASE = { ...CUE };
let RUN_DURATION = DURATION;

function beginCueOffset(t0 = 0, totalDuration = null) {
  const offset = Number(t0) || 0;
  for (const k of Object.keys(CUE_BASE)) {
    if (typeof CUE_BASE[k] === "number") CUE[k] = CUE_BASE[k] + offset;
  }
  CUE.s2HoldEnd = CUE.s2CircleHoldEnd;
  RUN_DURATION = totalDuration != null ? Number(totalDuration) : CUE.end;
}

function endCueOffset() {
  Object.assign(CUE, CUE_BASE);
  CUE.s2HoldEnd = CUE.s2CircleHoldEnd;
  RUN_DURATION = DURATION;
}

/** 난설 나무 — 무대 뒤쪽 배치 */
const DREAM_BG_TREES = [
  { position: [-121.571, 2.038, -48.961] },
  { position: [-53.429, 2.038, -48.961] },
  { position: [18.12, 2.038, -48.961] },
  { position: [94.683, 2.038, -48.961] },
  { position: [-141.627, 2.038, 5.365] },
  { position: [125.389, 2.038, 5.365] },
  { position: [-90, 2.038, -95] },
  { position: [90, 2.038, -95] },
];

/** 악단 대기 배치(AKDAN_HOLD)를 덮는 마당 — 여유 패딩 포함 */
const DREAM_COURTYARD = {
  position: [0, 0.35, 90],
  // x: -80~80 / z: 35~150 근처 (악단 그리드 + 효명·도장 동선)
  scale: [170, 0.7, 130],
  color: 0xb8a990,
};

const DREAM_NAMOO_PATH = "../files/fbx/Namoo.fbx";
const DREAM_NAMOO_SCALE = 0.137;
const DREAM_CHAR1_PATH = "../files/fbx/Character1.fbx";
const DREAM_CHAR2_PATH = "../files/fbx/Character2.fbx";
/** Character FBX는 Loader autoScale(목표치수 30) 유지 — 녹화본 4.98은 잘못된 값 */
const CHAR_SCALE_FALLBACK = 0.148;

const COLOR = {
  hyomyeong: 0x3366ff,
  jeongjo: 0xff2222,
  chorus: 0xffffff,
  dochang: 0x88aacc,
  storyteller: 0xd4b896,
  cheonrok: 0x4dff00,
};

/** 천록 — 5막.zip 저장본 기준 스케일 */
const CHEONROK_SCALE = [6.1244863059115415, 6.677943566970517, 9.09090922226919];

const DREAM_AUDIO = {
  path: "../files/music/hoegwang_banjo.wav",
  name: "hoegwang_banjo",
  displayName: "회광반조",
  filename: "hoegwang_banjo.wav",
};

/** 악단 12인 — 녹화본 입장/대기/퇴장 좌표 */
const AKDAN_ENTER_Z = [
  -100.68, -90.68, -80.68, -70.68, -60.68, -50.68, -40.68, -30.68, -20.68, -10.68, -0.68, 9.32,
];
const AKDAN_HOLD = [
  [-59.14, 0, 52.92],
  [-19.14, 0, 52.92],
  [20.86, 0, 52.92],
  [60.86, 0, 52.92],
  [-59.14, 0, 92.92],
  [-19.14, 0, 92.92],
  [20.86, 0, 92.92],
  [60.86, 0, 92.92],
  [-59.14, 0, 132.92],
  [-19.14, 0, 132.92],
  [20.86, 0, 132.92],
  [60.86, 0, 132.92],
];
const AKDAN_EXIT_Z = [
  -117.45, -107.45, -97.45, -87.45, -77.45, -67.45, -57.45, -47.45, -37.45, -27.45, -17.45, -7.45,
];
const AKDAN_ENTER_X = 266.45;
const AKDAN_EXIT_X = -278.67;
const AKDAN_ANCHOR = { x: 0.86, z: 92.92 };
const AKDAN_SPACING = 40;
const AKDAN_CIRCLE_SPACING = 30;
/** 격자 대기 → 원형 대기 좌표 */
const AKDAN_CIRCLE = computeFormationOffsets(12, "circle", AKDAN_CIRCLE_SPACING).map((o) => [
  AKDAN_ANCHOR.x + o.x,
  0,
  AKDAN_ANCHOR.z + o.z,
]);

/** 픽스처 MH(11~16): 위에서 비추는 스포트 — House FOH는 쓰지 않음 */
const DREAM_FX = {
  hyoSpot: [13], // 중앙 MH — 효명 고정
  jeongFollow: [15], // 우측 MH — 정조·천록 추적
  blueL: [12], // 도장
  blueR: [16], // 이야기꾼
};

const WHITE = { r: 1, g: 1, b: 1 };
const YELLOW = { r: 1, g: 0.78, b: 0.28 };
const BLUE = { r: 0.35, g: 0.55, b: 1 };

/** 씬1 효명 천장 MH — dim/빔 (pan/tilt는 aim으로 계산) */
const HYO_S1_SPOT = {
  dim: 95,
  zoom: 38,
  focus: 35,
  ...WHITE,
};

const STAGEBUILDER_ASSET_BASE_URL =
  (typeof window !== "undefined" && window.STAGEBUILDER_ASSET_BASE_URL) || "";

const resolveAssetUrl = (relativePath) => {
  if (!STAGEBUILDER_ASSET_BASE_URL) return relativePath;
  const base = String(STAGEBUILDER_ASSET_BASE_URL);
  const baseWithSlash = base.endsWith("/") ? base : `${base}/`;
  return new URL(String(relativePath).replace(/^\.\.\//, ""), baseWithSlash).toString();
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function showDreamLoading(message) {
  const existing = document.getElementById("hyomyeong-loading-modal");
  if (existing) {
    const msgEl = existing.querySelector(".hyomyeong-loading-message");
    if (msgEl) msgEl.textContent = message;
    return () => existing.remove();
  }
  const overlay = document.createElement("div");
  overlay.id = "hyomyeong-loading-modal";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);";
  const card = document.createElement("div");
  card.style.cssText =
    "min-width:260px;max-width:420px;padding:18px 16px;border-radius:10px;background:#111;border:1px solid rgba(255,255,255,0.12);color:#fff;font-family:system-ui,sans-serif;display:flex;gap:12px;align-items:center;";
  const spinner = document.createElement("div");
  spinner.style.cssText =
    "width:18px;height:18px;border-radius:50%;border:2px solid rgba(255,255,255,0.25);border-top-color:#fff;animation:hyomyeong-spin 0.9s linear infinite;flex-shrink:0;";
  const msg = document.createElement("div");
  msg.className = "hyomyeong-loading-message";
  msg.textContent = message;
  msg.style.fontSize = "14px";
  card.appendChild(spinner);
  card.appendChild(msg);
  overlay.appendChild(card);
  if (!document.getElementById("hyomyeong-loading-style")) {
    const style = document.createElement("style");
    style.id = "hyomyeong-loading-style";
    style.textContent =
      "@keyframes hyomyeong-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}";
    document.head.appendChild(style);
  }
  document.body.appendChild(overlay);
  return () => overlay.remove();
}

function ensureTimelineDuration(editor, seconds = DURATION) {
  const sec = Math.max(60, Math.ceil(Number(seconds) || DURATION));
  try {
    const tl = window.timeline || editor?.timeline;
    if (typeof tl?.applyTimelineSettings === "function") {
      tl.applyTimelineSettings({ totalSeconds: sec });
      return;
    }
    if (!tl?.timelineSettings) return;
    tl.timelineSettings.totalSeconds = sec;
    Object.values(tl.timelines || {}).forEach((t) => {
      t?.updateSettings?.({ totalSeconds: sec });
    });
    tl.recreateTimeRuler?.();
    tl.updateTimelineUI?.();
    if (editor.scene) {
      editor.scene.userData = editor.scene.userData || {};
      editor.scene.userData.timeline = editor.scene.userData.timeline || {};
      editor.scene.userData.timeline.totalSeconds = sec;
    }
  } catch (e) {
    console.warn("[꿈꾸는 나라] 타임라인 길이 설정 실패:", e);
  }
}

function resolveMotionTimeline(editor) {
  try {
    editor.connectTimelineInstances?.();
  } catch (e) {
    /* ignore */
  }
  return (
    editor.motionTimeline ||
    window.timeline?.timelines?.motion ||
    window.motionTimeline ||
    null
  );
}

async function resolveLightTimeline(editor) {
  try {
    window.timeline?.switchTimeline?.("light");
  } catch (e) {
    /* ignore */
  }
  try {
    const lightSec = document.querySelector(".tl-section-light");
    if (lightSec?.classList.contains("tl-section--collapsed")) {
      lightSec.classList.remove("tl-section--collapsed");
      lightSec.querySelector(".sec")?.setAttribute("aria-expanded", "true");
    }
  } catch (e) {
    /* ignore */
  }

  let lt = null;
  for (let i = 0; i < 30; i++) {
    try {
      editor.connectTimelineInstances?.();
    } catch (e) {
      /* ignore */
    }
    lt =
      editor.lightTimeline ||
      window.timeline?.timelines?.light ||
      window.lightTimeline ||
      null;
    if (lt) break;
    await delay(40);
  }
  if (lt) editor.lightTimeline = lt;
  return lt;
}

function removeLegacyLightTracks(lt, editor) {
  if (!lt?.tracks) return;
  const ids = [];
  lt.tracks.forEach((_t, id) => {
    if (String(id).startsWith("light_")) ids.push(id);
  });
  ids.forEach((id) => {
    lt.tracks.get(id)?.element?.remove();
    lt.tracks.delete(id);
  });
  const sceneRemovals = [];
  editor.scene?.traverse?.((obj) => {
    const n = obj?.name || "";
    if (/^light_\d+$/.test(n) || /^light_\d+_/.test(n)) sceneRemovals.push(obj);
  });
  for (let i = sceneRemovals.length - 1; i >= 0; i--) {
    try {
      editor.execute(new RemoveObjectCommand(editor, sceneRemovals[i]));
    } catch (e) {
      sceneRemovals[i]?.parent?.remove?.(sceneRemovals[i]);
    }
  }
}

function clearFixtureKeyframes(lt) {
  const props = ["dim", "pan", "tilt", "color"];
  lt.tracks.forEach((track) => {
    if (!track?.isFixture) return;
    props.forEach((prop) => {
      lt._resolveTrackData?.(track.objectId, prop)?.clearAllKeyframes?.();
    });
    track.sprite?.querySelectorAll?.(".keyframe")?.forEach?.((el) => el.remove());
  });
}

function clearHouseKeyframes(lt) {
  const props = ["dim", "color", "size"];
  lt.tracks.forEach((track) => {
    if (!track?.isHouse) return;
    props.forEach((prop) => {
      lt._resolveTrackData?.(track.objectId, prop)?.clearAllKeyframes?.();
    });
    track.sprite?.querySelectorAll?.(".keyframe")?.forEach?.((el) => el.remove());
  });
}

/** 무대 FOH 스포트 타겟을 캐릭터/군무 위치로 */
function aimStageFrontSpots(editor, aims) {
  const stage = editor.scene?.getObjectByName?.("Stage");
  if (!stage) return;
  Object.entries(aims).forEach(([suffix, pos]) => {
    const target =
      stage.getObjectByName(`_StageFrontSpotTarget_${suffix}`) ||
      stage.children?.find?.((c) => c.name === `_StageFrontSpotTarget_${suffix}`);
    const spot =
      stage.getObjectByName(`_StageFrontSpot_${suffix}`) ||
      stage.children?.find?.((c) => c.name === `_StageFrontSpot_${suffix}`);
    if (target && pos) {
      target.position.set(pos[0], pos[1] ?? 2, pos[2]);
      target.updateMatrixWorld?.(true);
    }
    if (spot) {
      spot.target = target || spot.target;
      spot.visible = true;
    }
  });
}

function writeHouseCue(lt, bridge, houseId, time, cap) {
  const trackId = `house_${houseId}`;
  if (!lt.tracks.has(trackId)) {
    bridge?.ensureTracks?.();
  }
  if (!lt.tracks.has(trackId)) return false;
  if (typeof bridge.writeHouseKeyframesAtTime === "function") {
    bridge.writeHouseKeyframesAtTime(trackId, time, {
      dim: Math.round(Number(cap.dim) || 0),
      r: cap.r ?? 1,
      g: cap.g ?? 1,
      b: cap.b ?? 1,
      size: Math.round(Number(cap.size) ?? 50),
    });
  }
  return true;
}

function fixtureWorldPos(engine, fid) {
  const grp = engine.getFixture?.(fid)?.obj?.grp;
  if (!grp) return null;
  grp.updateWorldMatrix?.(true, false);
  engine.root?.updateMatrixWorld?.(true);
  const v = new THREE.Vector3();
  grp.getWorldPosition(v);
  return [v.x, v.y, v.z];
}

function aimFixture(engine, fid, target) {
  const from = fixtureWorldPos(engine, fid);
  if (!from || !target) return null;
  const aimY = target[1] ?? 2;
  return aimPanTilt(from, [target[0], aimY, target[2]]);
}

/** 정조·천록 사이 중점 (키프레임 경로용) */
function midPathPoint(jeongPos, cheonPos, y = 2) {
  if (!jeongPos) return null;
  if (!cheonPos) return [jeongPos[0], y, jeongPos[2]];
  return [
    (jeongPos[0] + cheonPos[0]) * 0.5,
    y,
    (jeongPos[2] + cheonPos[2]) * 0.5,
  ];
}

/** 두 키 사이 보간 샘플 — 추적 스포트가 경로를 따라가게 */
function densifyPath(points, stepsPerSeg = 4) {
  if (!points?.length) return [];
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    out.push(cur);
    const next = points[i + 1];
    if (!next || stepsPerSeg < 2) continue;
    for (let s = 1; s < stepsPerSeg; s++) {
      const u = s / stepsPerSeg;
      out.push({
        t: cur.t + (next.t - cur.t) * u,
        p: [
          cur.p[0] + (next.p[0] - cur.p[0]) * u,
          cur.p[1] + (next.p[1] - cur.p[1]) * u,
          cur.p[2] + (next.p[2] - cur.p[2]) * u,
        ],
      });
    }
  }
  return out;
}

function writeFxCue(lt, bridge, fid, time, cap) {
  const trackId = fixtureTrackId(fid);
  if (!lt.tracks.has(trackId)) return false;
  if (typeof bridge.writeFixtureKeyframesAtTime === "function") {
    bridge.writeFixtureKeyframesAtTime(trackId, time, cap);
  } else {
    lt.addKeyframeForProperty(trackId, "dim", time, Math.round(Number(cap.dim) || 0));
    lt.addKeyframeForProperty(trackId, "pan", time, Math.round(Number(cap.pan) || 0));
    lt.addKeyframeForProperty(trackId, "tilt", time, Math.round(Number(cap.tilt) || 0));
    lt.addKeyframeForProperty(
      trackId,
      "color",
      time,
      new THREE.Vector3(cap.r ?? 1, cap.g ?? 1, cap.b ?? 1)
    );
    if (cap.zoom != null) {
      lt.addKeyframeForProperty(trackId, "zoom", time, Math.round(Number(cap.zoom) || 0));
    }
    if (cap.focus != null) {
      lt.addKeyframeForProperty(trackId, "focus", time, Math.round(Number(cap.focus) || 0));
    }
  }
  return true;
}

/** 장면별 조명 (House FOH 스포트 미사용 — 천장 MH만)
 * 1) 효명: MH #13 위에서 1개만
 * 2) 악단: 스포트 전부 OFF(보간 방지 키 포함), Fill 노란 면광만
 * 3) 효명 MH #13 고정 + 정조·천록 MH #15 추적
 * 5) 도장/이야기꾼: MH #12/#16 블루
 */
async function injectDreamLightsToTimeline(editor, followTargets = {}, lightOpts = {}) {
  const lt = await resolveLightTimeline(editor);
  if (!lt) {
    alert("조명 타임라인을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.");
    return [];
  }

  removeLegacyLightTracks(lt, editor);
  if (typeof editor.initFixtureEngine !== "function") {
    alert("FixtureEngine을 찾을 수 없습니다.");
    return [];
  }

  const engine = editor.initFixtureEngine({ build: true });
  await delay(60);
  const bridge = lt.fixtureBridge;
  const houseBridge = lt.houseBridge;
  if (!bridge?.ensureTracks) {
    alert("Fixture 조명 브릿지가 없습니다.");
    return [];
  }
  const n = bridge.ensureTracks() || 0;
  houseBridge?.ensureTracks?.();
  if (!n || !engine?.built) {
    alert("픽스처 리그 생성에 실패했습니다.");
    return [];
  }

  const preserve = !!lightOpts.preserveExisting;
  if (!preserve) {
    clearFixtureKeyframes(lt);
    clearHouseKeyframes(lt);
  }

  const homeOf = (fid) => {
    const f = engine.getFixture(fid);
    return {
      pan: Math.round(Number(f?.attr?.pan ?? f?.home?.pan) || 0),
      tilt: Math.round(Number(f?.attr?.tilt ?? f?.home?.tilt) || 35),
    };
  };
  const aimOf = (fid, target) => {
    const a = aimFixture(engine, fid, target);
    if (!a) return homeOf(fid);
    return { pan: Math.round(a.pan), tilt: Math.round(a.tilt) };
  };

  const allFids = engine.getFixtures().map((f) => f.fid);
  /** dim=0 + home — 구간 보간으로 빔이 살아나지 않게 여러 시각에 고정 */
  const offAllFx = (t) => {
    allFids.forEach((fid) => {
      writeFxCue(lt, bridge, fid, t, { dim: 0, ...homeOf(fid), ...WHITE });
    });
  };
  const offAllHouse = (t) => {
    ["fill", "fohL", "fohC", "fohR"].forEach((id) => {
      writeHouseCue(lt, houseBridge, id, t, { dim: 0, size: 35, ...WHITE });
    });
  };
  /** House FOH는 전 구간 끔 (앞에서 비추는 핀스팟) */
  const pinFohOff = (times) => {
    times.forEach((t) => {
      ["fohL", "fohC", "fohR"].forEach((id) => {
        writeHouseCue(lt, houseBridge, id, t, { dim: 0, size: 35, ...WHITE });
      });
    });
  };

  const hyoPos = followTargets.hyomyeong || [-12.29, 2, 50];
  const hyoCenter = followTargets.hyomyeongCenter || [0, 2, 50];
  const dojPos = followTargets.dojang || [-13.82, 2, 85.34];
  const storyPos = followTargets.storyteller || [17.49, 2, 82.42];
  const jeongPath = densifyPath(
    followTargets.jeongjoPath || [
      { t: CUE.s3Start, p: [261.11, 0, -108.51] },
      { t: CUE.s3Arrive, p: [10.8, 0, 59.55] },
      { t: CUE.s3HoldEnd, p: [10.8, 0, 59.55] },
    ],
    5
  );
  const cheonPath = densifyPath(
    followTargets.cheonrokPath || [
      { t: CUE.s3Start, p: [271.11, 0, -108.51] },
      { t: CUE.s3Arrive, p: [25.8, 0, 59.55] },
      { t: CUE.s3HoldEnd, p: [25.8, 0, 59.55] },
    ],
    5
  );

  // 월드 행렬 갱신 후 aim (리그 fit 직후 로컬 좌표만 있으면 빗나감)
  engine.root?.updateMatrixWorld?.(true);
  engine.reaimHomes?.();

  // House FOH 핀스팟은 쓰지 않음 — 물리 라이트도 0으로
  try {
    applyHouseLightLevels(editor, { fill: 0, fohL: 0, fohC: 0, fohR: 0 });
  } catch (e) {
    /* ignore */
  }

  if (!preserve) {
    offAllFx(0);
    offAllHouse(0);
  }
  pinFohOff([
    CUE.s1SpotIn,
    CUE.s1Hold,
    CUE.s1Gone,
    CUE.s2Start,
    CUE.s2Arrive,
    CUE.s2GridHoldEnd,
    CUE.s2CircleArrive,
    CUE.s2CircleHoldEnd,
    CUE.s2Gone,
    CUE.s3Start,
    CUE.s3Arrive,
    CUE.s3HoldEnd,
    CUE.s3Gone,
    CUE.s5Start,
    CUE.s5Approach,
    CUE.s5Hold,
    CUE.s5Gone,
    RUN_DURATION,
  ]);

  // —— Scene 1: 천장 MH #13 → 효명 (aim + 캡처 zoom/focus/dim) ——
  DREAM_FX.hyoSpot.forEach((fid) => {
    const a = aimOf(fid, hyoCenter);
    const cue = {
      dim: HYO_S1_SPOT.dim,
      pan: a.pan,
      tilt: a.tilt,
      zoom: HYO_S1_SPOT.zoom,
      focus: HYO_S1_SPOT.focus,
      ...WHITE,
    };
    console.log(`[꿈꾸는 나라] 씬1 MH#${fid} aim → pan ${cue.pan} tilt ${cue.tilt}`);
    writeFxCue(lt, bridge, fid, CUE.s1SpotIn, cue);
    writeFxCue(lt, bridge, fid, CUE.s1Hold, cue);
    writeFxCue(lt, bridge, fid, CUE.s1Gone, { ...cue, dim: 0 });
  });

  // —— Scene 2: 악단 — 스포트 OFF 고정(보간 차단) + Fill 노랑만 ——
  [CUE.s2Start, CUE.s2Arrive, CUE.s2GridHoldEnd, CUE.s2CircleArrive, CUE.s2CircleHoldEnd, CUE.s2Gone].forEach(
    (t) => offAllFx(t)
  );
  writeHouseCue(lt, houseBridge, "fill", CUE.s2Start, {
    dim: 0,
    size: 50,
    ...YELLOW,
  });
  writeHouseCue(lt, houseBridge, "fill", CUE.s2Arrive, {
    dim: 38,
    size: 50,
    ...YELLOW,
  });
  writeHouseCue(lt, houseBridge, "fill", CUE.s2GridHoldEnd, {
    dim: 36,
    size: 50,
    ...YELLOW,
  });
  writeHouseCue(lt, houseBridge, "fill", CUE.s2CircleArrive, {
    dim: 36,
    size: 50,
    ...YELLOW,
  });
  writeHouseCue(lt, houseBridge, "fill", CUE.s2CircleHoldEnd, {
    dim: 34,
    size: 50,
    ...YELLOW,
  });
  writeHouseCue(lt, houseBridge, "fill", CUE.s2Gone, {
    dim: 0,
    size: 50,
    ...YELLOW,
  });

  // —— Scene 3: MH #13 효명 고정 + MH #15 정조·천록 추적
  // 퇴장 구간은 추적하지 않고, 홀드 조준 유지한 채 두 스포트 페이드아웃 ——
  DREAM_FX.hyoSpot.forEach((fid) => {
    const a = aimOf(fid, hyoPos);
    const cue = {
      dim: 82,
      ...a,
      zoom: HYO_S1_SPOT.zoom,
      focus: HYO_S1_SPOT.focus,
      ...WHITE,
    };
    writeFxCue(lt, bridge, fid, CUE.s3Start, cue);
    writeFxCue(lt, bridge, fid, CUE.s3HoldEnd, cue);
    // pan/tilt 고정, dim만 0으로 — 따라가지 않음
    writeFxCue(lt, bridge, fid, CUE.s3Gone, { ...cue, dim: 0 });
  });

  DREAM_FX.jeongFollow.forEach((fid) => {
    const n = Math.min(jeongPath.length, cheonPath.length);
    let holdAim = null;
    for (let i = 0; i < n; i++) {
      const t = jeongPath[i].t;
      const mid = midPathPoint(jeongPath[i].p, cheonPath[i].p, 2);
      const a = aimOf(fid, mid);
      holdAim = a;
      writeFxCue(lt, bridge, fid, t, {
        dim: 90,
        ...a,
        zoom: 32,
        focus: 35,
        ...WHITE,
      });
    }
    const holdMid = midPathPoint(
      followTargets.jeongjoHold || [10.8, 0, 59.55],
      followTargets.cheonrokHold || [25.8, 0, 59.55],
      2
    );
    const fadeAim = holdAim || aimOf(fid, holdMid);
    // 퇴장: 홀드 조준 유지 + 서서히 소등 (추적 없음)
    writeFxCue(lt, bridge, fid, CUE.s3HoldEnd, {
      dim: 90,
      ...fadeAim,
      zoom: 32,
      focus: 35,
      ...WHITE,
    });
    writeFxCue(lt, bridge, fid, CUE.s3Gone, {
      dim: 0,
      ...fadeAim,
      zoom: 32,
      focus: 35,
      ...WHITE,
    });
    console.log(
      `[꿈꾸는 나라] 정조·천록 MH#${fid} hold aim (퇴장 페이드)`,
      holdMid,
      fadeAim
    );
  });

  // —— Scene 5: MH 블루 2개 (도장 / 이야기꾼) ——
  // s3Gone은 위에서 이미 dim0. 나머지 FX는 s5에서도 끔 유지
  offAllFx(CUE.s5Start);
  offAllHouse(CUE.s5Start);

  const writeBlueSpot = (fids, target) => {
    fids.forEach((fid) => {
      const a = aimOf(fid, target);
      const cue = { ...a, zoom: 27, focus: 35, ...BLUE };
      writeFxCue(lt, bridge, fid, CUE.s5Start, { ...cue, dim: 0 });
      writeFxCue(lt, bridge, fid, CUE.s5Approach, { ...cue, dim: 80 });
      writeFxCue(lt, bridge, fid, CUE.s5Hold, { ...cue, dim: 75 });
      writeFxCue(lt, bridge, fid, CUE.s5Gone, { ...cue, dim: 0 });
    });
  };
  writeBlueSpot(DREAM_FX.blueL, dojPos);
  writeBlueSpot(DREAM_FX.blueR, storyPos);
  offAllHouse(CUE.s5Gone);

  if (lt.timelineData) {
    lt.timelineData.maxTime = Math.max(lt.timelineData.maxTime || 0, RUN_DURATION);
    lt.timelineData.dirty = true;
    lt.timelineData.precomputeAnimationData?.(
      undefined,
      lt.options?.totalSeconds ?? RUN_DURATION,
      lt.options?.framesPerSecond ?? 30
    );
  }
  lt.currentTime = 0;
  bridge.restoreKeyframeUI?.();
  houseBridge?.restoreKeyframeUI?.();
  bridge.applyAtTime?.(0);
  houseBridge?.applyAtTime?.(0);
  try {
    lt.onBeforeSave?.();
  } catch (e) {
    /* ignore */
  }
  try {
    editor.refreshMaConsole?.();
  } catch (e) {
    /* ignore */
  }

  console.log("[꿈꾸는 나라] 조명 큐 — 천장 MH 스포트 / FOH 핀 미사용");
  return allFids;
}

function ensureMotionTrack(mt, obj, name) {
  if (!mt || !obj) return false;
  let trackEl = mt.container?.querySelector(`.timeline-track[data-uuid="${obj.uuid}"]`);
  if (!trackEl) {
    mt._addTrackInternal?.(obj.uuid, obj.id, name || obj.name || "Motion", true, {
      skipValidation: true,
    });
  }
  if (!mt.timelineData.getTrackByUuid(obj.uuid, "visible")) {
    mt.timelineData.addTrack(obj.uuid, "visible");
  }
  return true;
}

/** 로드/생성 직후 스케일 유지 (autoScale 우선) */
function resolveObjectScale(obj, fallback = CHAR_SCALE_FALLBACK) {
  const auto = Number(obj?.userData?.autoScale);
  if (Number.isFinite(auto) && auto > 0) return auto;
  const sx = Number(obj?.scale?.x);
  if (Number.isFinite(sx) && sx > 0) return sx;
  return fallback;
}

function scaleVec(obj, fallback = CHAR_SCALE_FALLBACK) {
  const s = resolveObjectScale(obj, fallback);
  return [s, s, s];
}

/** 녹화본처럼 position/rotation/scale 전체 저장 (radian euler)
 * options.skipScaleKeyframe: 그룹 멤버용 — scale은 baseScale로만 유지
 */
function poseAtFull(mt, obj, time, pos, rot = [0, 0, 0], scale = null, options = {}) {
  if (!mt || !obj) return;
  ensureMotionTrack(mt, obj, obj.name);
  obj.position.set(pos[0], pos[1] ?? 0, pos[2]);
  obj.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  const skipScaleKf = options.skipScaleKeyframe === true;
  if (scale != null) {
    if (Array.isArray(scale)) obj.scale.set(scale[0], scale[1], scale[2]);
    else obj.scale.setScalar(scale);
  } else if (!skipScaleKf) {
    const s = resolveObjectScale(obj);
    obj.scale.setScalar(s);
  }

  // rotationAxisLock=y 여도 녹화본 회전(Z 쓰러짐 등)을 살리기 위해 직접 기록
  const props = {
    position: new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z),
    rotation: new THREE.Vector3(obj.rotation.x, obj.rotation.y, obj.rotation.z),
  };
  if (!skipScaleKf) {
    props.scale = new THREE.Vector3(obj.scale.x, obj.scale.y, obj.scale.z);
  }
  Object.entries(props).forEach(([prop, value]) => {
    let track = mt.timelineData.getTrackByUuid(obj.uuid, prop);
    if (!track) track = mt.timelineData.addTrack(obj.uuid, prop);
    if (!track) return;
    const idx = track.findKeyframeIndex(time);
    if (idx !== -1) track.updateKeyframeValue?.(idx, value);
    else track.addKeyframe(time, value);
  });
}

function poseAt(mt, obj, time, pos, rotYDeg = 0, scale = null, rotX = 0) {
  poseAtFull(
    mt,
    obj,
    time,
    pos,
    [rotX, THREE.MathUtils.degToRad(rotYDeg), 0],
    scale
  );
}

function setVisibleKeys(mt, obj, keys) {
  if (!mt || !obj) return;
  ensureMotionTrack(mt, obj, obj.name);
  const vt = mt.timelineData.getTrackByUuid(obj.uuid, "visible");
  if (!vt) return;
  if (typeof vt.clearAllKeyframes === "function") {
    vt.clearAllKeyframes();
  } else {
    while (vt.keyframeCount > 0) vt.removeKeyframeByIndex(0);
  }
  keys.forEach(([t, v]) => {
    vt.addKeyframe(t, !!v);
  });
}

function clearObjectMotionKeys(mt, obj) {
  if (!mt || !obj) return;
  ["position", "rotation", "scale", "visible"].forEach((prop) => {
    const td = mt.timelineData.getTrackByUuid(obj.uuid, prop);
    if (!td) return;
    if (typeof td.clearAllKeyframes === "function") td.clearAllKeyframes();
    else while (td.keyframeCount > 0) td.removeKeyframeByIndex(0);
  });
}

function appendDreamNationButton(parentPanel, editor) {
  const wrap = document.createElement("div");
  wrap.className = "nanseol-button-wrap";
  wrap.style.paddingTop = "0";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nanseol-apply-button sb-dock-btn sb-dock-btn--wide sb-dock-btn--accent";
  btn.textContent = "꿈꾸는 나라";
  btn.title =
    "5막 꿈꾸는 나라 3분 — 녹화 동선 + 대기 30초(효명→악단→정조·천록→도장/이야기꾼)";

  btn.addEventListener("click", () => applyDreamNation(editor));
  wrap.appendChild(btn);

  const host = parentPanel?.dom || parentPanel;
  if (host) host.appendChild(wrap);
  return wrap;
}

async function applyDreamNation(editor, options = {}) {
  const hideLoading = options.skipLoading
    ? () => {}
    : showDreamLoading(options.loadingMessage || "꿈꾸는 나라 무대 로딩 중...");
  const t0 = Number(options.timeOffset) || 0;
  const totalDur =
    options.totalDuration != null ? Number(options.totalDuration) : t0 + DURATION;
  beginCueOffset(t0, totalDur);
  try {
    ensureTimelineDuration(editor, totalDur);

    try {
      const cam = editor.viewportCamera || editor.camera;
      if (cam) {
        cam.position.set(0, 72, 280);
        cam.rotation.set(-0.12, 0, 0);
        if (cam.fov !== undefined) {
          cam.fov = 42;
          cam.updateProjectionMatrix();
        }
        cam.near = 0.01;
        cam.far = 1000;
        cam.updateMatrixWorld();
        editor.signals?.cameraChanged?.dispatch();
        editor.signals?.viewportCameraChanged?.dispatch();
      }
    } catch (e) {
      console.warn("[꿈꾸는 나라] 카메라 실패:", e);
    }

    // 이전 프리셋 / 꿈꾸는나라 그룹 정리
    const removeList = [];
    editor.scene.traverse((obj) => {
      const ud = obj.userData || {};
      if (
        ud.dreamNation ||
        ud.hyomyeongPreset ||
        ud.hyomyeongNamoo ||
        ud.hyomyeongBox ||
        ud.hyomyeongFrontSpot ||
        ud.hyomyeongFill ||
        ud.nanseolPreset ||
        ud.nanseolNamoo ||
        ud.nanseolBox ||
        ud.nanseolFrontSpot
      ) {
        removeList.push(obj);
      }
    });
    for (let i = removeList.length - 1; i >= 0; i--) {
      editor.execute(new RemoveObjectCommand(editor, removeList[i]));
    }

    try {
      const sc = editor.showControl;
      if (sc?.ensureGroups) {
        const killNames = ["꿈꾸는나라", "악단", "정조와천록"];
        const old = sc
          .ensureGroups()
          .filter((g) =>
            killNames.some((n) => String(g.name || "").includes(n))
          );
        old.forEach((g) => sc.deleteGroup(g.id));
      }
    } catch (e) {
      /* ignore */
    }

    try {
      const stage = editor.scene.getObjectByName("Stage");
      const hemi = stage?.children?.find?.(
        (c) => c?.name === "_Light" && c?.isHemisphereLight
      );
      if (hemi) {
        hemi.userData = hemi.userData || {};
        if (hemi.userData._dreamPrevIntensity === undefined) {
          hemi.userData._dreamPrevIntensity = hemi.intensity;
        }
        hemi.intensity = 0.04;
      }
      ["_StageFrontSpot_L", "_StageFrontSpot_C", "_StageFrontSpot_R"].forEach((n) => {
        const L = editor.scene.getObjectByName(n);
        if (L?.isLight) {
          L.userData = L.userData || {};
          if (L.userData._dreamPrevIntensity === undefined) {
            L.userData._dreamPrevIntensity = L.intensity;
          }
          L.intensity = 0.03;
        }
      });
      editor.signals?.rendererUpdated?.dispatch();
    } catch (e) {
      /* ignore */
    }

    try {
      editor.videoBackground?.removeVideoBackground?.();
      editor.signals?.showHelpersChanged?.dispatch({
        gridHelper: false,
        guideHelper: false,
        cameraHelpers: false,
        lightHelpers: false,
        skeletonHelpers: false,
      });
    } catch (e) {
      /* ignore */
    }

    // 마당
    const courtyard = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: DREAM_COURTYARD.color,
        roughness: 0.92,
        metalness: 0.05,
      })
    );
    courtyard.name = "연경당_마당";
    courtyard.position.set(...DREAM_COURTYARD.position);
    courtyard.scale.set(...DREAM_COURTYARD.scale);
    courtyard.receiveShadow = true;
    courtyard.userData.dreamNation = true;
    editor.execute(new AddObjectCommand(editor, courtyard));

    // 배경 나무
    const treeGroup = new THREE.Group();
    treeGroup.name = "꿈꾸는나라_배경나무";
    treeGroup.userData.dreamNation = true;
    treeGroup.userData.source = "motion";
    try {
      const res = await fetch(resolveAssetUrl(DREAM_NAMOO_PATH));
      if (!res.ok) throw new Error(`Namoo ${res.status}`);
      const buf = await res.arrayBuffer();
      const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
      const root = new FBXLoader().parse(buf);
      for (let i = 0; i < DREAM_BG_TREES.length; i++) {
        const obj = i === 0 ? root : root.clone(true);
        obj.name = `배경나무_${i + 1}`;
        obj.position.set(...DREAM_BG_TREES[i].position);
        obj.scale.setScalar(DREAM_NAMOO_SCALE);
        obj.userData.dreamNation = true;
        treeGroup.add(obj);
      }
    } catch (e) {
      console.warn("[꿈꾸는 나라] 배경 나무 실패:", e);
    }
    editor.execute(new AddObjectCommand(editor, treeGroup));

    // 캐릭터·그룹·모션 (녹화모션_1 기준)
    const cast = await buildCastAndMotion(editor, { treeGroup });

    // 악단 12 + 정조와천록
    await deployAkdanGroup(editor);
    await deployJeongjoCheonrokGroup(editor);

    // 조명 — 정조·천록 동선 좌표로 스포트 추적
    await injectDreamLightsToTimeline(
      editor,
      {
        hyomyeongCenter: [0, 2, 50],
        hyomyeong: [-12.29, 2, 50],
        jeongjoHold: [10.8, 0, 59.55],
        cheonrokHold: [25.8, 0, 59.55],
        dojang: [-13.82, 2, 85.34],
        storyteller: [17.49, 2, 82.42],
        jeongjoPath: [
          { t: CUE.s3Start, p: [261.11, 0, -108.51] },
          { t: CUE.s3Arrive, p: [10.8, 0, 59.55] },
          { t: CUE.s3HoldEnd, p: [10.8, 0, 59.55] },
        ],
        cheonrokPath: [
          { t: CUE.s3Start, p: [271.11, 0, -108.51] },
          { t: CUE.s3Arrive, p: [25.8, 0, 59.55] },
          { t: CUE.s3HoldEnd, p: [25.8, 0, 59.55] },
        ],
      },
      {
        preserveExisting: !!options.preserveLights,
        totalDuration: totalDur,
      }
    );

    if (!options.skipAudio) {
      try {
        if (editor.audioTimeline?.addAudioFromAsset) {
          await editor.audioTimeline.addAudioFromAsset(DREAM_AUDIO);
        }
      } catch (e) {
        console.warn("[꿈꾸는 나라] 오디오 실패:", e);
      }
    }

    if (typeof editor.deselect === "function") editor.deselect();
    console.log("[꿈꾸는 나라] 녹화 모션 연출 적용 완료", cast?.names, {
      timeOffset: t0,
      totalDur,
    });
  } catch (e) {
    console.error("[꿈꾸는 나라] 실패:", e);
    alert(`꿈꾸는 나라 적용 오류: ${e.message || e}`);
  } finally {
    endCueOffset();
    hideLoading();
  }
}

async function deployAkdanGroup(editor) {
  const sc = editor.showControl;
  const mt = resolveMotionTimeline(editor);
  if (!sc) {
    console.warn("[꿈꾸는 나라] showControl 없음 — 악단 스킵");
    return null;
  }

  try {
    window.timeline?.switchTimeline?.("motion");
  } catch (e) {
    /* ignore */
  }

  const catalog = await sc.ensureFbxCatalog();
  const walk = catalog?.find((c) => c.procedural === "walk-lite") || catalog?.[0];
  if (!walk) {
    console.warn("[꿈꾸는 나라] WalkLite 카탈로그 없음");
    return null;
  }

  const group = sc.createGroup("악단");
  group.color = "#ffffff";
  group.startTime = CUE.s2Start;
  group.fromX = AKDAN_ENTER_X;
  group.fromZ = -45;
  group.fromRotY = 0;
  group.fromFormation = "line";
  group.fromFormationSpacing = 10;
  group.formation = "grid";
  group.formationSpacing = AKDAN_SPACING;
  group.toX = AKDAN_ANCHOR.x;
  group.toZ = AKDAN_ANCHOR.z;
  group.toRotY = 0;
  group.segments = [
    normalizeSegment(
      {
        kind: SEGMENT_KIND.move,
        duration: CUE.s2Arrive - CUE.s2Start,
        formation: "grid",
        formationSpacing: AKDAN_SPACING,
        anchorX: AKDAN_ANCHOR.x,
        anchorZ: AKDAN_ANCHOR.z,
        toRotY: 0,
      },
      group
    ),
    normalizeSegment(
      {
        kind: SEGMENT_KIND.hold,
        duration: CUE.s2GridHoldEnd - CUE.s2Arrive,
        formation: "grid",
        formationSpacing: AKDAN_SPACING,
        anchorX: AKDAN_ANCHOR.x,
        anchorZ: AKDAN_ANCHOR.z,
        toRotY: 0,
      },
      group
    ),
    normalizeSegment(
      {
        kind: SEGMENT_KIND.move,
        duration: CUE.s2CircleArrive - CUE.s2GridHoldEnd,
        formation: "circle",
        formationSpacing: AKDAN_CIRCLE_SPACING,
        anchorX: AKDAN_ANCHOR.x,
        anchorZ: AKDAN_ANCHOR.z,
        toRotY: 0,
      },
      group
    ),
    normalizeSegment(
      {
        kind: SEGMENT_KIND.hold,
        duration: CUE.s2CircleHoldEnd - CUE.s2CircleArrive,
        formation: "circle",
        formationSpacing: AKDAN_CIRCLE_SPACING,
        anchorX: AKDAN_ANCHOR.x,
        anchorZ: AKDAN_ANCHOR.z,
        toRotY: 0,
      },
      group
    ),
    normalizeSegment(
      {
        kind: SEGMENT_KIND.exit,
        duration: CUE.s2Gone - CUE.s2CircleHoldEnd,
        formation: "line",
        formationSpacing: 10,
        anchorX: AKDAN_EXIT_X,
        anchorZ: -60,
        toRotY: 0,
      },
      group
    ),
  ];
  syncLegacyFieldsFromSegments(group);
  sc.persistToSceneUserData?.();

  for (let i = 0; i < 12; i++) {
    sc.addCatalogSlotToGroup(group.id, walk, 0);
  }

  await sc.deployGroup(group.id);

  (group.members || []).forEach((m, i) => {
    const obj = editor.scene.getObjectByProperty("uuid", m.deployedUuid);
    if (!obj) return;
    applyGroupMotionColor(obj, COLOR.chorus);
    obj.userData.dreamNation = true;
    obj.userData.dreamChorus = true;
    if (!mt) return;

    clearObjectMotionKeys(mt, obj);
    const grid = AKDAN_HOLD[i] || [0, 0, 50];
    const circle = AKDAN_CIRCLE[i] || grid;
    const ez = AKDAN_ENTER_Z[i] ?? -50;
    const xz = AKDAN_EXIT_Z[i] ?? -60;
    poseAtFull(mt, obj, CUE.s2Start, [AKDAN_ENTER_X, 0, ez], [0, 0, 0], null);
    poseAtFull(mt, obj, CUE.s2Arrive, grid, [0, 0, 0], null);
    poseAtFull(mt, obj, CUE.s2GridHoldEnd, grid, [0, 0, 0], null);
    poseAtFull(mt, obj, CUE.s2CircleArrive, circle, [0, 0, 0], null);
    poseAtFull(mt, obj, CUE.s2CircleHoldEnd, circle, [0, 0, 0], null);
    poseAtFull(mt, obj, CUE.s2Gone, [AKDAN_EXIT_X, 0, xz], [0, 0, 0], null);
    setVisibleKeys(mt, obj, [
      [0, false],
      [CUE.s2Start, true],
      [CUE.s2Gone, false],
    ]);
  });

  console.log("[꿈꾸는 나라] 악단 12명 배치 (격자→원형)");
  return group;
}

async function deployJeongjoCheonrokGroup(editor) {
  const sc = editor.showControl;
  const mt = resolveMotionTimeline(editor);
  if (!sc) return null;

  const catalog = await sc.ensureFbxCatalog();
  const walk = catalog?.find((c) => c.procedural === "walk-lite") || catalog?.[0];
  const cheonEntry =
    catalog?.find((c) => c.procedural === "cheonrok-lite") || catalog?.[1];
  if (!walk) return null;

  const group = sc.createGroup("정조와천록");
  group.color = "#ff2222";
  group.startTime = CUE.s3Start;
  group.fromX = 266;
  group.fromZ = -108.51;
  group.fromRotY = 0;
  group.formation = "line";
  group.formationSpacing = 15;
  group.toX = 18;
  group.toZ = 59.55;
  group.toRotY = 0;
  group.segments = [
    normalizeSegment(
      {
        kind: SEGMENT_KIND.move,
        duration: CUE.s3Arrive - CUE.s3Start,
        formation: "line",
        formationSpacing: 15,
        anchorX: 18,
        anchorZ: 59.55,
        toRotY: 0,
      },
      group
    ),
    normalizeSegment(
      {
        kind: SEGMENT_KIND.hold,
        duration: CUE.s3HoldEnd - CUE.s3Arrive,
        formation: "line",
        formationSpacing: 15,
        anchorX: 18,
        anchorZ: 59.55,
        toRotY: 0,
      },
      group
    ),
    normalizeSegment(
      {
        kind: SEGMENT_KIND.exit,
        duration: CUE.s3Gone - CUE.s3HoldEnd,
        formation: "line",
        formationSpacing: 15,
        anchorX: 238,
        anchorZ: -47.71,
        toRotY: 0,
      },
      group
    ),
  ];
  syncLegacyFieldsFromSegments(group);
  sc.persistToSceneUserData?.();

  sc.addCatalogSlotToGroup(group.id, walk, 0);
  if (cheonEntry) sc.addCatalogSlotToGroup(group.id, cheonEntry, 1);

  // persistToSceneUserData가 그룹을 clone하므로 항상 getGroup으로 최신 참조 사용
  const gid = group.id;
  const live = () => sc.getGroup(gid) || group;
  {
    const g = live();
    const mems = g.members || [];
    const cheonMem =
      mems.find(
        (m) =>
          String(m?.filename || "").toLowerCase().includes("cheonrok") ||
          String(m?.path || "").includes("cheonrok-lite") ||
          String(m?.displayName || "").includes("천록")
      ) || mems[1];
    const jeongMem = mems.find((m) => m && m !== cheonMem) || mems[0];
    if (jeongMem) jeongMem.tintColor = COLOR.jeongjo;
    if (cheonMem) {
      cheonMem.baseScale = {
        x: CHEONROK_SCALE[0],
        y: CHEONROK_SCALE[1],
        z: CHEONROK_SCALE[2],
      };
      cheonMem.tintColor = COLOR.cheonrok;
    }
    sc.persistToSceneUserData?.();
  }

  await sc.deployGroup(gid);

  const gAfter = live();
  const members = gAfter.members || [];
  const cheonMember =
    members.find(
      (m) =>
        String(m?.filename || "").toLowerCase().includes("cheonrok") ||
        String(m?.path || "").includes("cheonrok-lite") ||
        String(m?.displayName || "").includes("천록")
    ) || members[1];
  const jeongMember = members.find((m) => m && m !== cheonMember) || members[0];

  let jeongObj = jeongMember?.deployedUuid
    ? editor.scene.getObjectByProperty("uuid", jeongMember.deployedUuid)
    : null;
  let cheonObj = cheonMember?.deployedUuid
    ? editor.scene.getObjectByProperty("uuid", cheonMember.deployedUuid)
    : null;

  if (!cheonObj) {
    editor.scene.traverse((o) => {
      if (cheonObj) return;
      if (o.userData?.procedural === "cheonrok-lite" || o.userData?.dreamCheonrok) {
        cheonObj = o;
      }
    });
  }
  if (!jeongObj) {
    editor.scene.traverse((o) => {
      if (jeongObj) return;
      if (
        o.userData?.scGroupId === gid &&
        o.userData?.procedural === "walk-lite" &&
        o !== cheonObj
      ) {
        jeongObj = o;
      }
    });
  }

  const noScale = { skipScaleKeyframe: true };

  if (jeongObj) {
    applyGroupMotionColor(jeongObj, COLOR.jeongjo);
    jeongObj.name = "WalkLite (경량) · 정조와천록";
    jeongObj.userData.dreamNation = true;
    jeongObj.userData.tintColor = COLOR.jeongjo;
    jeongObj.userData.scCustomTint = true;
    if (jeongMember) {
      jeongMember.tintColor = COLOR.jeongjo;
      jeongMember.deployedUuid = jeongObj.uuid;
    }
    if (mt) {
      clearObjectMotionKeys(mt, jeongObj);
      poseAtFull(mt, jeongObj, CUE.s3Start, [261.11, 0, -108.51], [0, 0, 0], null, noScale);
      poseAtFull(mt, jeongObj, CUE.s3Arrive, [10.8, 0, 59.55], [0, 0, 0], null, noScale);
      poseAtFull(mt, jeongObj, CUE.s3HoldEnd, [10.8, 0, 59.55], [0, 0, 0], null, noScale);
      poseAtFull(mt, jeongObj, CUE.s3Gone + 0.05, [233.27, 0, -47.71], [0, 0, 0], null, noScale);
      setVisibleKeys(mt, jeongObj, [
        [0, false],
        [CUE.s3Start, true],
        [CUE.s3Gone, false],
      ]);
      clearObjectMotionKeyframes(mt, jeongObj.uuid, { only: ["scale"] });
    }
    persistMemberBaseAppearance(editor, jeongObj);
  }

  if (cheonObj) {
    const scaleVec3 = {
      x: CHEONROK_SCALE[0],
      y: CHEONROK_SCALE[1],
      z: CHEONROK_SCALE[2],
    };
    if (cheonMember) {
      cheonMember.baseScale = { ...scaleVec3 };
      cheonMember.tintColor = COLOR.cheonrok;
      cheonMember.deployedUuid = cheonObj.uuid;
    }
    cheonObj.name = "천록 (경량) · 정조와천록";
    cheonObj.userData.dreamNation = true;
    cheonObj.userData.dreamCheonrok = true;
    cheonObj.userData.tintable = true;
    cheonObj.userData.scCustomTint = true;
    cheonObj.userData.scGroupId = gid;
    if (cheonMember?.id) cheonObj.userData.scMemberId = cheonMember.id;
    cheonObj.userData.tintColor = COLOR.cheonrok;
    cheonObj.userData.walkLiteColor = COLOR.cheonrok;
    cheonObj.userData.dreamCheonrokScale = [...CHEONROK_SCALE];
    cheonObj.scale.set(scaleVec3.x, scaleVec3.y, scaleVec3.z);
    applyGroupMotionColor(cheonObj, COLOR.cheonrok);
    cheonObj.traverse((o) => {
      if (!o.isMesh || o.userData?.isTesterBadge) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mat) => {
        if (mat?.color?.setHex) {
          mat.color.setHex(COLOR.cheonrok);
          mat.needsUpdate = true;
        }
      });
    });

    if (mt) {
      clearObjectMotionKeys(mt, cheonObj);
      poseAtFull(mt, cheonObj, CUE.s3Start, [271.11, 0, -108.51], [0, 0, 0], CHEONROK_SCALE, noScale);
      poseAtFull(mt, cheonObj, CUE.s3Arrive, [25.8, 0, 59.55], [0, 0, 0], CHEONROK_SCALE, noScale);
      poseAtFull(mt, cheonObj, CUE.s3HoldEnd, [25.8, 0, 59.55], [0, 0, 0], CHEONROK_SCALE, noScale);
      poseAtFull(mt, cheonObj, CUE.s3Gone, [243.27, 0, -47.71], [0, 0, 0], CHEONROK_SCALE, noScale);
      setVisibleKeys(mt, cheonObj, [
        [0, false],
        [CUE.s3Start, true],
        [CUE.s3Gone, false],
      ]);
      clearObjectMotionKeyframes(mt, cheonObj.uuid, { only: ["scale"] });
      mt.timelineData.dirty = true;
      mt.timelineData.precomputeAnimationData?.(
        mt.getClipInfoCallback?.(),
        RUN_DURATION,
        mt.fps || 30
      );
      mt.updateAnimation?.(CUE.s3Arrive);
    }
    persistMemberBaseAppearance(editor, cheonObj);
    const gFinal = live();
    const cm = (gFinal.members || []).find((m) => m?.deployedUuid === cheonObj.uuid);
    if (cm) {
      cm.baseScale = { ...scaleVec3 };
      cm.tintColor = COLOR.cheonrok;
    }
    cheonObj.scale.set(scaleVec3.x, scaleVec3.y, scaleVec3.z);
    applyGroupMotionColor(cheonObj, COLOR.cheonrok);
  } else {
    console.warn("[꿈꾸는 나라] 천록 객체를 찾지 못함 — tint/scale 미적용");
  }

  sc.persistToSceneUserData?.();
  editor.signals?.sceneGraphChanged?.dispatch?.();
  editor.signals?.rendererUpdated?.dispatch?.();
  console.log("[꿈꾸는 나라] 정조와천록 배치", {
    cheonUuid: cheonObj?.uuid,
    cheonScale: cheonObj ? [cheonObj.scale.x, cheonObj.scale.y, cheonObj.scale.z] : null,
    cheonTint: cheonObj?.userData?.tintColor,
  });
  return live();
}

async function buildCastAndMotion(editor, { treeGroup }) {
  const mt = resolveMotionTimeline(editor);
  if (!mt) {
    console.warn("[꿈꾸는 나라] motionTimeline 없음");
  }

  const hyo = await loadCharacterFbx(editor, DREAM_CHAR1_PATH, "Character1.fbx", "효명세자");
  if (hyo) {
    applyGroupMotionColor(hyo, COLOR.hyomyeong);
    hyo.userData.dreamNation = true;
    hyo.name = "효명세자";
  }

  const doj = await loadCharacterFbx(editor, DREAM_CHAR2_PATH, "Character2.fbx", "도장");
  if (doj) {
    applyGroupMotionColor(doj, COLOR.dochang);
    doj.userData.dreamNation = true;
    doj.name = "도장";
  }

  const storyteller = await loadCharacterFbx(
    editor,
    DREAM_CHAR1_PATH,
    "Character1.fbx",
    "이야기꾼"
  );
  if (storyteller) {
    applyGroupMotionColor(storyteller, COLOR.storyteller);
    storyteller.userData.dreamNation = true;
    storyteller.name = "이야기꾼";
  }

  if (!mt) {
    return { names: ["no-mt"] };
  }

  [hyo, doj, storyteller, treeGroup]
    .filter(Boolean)
    .forEach((o) => ensureMotionTrack(mt, o, o.name));

  // —— 나무: 악단 구간만 ——
  if (treeGroup) {
    clearObjectMotionKeys(mt, treeGroup);
    poseAtFull(mt, treeGroup, 0, [0, -200, 0], [0, 0, 0], 0.001);
    poseAtFull(mt, treeGroup, CUE.s2Start - 0.05, [0, -200, 0], [0, 0, 0], 0.001);
    poseAtFull(mt, treeGroup, CUE.s2Start, [0, 0, 0], [0, 0, 0], 1);
    poseAtFull(mt, treeGroup, CUE.s2CircleHoldEnd, [0, 0, 0], [0, 0, 0], 1);
    poseAtFull(mt, treeGroup, CUE.s2Gone, [0, -200, 0], [0, 0, 0], 0.001);
    setVisibleKeys(mt, treeGroup, [
      [0, false],
      [CUE.s2Start, true],
      [CUE.s2Gone, false],
    ]);
  }

  // —— 효명세자 (녹화본) ——
  if (hyo) {
    clearObjectMotionKeys(mt, hyo);
    const sc = scaleVec(hyo);
    poseAtFull(mt, hyo, CUE.s1Hold, [0, 1.89, 50], [0, 0, 0], sc);
    poseAtFull(mt, hyo, CUE.s1Gone, [0, 1.89, 50], [0, 0, 1.48], sc);
    poseAtFull(mt, hyo, CUE.s3Start, [-12.29, 1.89, 50], [0, 0, 0], sc);
    poseAtFull(mt, hyo, CUE.s3HoldEnd, [-12.29, 1.89, 50], [0, 0, 0], sc);
    poseAtFull(mt, hyo, CUE.s3Gone, [233.32, 1.89, -35.89], [0, 0, 0], sc);
    setVisibleKeys(mt, hyo, [
      [0, false],
      [CUE.s1SpotIn, true],
      [CUE.s1Gone, false],
      [CUE.s3Start, true],
      [CUE.s3Gone, false],
    ]);
  }

  // —— 도장 (녹화본) ——
  if (doj) {
    clearObjectMotionKeys(mt, doj);
    const sc = scaleVec(doj);
    poseAtFull(mt, doj, 0, [-19.57, 1.89, 85.34], [0, 0, 0], sc);
    poseAtFull(mt, doj, CUE.s5Start, [-13.82, 1.89, 85.34], [0, 0, 0], sc);
    poseAtFull(mt, doj, CUE.s5Approach, [-13.82, 1.89, 85.34], [0, 0, 0], sc);
    poseAtFull(mt, doj, CUE.s5Turn, [-13.82, 1.89, 85.34], [0, 1.57, 0], sc);
    poseAtFull(mt, doj, CUE.s5Hold, [-13.82, 1.89, 85.34], [0, 1.57, 0], sc);
    poseAtFull(mt, doj, CUE.s5Gone, [356.95, 1.89, -113.26], [0, 1.57, 0], sc);
    setVisibleKeys(mt, doj, [
      [0, false],
      [CUE.s5Start, true],
      [CUE.s5Gone, false],
    ]);
  }

  // —— 이야기꾼 (녹화본) ——
  if (storyteller) {
    clearObjectMotionKeys(mt, storyteller);
    const sc = scaleVec(storyteller);
    poseAtFull(mt, storyteller, 0, [342.14, 1.89, -107.7], [0, 0, 0], sc);
    poseAtFull(mt, storyteller, CUE.s5Start, [342.14, 1.89, -107.7], [0, 0, 0], sc);
    poseAtFull(mt, storyteller, CUE.s5Approach, [17.49, 1.89, 82.42], [0, 0, 0], sc);
    poseAtFull(mt, storyteller, CUE.s5Turn, [17.49, 1.89, 82.42], [0, -1.57, 0], sc);
    poseAtFull(mt, storyteller, CUE.s5Face, [17.49, 1.89, 82.42], [0, -1.57, 0], sc);
    poseAtFull(mt, storyteller, CUE.s5Hold, [17.49, 1.89, 82.42], [0, 1.57, 0], sc);
    poseAtFull(mt, storyteller, CUE.s5Gone, [327.13, 1.89, -86.91], [0, 1.57, 0], sc);
    setVisibleKeys(mt, storyteller, [
      [0, false],
      [CUE.s5Start, true],
      [CUE.s5Gone, false],
    ]);
  }

  mt.timelineData.dirty = true;
  mt.timelineData.precomputeAnimationData?.(
    mt.getClipInfoCallback?.(),
    RUN_DURATION,
    mt.fps || 30
  );
  mt.updateUI?.();
  mt.updateAnimation?.(0);

  return {
    names: [hyo?.name, doj?.name, storyteller?.name].filter(Boolean),
  };
}

async function loadCharacterFbx(editor, path, fileName, baseName) {
  if (!editor.loader?.loadFiles) return null;

  const nameLooksLike = (objName) => {
    const n = String(objName || "").toLowerCase();
    const b = String(baseName || "").toLowerCase();
    const f = String(fileName || "").toLowerCase();
    return n === b || n === `${b}.fbx` || n === f || n.includes(f);
  };

  const existing = editor.scene.getObjectByName(baseName);
  if (existing) {
    existing.userData.dreamNation = true;
    return existing;
  }

  const before = new Set();
  editor.scene.traverse((obj) => {
    if (obj?.userData?.source === "motion") before.add(obj.uuid);
  });

  const r = await fetch(resolveAssetUrl(path), { cache: "no-store" });
  if (!r.ok) throw new Error(`${fileName} fetch ${r.status}`);
  const blob = await r.blob();
  const file = new File([blob], fileName, { type: "application/octet-stream" });
  const dt = new DataTransfer();
  dt.items.add(file);

  return new Promise((resolve) => {
    let done = false;
    const signals = editor.signals;
    const startedAt = Date.now();
    const finish = (obj) => {
      if (done) return;
      done = true;
      try {
        signals.objectAdded.remove(handler);
      } catch (e) {
        /* ignore */
      }
      if (obj) obj.userData.dreamNation = true;
      resolve(obj || null);
    };
    const handler = (obj) => {
      if (!obj || before.has(obj.uuid)) return;
      if (obj.userData?.source === "motion" || nameLooksLike(obj.name)) finish(obj);
    };
    signals.objectAdded.add(handler);
    editor.loader.loadFiles(dt.files);
    const poll = () => {
      if (done) return;
      let found = null;
      editor.scene.traverse((obj) => {
        if (found || !obj || before.has(obj.uuid)) return;
        if (obj.userData?.source === "motion") found = obj;
      });
      if (found) return finish(found);
      if (Date.now() - startedAt > 60000) return finish(null);
      setTimeout(poll, 150);
    };
    setTimeout(poll, 200);
  });
}

export {
  appendDreamNationButton,
  applyDreamNation,
  CUE as DREAM_CUE,
  DURATION as DREAM_DURATION,
};
