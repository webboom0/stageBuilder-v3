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
import {
  clearObjectMotionKeyframes,
  persistMemberBaseAppearance,
} from "./showcontrol/groupTimelineKeyframes.js";
import { applyDreamNation, DREAM_DURATION } from "./Sidebar.Hyomyeong.js";

/**
 * 4막 회광반조 — 대본·시뮬레이션 PDF 기준 (~170초)
 * 표정/몸짓 대신 위치·이동·조명으로 서사 전달 (5막 꿈꾸는 나라와 동일 방식)
 *
 * 0~25    씬1 해질녘 황금 — 효명 점검 + 무동 6 좌우 리허설
 * 25~45   씬2 주변 암부 — 권신 2명(김조순·조만영) 입장 관람
 * 45~82   씬3 이야기꾼 변사 — 김조순 쪽 → 조만영 쪽 이동
 * 82~112  씬4 의례 — 천록·꾀꼬리 춤 + 도창 전진 (휘장 한자 암시)
 * 112~150 씬5 보계 위 춘앵무 — 효명 단독 동선(광란 암시 경로)
 * 150~170 씬6 정지·암전 → 탑조명(효명만)
 */

const CUE = {
  s1In: 0,
  s1Inspect: 8,
  s1Hold: 22,
  s2In: 25,
  s2Arrive: 32,
  s2Hold: 42,
  s3In: 45,
  s3Kim: 52,
  s3ToJo: 62,
  s3Jo: 70,
  s3Hold: 80,
  s4In: 82,
  s4Dance: 88,
  s4Dochang: 98,
  s4Hold: 108,
  s5In: 112,
  s5Clear: 116,
  s5OnBogye: 120,
  s5DanceA: 128,
  s5DanceB: 136,
  s5Climax: 145,
  s6Stop: 150,
  s6Black: 155,
  s6Top: 158,
  s6End: 166,
  end: 170,
};

const DURATION = CUE.end;

const COLOR = {
  hyomyeong: 0x3366ff,
  mudong: 0xffffff,
  kim: 0x1a1a28,
  jo: 0x2a2218,
  storyteller: 0xd4b896,
  cheonrok: 0x4dff00,
  kkekkori: 0xffcc33,
  dojang: 0x88aacc,
};

const WHITE = { r: 1, g: 1, b: 1 };
const GOLD = { r: 1, g: 0.78, b: 0.28 };
const WARM_WHITE = { r: 1, g: 0.92, b: 0.78 };

const CHEONROK_SCALE = [6.124, 6.678, 9.091];
const CHAR_SCALE_FALLBACK = 0.148;
const DREAM_CHAR1_PATH = "../files/fbx/Character1.fbx";
const DREAM_CHAR2_PATH = "../files/fbx/Character2.fbx";
const Y = 1.89;

const HOEGWANG_AUDIO = {
  path: "../files/music/hoegwang_banjo.wav",
  name: "hoegwang_banjo",
  displayName: "회광반조",
  filename: "hoegwang_banjo.wav",
};

/** 연경당 앞뜰 */
const COURT = {
  position: [0, 0.35, 55],
  scale: [160, 0.7, 140],
  color: 0xb8a990,
};

/** 보계(補階) — 춘앵무 중심 */
const BOGYE = {
  position: [0, 1.2, 28],
  scale: [36, 2.2, 22],
  color: 0x8a7a62,
};

/** 후면 휘장/스크린 */
const CURTAIN = {
  position: [0, 18, -18],
  scale: [120, 36, 1.2],
  color: 0x3a2f28,
};

/** 화문석 사각 프레임 (씬5) */
const HWAMUN = {
  position: [0, 2.6, 28],
  scale: [22, 0.35, 16],
  color: 0xc4b090,
};

const FX = {
  hyo: [13], // 효명
  story: [12], // 이야기꾼 추적
  kim: [11], // 김조순 / 씬4 천록
  jo: [16], // 조만영
  followL: [11], // 천록
  followR: [16], // 꾀꼬리
  dojang: [15], // 도창 — MH#15 (#26은 FOH 워시라 추적 빔이 어긋남)
  top: [14],
};

/** 조명 aim과 모션 포즈를 동일 좌표로 맞춤 */
const POS = {
  hyoS2: [0, 2, 55],
  kimHold: [-48, 2, 98],
  kimEnter: [-120, 2, 110],
  joHold: [48, 2, 98],
  joEnter: [130, 2, 110],
  storyWatch: [55, 2, 105], // 씬2~씬3 시작 — 옆에서 관망
  storyAtKim: [-40, 2, 95],
  storyAtJo: [40, 2, 95],
  storyMid: [0, 2, 98], // 김→조 이동 중간
  /** 씬4 축원 노래 — 도창과 나란히 */
  storySing: [16, 2, 88],
  /** 모션 Y와 동일 — 스포트 aim도 같은 좌표 사용 */
  dojangEnter: [160, Y, 75],
  dojangSing: [0, Y, 90],
};

/**
 * 무동 6 — 좌3 / 우3
 * 입장: 5막 악단과 같은 윙(X±266)에서 좌·우로 들어옴 (중앙 뒤에서 앞으로 X)
 * 대기: X축 일렬, 중앙 복도는 효명 전용
 */
const MUDONG_Z = 70;
const MUDONG_L = [
  [-70, 0, MUDONG_Z],
  [-55, 0, MUDONG_Z],
  [-40, 0, MUDONG_Z],
];
const MUDONG_R = [
  [40, 0, MUDONG_Z],
  [55, 0, MUDONG_Z],
  [70, 0, MUDONG_Z],
];
/** 리허설: 살짝 더 안쪽 (중앙 |x|<32 는 효명) */
const MUDONG_L2 = [
  [-65, 0, MUDONG_Z],
  [-50, 0, MUDONG_Z],
  [-35, 0, MUDONG_Z],
];
const MUDONG_R2 = [
  [35, 0, MUDONG_Z],
  [50, 0, MUDONG_Z],
  [65, 0, MUDONG_Z],
];
/** 씬4 스포트 aim 좌표 — 조명·천록·꾀꼬리 동선이 동일 값을 씀 */
const SPOT_CHEON = {
  dance: [-100, 0, 50],
  hold: [-95, 0, 92],
};
const SPOT_BIRD = {
  dance: [100, 8, 50],
  mid: [105, 10, 90],
  hold: [100, 8, 95], // followR hold xz (스포트 aim y=2 → 새는 공중 유지)
};
const SPOT_AIM_Y = 2; // 지면 스포트 aim 높이
/** 5막 악단 입장 X와 동일 윙 */
const MUDONG_ENTER_X = 266;
const MUDONG_EXIT_X = 278;
/** 윙에서 겹치지 않게 Z 분산 (5막 ENTER_Z 스타일) */
const MUDONG_ENTER_Z = [55, 70, 85];
const MUDONG_ENTER_DUR = 10;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function showLoading(message) {
  const existing = document.getElementById("hyomyeong-loading-modal");
  if (existing) {
    const msgEl = existing.querySelector(".hyomyeong-loading-message");
    if (msgEl) msgEl.textContent = message;
    return () => existing.remove();
  }
  const overlay = document.createElement("div");
  overlay.id = "hyomyeong-loading-modal";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);";
  const card = document.createElement("div");
  card.style.cssText =
    "min-width:260px;padding:18px 16px;border-radius:10px;background:#111;border:1px solid rgba(255,255,255,0.12);color:#fff;display:flex;gap:12px;align-items:center;font-family:system-ui,sans-serif;";
  const spinner = document.createElement("div");
  spinner.style.cssText =
    "width:18px;height:18px;border-radius:50%;border:2px solid rgba(255,255,255,0.25);border-top-color:#fff;animation:hyomyeong-spin 0.9s linear infinite;";
  const msg = document.createElement("div");
  msg.className = "hyomyeong-loading-message";
  msg.textContent = message;
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
    // 마스터 타임라인 UI(룰러)·모션/조명/오디오 전부 동기화
    if (typeof tl?.applyTimelineSettings === "function") {
      tl.applyTimelineSettings({ totalSeconds: sec });
    } else if (tl?.timelineSettings) {
      tl.timelineSettings.totalSeconds = sec;
      Object.values(tl.timelines || {}).forEach((t) => {
        t?.updateSettings?.({ totalSeconds: sec });
        if (t?.options) t.options.totalSeconds = sec;
        if (t) t.totalSeconds = sec;
        if (t?.timelineData) {
          t.timelineData.maxTime = Math.max(t.timelineData.maxTime || 0, sec);
          t.timelineData.dirty = true;
        }
      });
      tl.recreateTimeRuler?.();
      tl.updateTimelineUI?.();
    } else {
      const mt = editor.motionTimeline || editor.timeline?.timelines?.motion;
      const lt = editor.lightTimeline || editor.timeline?.timelines?.light;
      [mt, lt].forEach((t) => {
        if (!t) return;
        if (t.options) t.options.totalSeconds = sec;
        if (t.totalSeconds != null) t.totalSeconds = sec;
        t.updateSettings?.({ totalSeconds: sec });
        if (t.timelineData) {
          t.timelineData.maxTime = Math.max(t.timelineData.maxTime || 0, sec);
          t.timelineData.dirty = true;
        }
      });
    }
    if (editor.scene) {
      editor.scene.userData = editor.scene.userData || {};
      editor.scene.userData.timeline = editor.scene.userData.timeline || {};
      editor.scene.userData.timeline.totalSeconds = sec;
      if (!editor.scene.userData.timeline.framesPerSecond) {
        editor.scene.userData.timeline.framesPerSecond = 30;
      }
    }
  } catch (e) {
    console.warn("[회광반조] 타임라인 길이 설정 실패:", e);
  }
}

function resolveMotionTimeline(editor) {
  editor?.connectTimelineInstances?.();
  return (
    editor?.motionTimeline ||
    editor?.timeline?.timelines?.motion ||
    window.timeline?.timelines?.motion ||
    null
  );
}

async function resolveLightTimeline(editor) {
  editor?.connectTimelineInstances?.();
  let lt =
    editor?.lightTimeline ||
    editor?.timeline?.timelines?.light ||
    window.timeline?.timelines?.light ||
    null;
  if (!lt && typeof window.timeline?.switchTimeline === "function") {
    try {
      window.timeline.switchTimeline("light");
      await delay(40);
      lt = editor?.lightTimeline || editor?.timeline?.timelines?.light;
    } catch (e) {
      /* ignore */
    }
  }
  return lt;
}

function resolveObjectScale(obj, fallback = CHAR_SCALE_FALLBACK) {
  const auto = Number(obj?.userData?.autoScale);
  if (Number.isFinite(auto) && auto > 0) return auto;
  const sx = Number(obj?.scale?.x);
  if (Number.isFinite(sx) && sx > 0) return sx;
  return fallback;
}

function scaleVec(obj) {
  const s = resolveObjectScale(obj);
  return [s, s, s];
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

function clearObjectMotionKeys(mt, obj) {
  if (!mt || !obj) return;
  ["position", "rotation", "scale", "visible"].forEach((prop) => {
    const td = mt.timelineData.getTrackByUuid(obj.uuid, prop);
    if (!td) return;
    if (typeof td.clearAllKeyframes === "function") td.clearAllKeyframes();
    else while (td.keyframeCount > 0) td.removeKeyframeByIndex(0);
  });
}

function poseAtFull(mt, obj, time, pos, rot = [0, 0, 0], scale = null, options = {}) {
  if (!mt || !obj) return;
  ensureMotionTrack(mt, obj, obj.name);
  obj.position.set(pos[0], pos[1] ?? 0, pos[2]);
  obj.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  const skipScaleKf = options.skipScaleKeyframe === true;
  if (scale != null) {
    if (Array.isArray(scale)) obj.scale.set(scale[0], scale[1], scale[2]);
    else obj.scale.setScalar(scale);
  }
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

/** @param {{t:number,p:number[],r?:number[]}[]} path */
function posePath(mt, obj, path, scale = null, options = {}) {
  path.forEach(({ t, p, r }) => {
    poseAtFull(mt, obj, t, p, r || [0, 0, 0], scale, options);
  });
}

function setVisibleKeys(mt, obj, keys) {
  if (!mt || !obj) return;
  ensureMotionTrack(mt, obj, obj.name);
  let vt = mt.timelineData.getTrackByUuid(obj.uuid, "visible");
  if (!vt) vt = mt.timelineData.addTrack(obj.uuid, "visible");
  if (!vt) return;
  if (typeof vt.clearAllKeyframes === "function") vt.clearAllKeyframes();
  keys.forEach(([t, v]) => vt.addKeyframe(t, !!v));
}

function addStageBox(editor, name, cfg) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: cfg.color,
      roughness: 0.9,
      metalness: 0.05,
    })
  );
  mesh.name = name;
  mesh.position.set(...cfg.position);
  mesh.scale.set(...cfg.scale);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.userData.hoegwangBanjo = true;
  editor.execute(new AddObjectCommand(editor, mesh));
  return mesh;
}

async function loadCharacterFbx(editor, path, fileName, displayName) {
  const { spawnCatalogEntryInScene } = await import("./utils/motionFbxCatalog.js");
  const obj = await spawnCatalogEntryInScene(
    editor,
    { path, filename: fileName, name: displayName, displayName },
    { forceNew: true, displayName }
  );
  if (obj) {
    obj.userData.hoegwangBanjo = true;
    obj.name = displayName;
  }
  return obj;
}

function fixtureWorldPos(engine, fid) {
  const grp = engine.getFixture?.(fid)?.obj?.grp;
  if (!grp) return null;
  engine.root?.updateMatrixWorld?.(true);
  const v = new THREE.Vector3();
  grp.getWorldPosition(v);
  return [v.x, v.y, v.z];
}

function aimOf(engine, fid, target) {
  const from = fixtureWorldPos(engine, fid);
  if (!from || !target) return { pan: 0, tilt: 35 };
  const a = aimPanTilt(from, [target[0], target[1] ?? Y, target[2]]);
  return { pan: Math.round(a.pan), tilt: Math.round(a.tilt) };
}

/** pan/tilt 각도 보간 드리프트 방지 — 월드 경로를 촘촘히 샘플 */
function densifyPath(points, stepsPerSeg = 5) {
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
  }
  return true;
}

function writeHouseCue(lt, bridge, houseId, time, cap) {
  const trackId = `house_${houseId}`;
  if (!lt.tracks.has(trackId)) bridge?.ensureTracks?.();
  if (!lt.tracks.has(trackId)) return false;
  bridge.writeHouseKeyframesAtTime?.(trackId, time, {
    dim: Math.round(Number(cap.dim) || 0),
    r: cap.r ?? 1,
    g: cap.g ?? 1,
    b: cap.b ?? 1,
    size: Math.round(Number(cap.size) ?? 50),
  });
  return true;
}

function clearFxHouse(lt) {
  lt.tracks?.forEach((track, id) => {
    if (!String(id).startsWith("fx_") && !String(id).startsWith("house_")) return;
    ["dim", "pan", "tilt", "color", "zoom", "focus", "size"].forEach((prop) => {
      const td =
        lt.timelineData?.getTrackByUuid?.(track.fixtureUuid || track.houseUuid || id, prop) ||
        lt._resolveTrackData?.(id, prop);
      td?.clearAllKeyframes?.();
    });
    track.sprite?.querySelectorAll?.(".keyframe")?.forEach?.((el) => el.remove());
  });
}

async function injectHoegwangLights(editor, lightOpts = {}) {
  const lt = await resolveLightTimeline(editor);
  if (!lt || typeof editor.initFixtureEngine !== "function") return;

  const engine = editor.initFixtureEngine({ build: true });
  await delay(60);
  const bridge = lt.fixtureBridge;
  const houseBridge = lt.houseBridge;
  if (!bridge?.ensureTracks) return;
  bridge.ensureTracks();
  houseBridge?.ensureTracks?.();
  clearFxHouse(lt);
  engine.root?.updateMatrixWorld?.(true);
  engine.reaimHomes?.();

  const allFids = engine.getFixtures().map((f) => f.fid);
  const homeOf = (fid) => {
    const f = engine.getFixture(fid);
    return {
      pan: Math.round(Number(f?.attr?.pan ?? f?.home?.pan) || 0),
      tilt: Math.round(Number(f?.attr?.tilt ?? f?.home?.tilt) || 35),
    };
  };
  const offAllFx = (t) => {
    allFids.forEach((fid) => {
      writeFxCue(lt, bridge, fid, t, { dim: 0, ...homeOf(fid), ...WHITE });
    });
  };
  const offHouse = (t) => {
    ["fill", "fohL", "fohC", "fohR"].forEach((id) => {
      writeHouseCue(lt, houseBridge, id, t, { dim: 0, size: 40, ...WHITE });
    });
  };

  try {
    applyHouseLightLevels(editor, { fill: 0, fohL: 0, fohC: 0, fohR: 0 });
  } catch (e) {
    /* ignore */
  }

  offAllFx(0);
  offHouse(0);

  // 씬1 황금 워시
  writeHouseCue(lt, houseBridge, "fill", CUE.s1In, { dim: 0, size: 55, ...GOLD });
  writeHouseCue(lt, houseBridge, "fill", CUE.s1In + 3, { dim: 45, size: 55, ...GOLD });
  writeHouseCue(lt, houseBridge, "fill", CUE.s1Hold, { dim: 42, size: 55, ...GOLD });

  // ── 씬2: 효명 중앙 + 김조순 스포트 + 이야기꾼(관망) 약스포트 ──
  writeHouseCue(lt, houseBridge, "fill", CUE.s2In, { dim: 14, size: 42, ...GOLD });
  writeHouseCue(lt, houseBridge, "fill", CUE.s2Hold, { dim: 10, size: 40, ...GOLD });
  writeHouseCue(lt, houseBridge, "fill", CUE.s3In, { dim: 6, size: 38, ...GOLD });
  writeHouseCue(lt, houseBridge, "fill", CUE.s3Hold, { dim: 5, size: 38, ...GOLD });

  FX.hyo.forEach((fid) => {
    const a = aimOf(engine, fid, POS.hyoS2);
    writeFxCue(lt, bridge, fid, CUE.s2In, { dim: 55, ...a, zoom: 34, ...WARM_WHITE });
    writeFxCue(lt, bridge, fid, CUE.s2Hold, { dim: 50, ...a, zoom: 34, ...WARM_WHITE });
    writeFxCue(lt, bridge, fid, CUE.s3In, { dim: 15, ...a, zoom: 34, ...WARM_WHITE });
  });

  // 김조순 — 입장 동선 따라 aim
  FX.kim.forEach((fid) => {
    const aEnter = aimOf(engine, fid, POS.kimEnter);
    const aHold = aimOf(engine, fid, POS.kimHold);
    writeFxCue(lt, bridge, fid, CUE.s2In, { dim: 0, ...aEnter, zoom: 28, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s2Arrive, { dim: 75, ...aHold, zoom: 28, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s2Hold, { dim: 70, ...aHold, zoom: 28, ...WHITE });
    // 씬3에서도 권신은 약하게 유지 (이야기꾼이 주인공)
    writeFxCue(lt, bridge, fid, CUE.s3In, { dim: 35, ...aHold, zoom: 30, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s3Hold, { dim: 30, ...aHold, zoom: 30, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s4In, { dim: 0, ...aHold, zoom: 30, ...WHITE });
  });

  // 이야기꾼 — 씬2~3만
  FX.story.forEach((fid) => {
    const aWatch = aimOf(engine, fid, POS.storyWatch);
    const aKim = aimOf(engine, fid, POS.storyAtKim);
    const aMid = aimOf(engine, fid, POS.storyMid);
    const aJo = aimOf(engine, fid, POS.storyAtJo);
    writeFxCue(lt, bridge, fid, CUE.s2In, { dim: 0, ...aWatch, zoom: 28, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s2Arrive, { dim: 45, ...aWatch, zoom: 28, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s2Hold, { dim: 50, ...aWatch, zoom: 28, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s3In, { dim: 80, ...aWatch, zoom: 26, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s3Kim, { dim: 92, ...aKim, zoom: 24, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s3ToJo - 1, { dim: 88, ...aKim, zoom: 24, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s3ToJo + 4, { dim: 90, ...aMid, zoom: 24, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s3Jo, { dim: 92, ...aJo, zoom: 24, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s3Hold, { dim: 85, ...aJo, zoom: 24, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s4In, { dim: 0, ...aJo, zoom: 26, ...WHITE });
  });

  // 조만영 — 대본상 김조순 변사 뒤 등장. 입장부터 aim 추적
  FX.jo.forEach((fid) => {
    const aEnter = aimOf(engine, fid, POS.joEnter);
    const aHold = aimOf(engine, fid, POS.joHold);
    writeFxCue(lt, bridge, fid, CUE.s3ToJo - 8, { dim: 0, ...aEnter, zoom: 28, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s3ToJo, { dim: 70, ...aHold, zoom: 28, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s3Jo, { dim: 40, ...aHold, zoom: 30, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s3Hold, { dim: 35, ...aHold, zoom: 30, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s4In, { dim: 0, ...aHold, zoom: 30, ...WHITE });
  });

  // ── 씬4: #11 천록 / #16 꾀꼬리 / #15 도창 추적 ──
  writeHouseCue(lt, houseBridge, "fill", CUE.s4In, { dim: 30, size: 52, ...WARM_WHITE });
  writeHouseCue(lt, houseBridge, "fill", CUE.s4Hold, { dim: 34, size: 52, ...GOLD });

  // 좌 MH#11 — 천록 (도창 등장 순간 즉시 소등)
  FX.followL.forEach((fid) => {
    const a0 = aimOf(engine, fid, [SPOT_CHEON.dance[0], SPOT_AIM_Y, SPOT_CHEON.dance[2]]);
    const a1 = aimOf(engine, fid, [SPOT_CHEON.hold[0], SPOT_AIM_Y, SPOT_CHEON.hold[2]]);
    writeFxCue(lt, bridge, fid, CUE.s4Dance, { dim: 78, ...a0, zoom: 30, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s4Dochang - 0.05, { dim: 70, ...a1, zoom: 30, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s4Dochang, { dim: 0, ...a1, zoom: 30, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s5In, { dim: 0, ...a1, zoom: 30, ...WHITE });
  });

  // 우 MH#16 — 꾀꼬리 (도창 등장 순간 즉시 소등)
  FX.followR.forEach((fid) => {
    const a0 = aimOf(engine, fid, [SPOT_BIRD.dance[0], SPOT_BIRD.dance[1], SPOT_BIRD.dance[2]]);
    const a1 = aimOf(engine, fid, [SPOT_BIRD.mid[0], SPOT_BIRD.mid[1], SPOT_BIRD.mid[2]]);
    writeFxCue(lt, bridge, fid, CUE.s4Dance, { dim: 78, ...a0, zoom: 30, ...GOLD });
    writeFxCue(lt, bridge, fid, CUE.s4Dochang - 0.05, { dim: 70, ...a1, zoom: 30, ...GOLD });
    writeFxCue(lt, bridge, fid, CUE.s4Dochang, { dim: 0, ...a1, zoom: 30, ...GOLD });
    writeFxCue(lt, bridge, fid, CUE.s5In, { dim: 0, ...a1, zoom: 30, ...GOLD });
  });

  // MH#15 — 도창 등장 순간에만 ON (이전 구간 dim 보간으로 미리 켜지지 않게)
  FX.dojang.forEach((fid) => {
    const aEnter = aimOf(engine, fid, POS.dojangEnter);
    const path = densifyPath(
      [
        { t: CUE.s4Dochang, p: POS.dojangEnter },
        { t: CUE.s4Hold, p: POS.dojangSing },
        { t: CUE.s5Clear, p: POS.dojangSing },
      ],
      6
    );
    writeFxCue(lt, bridge, fid, CUE.s4In, { dim: 0, ...aEnter, zoom: 24, ...WHITE });
    // 등장 직전까지 0 유지 → 등장 프레임에만 점등
    writeFxCue(lt, bridge, fid, CUE.s4Dochang - 0.05, { dim: 0, ...aEnter, zoom: 24, ...WHITE });
    path.forEach(({ t, p }) => {
      if (t >= CUE.s5Clear) return;
      writeFxCue(lt, bridge, fid, t, {
        dim: 95,
        ...aimOf(engine, fid, p),
        zoom: 24,
        ...WHITE,
      });
    });
  });

  // 씬5 효명 보계 메인
  offAllFx(CUE.s5In);
  // offAllFx가 #15도 끄므로, 도창이 퇴장하는 s5Clear까지 다시 ON 후 즉시 OFF
  FX.dojang.forEach((fid) => {
    const a = aimOf(engine, fid, POS.dojangSing);
    writeFxCue(lt, bridge, fid, CUE.s5In, { dim: 95, ...a, zoom: 24, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s5Clear, { dim: 0, ...a, zoom: 24, ...WHITE });
  });
  writeHouseCue(lt, houseBridge, "fill", CUE.s5In, { dim: 5, size: 38, ...WHITE });
  FX.hyo.forEach((fid) => {
    const a0 = aimOf(engine, fid, [0, 3, 28]);
    const a1 = aimOf(engine, fid, [-12, 3, 32]);
    const a2 = aimOf(engine, fid, [12, 3, 24]);
    writeFxCue(lt, bridge, fid, CUE.s5In, { dim: 0, ...a0, zoom: 24, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s5OnBogye, { dim: 92, ...a0, zoom: 24, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s5DanceA, { dim: 95, ...a1, zoom: 22, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s5DanceB, { dim: 95, ...a2, zoom: 22, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s5Climax, { dim: 98, ...a0, zoom: 20, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s6Stop, { dim: 70, ...a0, zoom: 20, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s6Black, { dim: 0, ...a0, zoom: 20, ...WHITE });
  });

  // 씬6 암전 → 탑
  writeHouseCue(lt, houseBridge, "fill", CUE.s6Black, { dim: 0, size: 40, ...WHITE });
  FX.top.forEach((fid) => {
    const a = aimOf(engine, fid, [0, 3, 28]);
    writeFxCue(lt, bridge, fid, CUE.s6Black, { dim: 0, ...a, zoom: 20, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s6Top, { dim: 95, ...a, zoom: 18, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.s6End, { dim: 72, ...a, zoom: 18, ...WHITE });
    writeFxCue(lt, bridge, fid, CUE.end, { dim: 0, ...a, zoom: 18, ...WHITE });
  });

  const maxT =
    lightOpts.totalDuration != null ? Number(lightOpts.totalDuration) : DURATION;
  if (lt.timelineData) {
    lt.timelineData.maxTime = Math.max(lt.timelineData.maxTime || 0, maxT);
    lt.timelineData.dirty = true;
    lt.timelineData.precomputeAnimationData?.(
      undefined,
      lt.options?.totalSeconds ?? maxT,
      lt.options?.framesPerSecond ?? 30
    );
  }
  lt.currentTime = 0;
  bridge.restoreKeyframeUI?.();
  houseBridge?.restoreKeyframeUI?.();
  bridge.applyAtTime?.(0);
  houseBridge?.applyAtTime?.(0);
}

/** 무동 좌·우 윙에서 입장 (5막 악단 X±266) → X축 일렬 대기 */
async function deployMudongRehearsal(editor) {
  const sc = editor.showControl;
  const mt = resolveMotionTimeline(editor);
  if (!sc) return null;
  const catalog = await sc.ensureFbxCatalog();
  const walk = catalog?.find((c) => c.procedural === "walk-lite") || catalog?.[0];
  if (!walk) return null;

  const wings = [
    {
      name: "회광반조_무동_좌",
      hold: MUDONG_L,
      hold2: MUDONG_L2,
      enterX: -MUDONG_ENTER_X,
      exitX: -MUDONG_EXIT_X,
      anchorX: -55,
    },
    {
      name: "회광반조_무동_우",
      hold: MUDONG_R,
      hold2: MUDONG_R2,
      enterX: MUDONG_ENTER_X,
      exitX: MUDONG_EXIT_X,
      anchorX: 55,
    },
  ];

  for (const wing of wings) {
    const count = wing.hold.length;
    const group = sc.createGroup(wing.name);
    const gid = group.id;
    const live = () => sc.getGroup(gid) || group;
    const g0 = live();
    g0.color = "#ffffff";
    g0.startTime = CUE.s1In;
    g0.fromX = wing.enterX;
    g0.fromZ = MUDONG_Z;
    g0.toX = wing.anchorX;
    g0.toZ = MUDONG_Z;
    g0.formation = "line";
    g0.formationSpacing = 17;
    g0.segments = [
      normalizeSegment(
        {
          kind: SEGMENT_KIND.move,
          duration: MUDONG_ENTER_DUR,
          formation: "line",
          formationSpacing: 17,
          anchorX: wing.anchorX,
          anchorZ: MUDONG_Z,
          toRotY: 0,
        },
        g0
      ),
      normalizeSegment(
        {
          kind: SEGMENT_KIND.hold,
          duration: Math.max(1, CUE.s5Clear - MUDONG_ENTER_DUR),
          formation: "line",
          formationSpacing: 17,
          anchorX: wing.anchorX,
          anchorZ: MUDONG_Z,
          toRotY: 0,
        },
        g0
      ),
      normalizeSegment(
        {
          kind: SEGMENT_KIND.exit,
          duration: 6,
          formation: "line",
          formationSpacing: 17,
          anchorX: wing.exitX,
          anchorZ: MUDONG_Z,
          toRotY: 0,
        },
        g0
      ),
    ];
    syncLegacyFieldsFromSegments(g0);
    sc.persistToSceneUserData?.();
    for (let i = 0; i < count; i++) sc.addCatalogSlotToGroup(gid, walk, 0);
    {
      const g = live();
      (g.members || []).forEach((m) => {
        m.tintColor = COLOR.mudong;
      });
      sc.persistToSceneUserData?.();
    }
    await sc.deployGroup(gid);

    const g = live();
    (g.members || []).forEach((m, i) => {
      const obj = editor.scene.getObjectByProperty("uuid", m.deployedUuid);
      if (!obj) return;
      applyGroupMotionColor(obj, COLOR.mudong);
      obj.userData.hoegwangBanjo = true;
      obj.name = wing.enterX < 0 ? `무동L${i + 1}` : `무동R${i + 1}`;
      if (!mt) return;
      const p0 = wing.hold[i];
      const p1 = wing.hold2[i];
      const ez = MUDONG_ENTER_Z[i] ?? MUDONG_Z;
      const enter = [wing.enterX, 0, ez];
      const exit = [wing.exitX, 0, ez];
      const arriveT = CUE.s1In + MUDONG_ENTER_DUR;
      const noScale = { skipScaleKeyframe: true };
      obj.position.set(enter[0], enter[1], enter[2]);
      clearObjectMotionKeys(mt, obj);
      posePath(
        mt,
        obj,
        [
          { t: CUE.s1In, p: enter },
          { t: arriveT, p: p0 },
          { t: CUE.s1Inspect, p: p0 },
          { t: Math.max(CUE.s1Hold, arriveT), p: p1 },
          { t: CUE.s2Hold, p: p1 },
          { t: CUE.s4Hold, p: p1 },
          { t: CUE.s5Clear, p: p1 },
          { t: CUE.s5Clear + 6, p: exit },
        ],
        null,
        noScale
      );
      setVisibleKeys(mt, obj, [
        [0, false],
        [CUE.s1In, true],
        [CUE.s5Clear + 6, false],
      ]);
      clearObjectMotionKeyframes(mt, obj.uuid, { only: ["scale"] });
      persistMemberBaseAppearance(editor, obj);
    });
    sc.persistToSceneUserData?.();
  }
  return true;
}

async function applyHoegwangBanjo(editor, options = {}) {
  const hide = options.skipLoading
    ? () => {}
    : showLoading(options.loadingMessage || "4막 회광반조 로딩 중...");
  const totalDur =
    options.totalDuration != null ? Number(options.totalDuration) : DURATION;
  try {
    ensureTimelineDuration(editor, totalDur);

    try {
      const cam = editor.viewportCamera || editor.camera;
      if (cam) {
        cam.position.set(0, 78, 300);
        cam.rotation.set(-0.14, 0, 0);
        if (cam.fov !== undefined) {
          cam.fov = 42;
          cam.updateProjectionMatrix();
        }
        cam.updateMatrixWorld();
        editor.signals?.cameraChanged?.dispatch();
      }
    } catch (e) {
      /* ignore */
    }

    const removeList = [];
    editor.scene.traverse((obj) => {
      const ud = obj.userData || {};
      if (
        ud.hoegwangBanjo ||
        ud.dreamNation ||
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
        const kill = ["회광반조", "무동", "권신", "꿈꾸는나라", "악단", "정조와천록", "천록꾀꼬리"];
        sc.ensureGroups()
          .filter((g) => kill.some((n) => String(g.name || "").includes(n)))
          .forEach((g) => sc.deleteGroup(g.id));
      }
    } catch (e) {
      /* ignore */
    }

    // 무대 구조: 앞뜰 + 보계 + 휘장
    addStageBox(editor, "연경당_앞뜰", COURT);
    addStageBox(editor, "보계", BOGYE);
    addStageBox(editor, "휘장", CURTAIN);
    const hwamun = addStageBox(editor, "화문석_프레임", HWAMUN);
    hwamun.visible = false;

    const mt = resolveMotionTimeline(editor);
    if (mt && hwamun) {
      // 보계 위 깔개 — 낙하 애니 없음(효명 관통 방지). 씬5부터 제자리 표시
      ensureMotionTrack(mt, hwamun, hwamun.name);
      clearObjectMotionKeys(mt, hwamun);
      poseAtFull(mt, hwamun, 0, HWAMUN.position, [0, 0, 0], HWAMUN.scale);
      poseAtFull(mt, hwamun, CUE.end, HWAMUN.position, [0, 0, 0], HWAMUN.scale);
      setVisibleKeys(mt, hwamun, [
        [0, false],
        [CUE.s5OnBogye, true],
      ]);
    }

    // ── 효명: 점검 → 중앙 → 보계 춘앵무 경로 ──
    const hyo = await loadCharacterFbx(editor, DREAM_CHAR1_PATH, "Character1.fbx", "효명");
    if (hyo) {
      applyGroupMotionColor(hyo, COLOR.hyomyeong);
      hyo.userData.hoegwangBanjo = true;
      if (mt) {
        const scv = scaleVec(hyo);
        clearObjectMotionKeys(mt, hyo);
        // 씬1: 중앙 복도에서 점검 (무동 좌우 윙과 겹치지 않게 |x|<40)
        posePath(mt, hyo, [
          { t: CUE.s1In, p: [0, Y, 58] },
          { t: CUE.s1Inspect, p: [0, Y, 48] },
          { t: CUE.s1Hold, p: [0, Y, 55] },
          // 씬2 중앙
          { t: CUE.s2Arrive, p: [0, Y, 55] },
          { t: CUE.s2Hold, p: [0, Y, 55] },
          // 씬3 한 발 물러 이야기꾼 변사 관망
          { t: CUE.s3In, p: [0, Y, 48] },
          { t: CUE.s3Hold, p: [0, Y, 46] },
          // 씬4 보계 쪽으로
          { t: CUE.s4In, p: [0, Y, 42] },
          { t: CUE.s4Hold, p: [0, Y, 38] },
          // 씬5 보계 위 등장 → 광란 경로(좌우·전후 크게)
          { t: CUE.s5In, p: [0, Y + 1.2, 28] },
          { t: CUE.s5OnBogye, p: [0, Y + 1.2, 28] },
          { t: CUE.s5DanceA, p: [-14, Y + 1.2, 34], r: [0, 0.8, 0] },
          { t: CUE.s5DanceB, p: [14, Y + 1.2, 22], r: [0, -0.9, 0] },
          { t: CUE.s5Climax, p: [0, Y + 1.2, 28], r: [0, 1.6, 0] },
          // 씬6 정지
          { t: CUE.s6Stop, p: [0, Y + 1.2, 28], r: [0, 1.6, 0] },
          { t: CUE.s6End, p: [0, Y + 1.2, 28], r: [0, 1.6, 0] },
        ], scv);
        setVisibleKeys(mt, hyo, [[0, true]]);
      }
    }

    // ── 무동 6 좌우 리허설 ──
    await deployMudongRehearsal(editor);

    // ── 권신 2명: 김조순(영안부원군) · 조만영(풍은부원군) — 대본 그대로 ──
    const kim = await loadCharacterFbx(editor, DREAM_CHAR2_PATH, "Character2.fbx", "김조순");
    if (kim) {
      applyGroupMotionColor(kim, COLOR.kim);
      kim.userData.hoegwangBanjo = true;
      if (mt) {
        const scv = scaleVec(kim);
        clearObjectMotionKeys(mt, kim);
        posePath(mt, kim, [
          { t: CUE.s2In, p: [POS.kimEnter[0], Y, POS.kimEnter[2]] },
          { t: CUE.s2Arrive, p: [POS.kimHold[0], Y, POS.kimHold[2]] },
          { t: CUE.s3Hold, p: [POS.kimHold[0], Y, POS.kimHold[2]] },
          { t: CUE.s4Hold, p: [POS.kimHold[0], Y, POS.kimHold[2]] },
          { t: CUE.s5Clear, p: [POS.kimHold[0], Y, POS.kimHold[2]] },
          { t: CUE.s5Clear + 6, p: [-200, Y, 120] },
        ], scv);
        setVisibleKeys(mt, kim, [
          [0, false],
          [CUE.s2In, true],
          [CUE.s5Clear + 6, false],
        ]);
      }
    }

    const jo = await loadCharacterFbx(editor, DREAM_CHAR2_PATH, "Character2.fbx", "조만영");
    if (jo) {
      applyGroupMotionColor(jo, COLOR.jo);
      jo.userData.hoegwangBanjo = true;
      if (mt) {
        const scv = scaleVec(jo);
        clearObjectMotionKeys(mt, jo);
        // 대본: 김조순 변사 뒤 조만영 등장
        posePath(mt, jo, [
          { t: CUE.s3ToJo - 8, p: [POS.joEnter[0], Y, POS.joEnter[2]] },
          { t: CUE.s3ToJo, p: [POS.joHold[0], Y, POS.joHold[2]] },
          { t: CUE.s3Hold, p: [POS.joHold[0], Y, POS.joHold[2]] },
          { t: CUE.s4Hold, p: [POS.joHold[0], Y, POS.joHold[2]] },
          { t: CUE.s5Clear, p: [POS.joHold[0], Y, POS.joHold[2]] },
          { t: CUE.s5Clear + 6, p: [200, Y, 120] },
        ], scv);
        setVisibleKeys(mt, jo, [
          [0, false],
          [CUE.s3ToJo - 8, true],
          [CUE.s5Clear + 6, false],
        ]);
      }
    }

    // ── 이야기꾼: 관망 → 김/조 변사 → 씬4 도창과 나란히 축원 노래 ──
    const story = await loadCharacterFbx(
      editor,
      DREAM_CHAR1_PATH,
      "Character1.fbx",
      "이야기꾼"
    );
    if (story) {
      applyGroupMotionColor(story, COLOR.storyteller);
      story.userData.hoegwangBanjo = true;
      if (mt) {
        const scv = scaleVec(story);
        clearObjectMotionKeys(mt, story);
        posePath(mt, story, [
          { t: CUE.s1In, p: [75, Y, 115] },
          { t: CUE.s1Hold, p: [70, Y, 108] },
          { t: CUE.s2Hold, p: [POS.storyWatch[0], Y, POS.storyWatch[2]] },
          { t: CUE.s3In, p: [POS.storyWatch[0], Y, POS.storyWatch[2]] },
          { t: CUE.s3Kim, p: [POS.storyAtKim[0], Y, POS.storyAtKim[2]] },
          { t: CUE.s3ToJo - 1, p: [POS.storyAtKim[0], Y, POS.storyAtKim[2]] },
          { t: CUE.s3ToJo + 4, p: [POS.storyMid[0], Y, POS.storyMid[2]] },
          { t: CUE.s3Jo, p: [POS.storyAtJo[0], Y, POS.storyAtJo[2]] },
          { t: CUE.s3Hold, p: [POS.storyAtJo[0], Y, POS.storyAtJo[2]] },
          // 도창 등장에 맞춰 중앙 앞으로 — 축원 노래 듀오
          { t: CUE.s4Dochang, p: [POS.storySing[0], Y, POS.storySing[2]] },
          { t: CUE.s4Hold, p: [POS.storySing[0], Y, POS.storySing[2]] },
          { t: CUE.s5Clear, p: [POS.storySing[0], Y, POS.storySing[2]] },
          { t: CUE.s5Clear + 5, p: [180, Y, 140] },
        ], scv);
        setVisibleKeys(mt, story, [
          [0, false],
          [CUE.s1In, true],
          [CUE.s5Clear + 5, false],
        ]);
      }
    }

    // ── 천록 · 꾀꼬리: 그룹 없이 개별 스폰 + 각자 모션 트랙 (스포트 좌표 추적) ──
    {
      const { spawnCatalogEntryInScene } = await import("./utils/motionFbxCatalog.js");
      const noScale = { skipScaleKeyframe: true };

      const cheon = await spawnCatalogEntryInScene(
        editor,
        {
          path: "procedural://cheonrok-lite",
          filename: "CheonrokLite.fbx",
          name: "천록",
          displayName: "천록 · 회광반조",
          procedural: "cheonrok-lite",
        },
        { forceNew: true, displayName: "천록 · 회광반조", color: COLOR.cheonrok }
      );
      if (cheon) {
        cheon.userData.hoegwangBanjo = true;
        cheon.name = "천록 · 회광반조";
        applyGroupMotionColor(cheon, COLOR.cheonrok);
        cheon.scale.set(...CHEONROK_SCALE);
        if (mt) {
          clearObjectMotionKeys(mt, cheon);
          posePath(
            mt,
            cheon,
            [
              { t: CUE.s4Dance, p: SPOT_CHEON.dance },
              { t: CUE.s4Dochang, p: SPOT_CHEON.hold },
              { t: CUE.s4Hold, p: SPOT_CHEON.hold },
              { t: CUE.s5Clear, p: SPOT_CHEON.hold },
              { t: CUE.s5Clear + 6, p: [-220, 0, SPOT_CHEON.hold[2]] },
            ],
            null,
            noScale
          );
          setVisibleKeys(mt, cheon, [
            [0, false],
            [CUE.s4Dance, true],
            [CUE.s5Clear + 6, false],
          ]);
          clearObjectMotionKeyframes(mt, cheon.uuid, { only: ["scale"] });
          persistMemberBaseAppearance(editor, cheon);
        }
      }

      const bird = await spawnCatalogEntryInScene(
        editor,
        {
          path: "procedural://kkekkori-lite",
          filename: "KkekkoriLite.fbx",
          name: "꾀꼬리",
          displayName: "꾀꼬리 · 회광반조",
          procedural: "kkekkori-lite",
        },
        { forceNew: true, displayName: "꾀꼬리 · 회광반조", color: COLOR.kkekkori }
      );
      if (bird) {
        bird.userData.hoegwangBanjo = true;
        bird.name = "꾀꼬리 · 회광반조";
        applyGroupMotionColor(bird, COLOR.kkekkori);
        if (mt) {
          clearObjectMotionKeys(mt, bird);
          posePath(
            mt,
            bird,
            [
              { t: CUE.s4Dance, p: SPOT_BIRD.dance },
              { t: CUE.s4Dochang, p: SPOT_BIRD.mid },
              { t: CUE.s4Hold, p: SPOT_BIRD.hold },
              { t: CUE.s5Clear, p: SPOT_BIRD.hold },
              { t: CUE.s5Clear + 6, p: [230, SPOT_BIRD.hold[1], 40] },
            ],
            null,
            noScale
          );
          setVisibleKeys(mt, bird, [
            [0, false],
            [CUE.s4Dance, true],
            [CUE.s5Clear + 6, false],
          ]);
          clearObjectMotionKeyframes(mt, bird.uuid, { only: ["scale"] });
          persistMemberBaseAppearance(editor, bird);
        }
      }
    }

    // ── 도창: 우측 입장 → 무대 중앙(앞) 홀드 — 효명(보계 z≈38)과 분리 ──
    const doj = await loadCharacterFbx(editor, DREAM_CHAR2_PATH, "Character2.fbx", "도창");
    if (doj) {
      applyGroupMotionColor(doj, COLOR.dojang);
      doj.userData.hoegwangBanjo = true;
      if (mt) {
        const scv = scaleVec(doj);
        clearObjectMotionKeys(mt, doj);
        // 우측 윙 → 중앙 앞(z≈90, 무동 z=70보다 앞). 보계/효명과 겹치지 않음
        posePath(mt, doj, [
          { t: CUE.s4Dochang, p: [POS.dojangEnter[0], Y, POS.dojangEnter[2]] },
          { t: CUE.s4Hold, p: [POS.dojangSing[0], Y, POS.dojangSing[2]] },
          { t: CUE.s5Clear, p: [POS.dojangSing[0], Y, POS.dojangSing[2]] },
          { t: CUE.s5Clear + 5, p: [200, Y, 80] },
        ], scv);
        setVisibleKeys(mt, doj, [
          [0, false],
          [CUE.s4Dochang, true],
          [CUE.s5Clear + 5, false],
        ]);
      }
    }

    await injectHoegwangLights(editor, { totalDuration: totalDur });

    if (!options.skipAudio) {
      try {
        if (editor.audioTimeline?.addAudioFromAsset) {
          await editor.audioTimeline.addAudioFromAsset(HOEGWANG_AUDIO);
          // 4막 단독: 타임라인은 연출 길이(≈170초). 오디오 클립도 그에 맞춤
          fitHoegwangAudioClip(editor, totalDur);
        }
      } catch (e) {
        console.warn("[회광반조] 오디오 실패:", e);
      }
    }

    ensureTimelineDuration(editor, totalDur);

    if (mt) {
      mt.timelineData.dirty = true;
      mt.timelineData.precomputeAnimationData?.(
        mt.getClipInfoCallback?.(),
        totalDur,
        mt.fps || 30
      );
      mt.updateUI?.();
      mt.updateAnimation?.(0);
    }

    if (typeof editor.deselect === "function") editor.deselect();
    console.log("[회광반조] 4막 적용 완료", totalDur, "초 — 대본 동선 기준");
  } catch (e) {
    console.error("[회광반조] 실패:", e);
    alert(`회광반조 적용 오류: ${e.message || e}`);
  } finally {
    hide();
  }
}

function appendHoegwangButton(parentPanel, editor) {
  const wrap = document.createElement("div");
  wrap.className = "nanseol-button-wrap";
  wrap.style.paddingTop = "0";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nanseol-apply-button sb-dock-btn sb-dock-btn--wide sb-dock-btn--accent";
  btn.textContent = "회광반조";
  btn.title =
    "4막만 (~2분50초). 노래 클립도 연출 길이에 맞춤. 6분 전체는「4·5막 통합」";

  btn.addEventListener("click", () => applyHoegwangBanjo(editor));
  wrap.appendChild(btn);

  const host = parentPanel?.dom || parentPanel;
  if (host) host.appendChild(wrap);
  return wrap;
}

/** 회광반조.wav ≈ 355.4초 — 4막(170) + 5막(175) = 345초 연출, 타임라인은 오디오에 맞춤 */
const COMBINED_AUDIO_SEC = 356;
const ACT5_OFFSET = CUE.end; // 170 — 4막 끝(암전) 직후 5막

function fitHoegwangAudioClip(editor, clipSeconds) {
  try {
    const at = editor.audioTimeline;
    if (!at?.tracks) return;
    const total =
      Number(window.timeline?.timelineSettings?.totalSeconds) ||
      Number(clipSeconds) ||
      COMBINED_AUDIO_SEC;
    const maxDur = Math.min(Number(clipSeconds) || total, total);
    at.tracks.forEach((track) => {
      const el = track.element || track.sprite;
      const sprite = el?.querySelector?.(".audio-sprite") || (el?.classList?.contains("audio-sprite") ? el : null);
      if (!sprite) return;
      const name = String(track.name || sprite.dataset.name || "");
      if (name && !/hoegwang|회광/i.test(name) && track.name !== HOEGWANG_AUDIO.name) return;
      sprite.dataset.duration = String(maxDur);
      sprite.style.left = "0%";
      sprite.style.width = `${Math.min(100, (maxDur / total) * 100)}%`;
      const obj = editor.scene?.getObjectById?.(parseInt(track.objectId || track.id, 10));
      if (obj?.userData) {
        obj.userData.duration = maxDur;
        obj.userData.audioStartTime = 0;
        obj.userData.audioEndTime = maxDur;
      }
    });
    at.updateSettings?.({ totalSeconds: total });
  } catch (e) {
    console.warn("[회광반조] 오디오 클립 길이 맞춤 실패:", e);
  }
}

async function applyHoegwangDreamCombined(editor) {
  const totalDur = Math.max(COMBINED_AUDIO_SEC, ACT5_OFFSET + DREAM_DURATION);
  const hide = showLoading("4·5막 통합 로딩 중...");
  try {
    // 룰러/재생 길이를 먼저 6분대로 고정 (기존 상한 5분·미동기화 버그 방지)
    ensureTimelineDuration(editor, totalDur);

    await applyHoegwangBanjo(editor, {
      skipAudio: true,
      skipLoading: true,
      totalDuration: totalDur,
    });
    await applyDreamNation(editor, {
      skipAudio: true,
      skipLoading: true,
      timeOffset: ACT5_OFFSET,
      totalDuration: totalDur,
      preserveLights: true,
    });
    try {
      if (editor.audioTimeline?.addAudioFromAsset) {
        await editor.audioTimeline.addAudioFromAsset(HOEGWANG_AUDIO);
      }
    } catch (e) {
      console.warn("[4·5막] 오디오 실패:", e);
    }
    ensureTimelineDuration(editor, totalDur);
    fitHoegwangAudioClip(editor, totalDur);
    console.log(
      `[4·5막] 통합 완료 — 4막 0~${ACT5_OFFSET}s / 5막 ${ACT5_OFFSET}~${
        ACT5_OFFSET + DREAM_DURATION
      }s / 타임라인·오디오 ${totalDur}s`
    );
  } catch (e) {
    console.error("[4·5막] 실패:", e);
    alert(`4·5막 통합 적용 오류: ${e.message || e}`);
  } finally {
    hide();
  }
}

function appendCombinedActsButton(parentPanel, editor) {
  const wrap = document.createElement("div");
  wrap.className = "nanseol-button-wrap";
  wrap.style.paddingTop = "0";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nanseol-apply-button sb-dock-btn sb-dock-btn--wide sb-dock-btn--accent";
  btn.textContent = "4·5막 통합";
  btn.title =
    "회광반조(4막≈2:50) + 꿈꾸는 나라(5막≈2:55) 연속. 타임라인·오디오 ≈5:56. 4막 암전 후 5막 시작";

  btn.addEventListener("click", () => applyHoegwangDreamCombined(editor));
  wrap.appendChild(btn);

  const host = parentPanel?.dom || parentPanel;
  if (host) host.appendChild(wrap);
  return wrap;
}

export {
  appendHoegwangButton,
  appendCombinedActsButton,
  applyHoegwangBanjo,
  applyHoegwangDreamCombined,
  CUE as HOEGWANG_CUE,
};
