import * as THREE from "three";
import { INTERPOLATION } from "../timeline/TimelineCore.js";
import { ROW_DEFS, RIG_MATRIX } from "./fixtureTypes.js";

function easeInterpolationT(t, interpolation) {
  if (interpolation === INTERPOLATION.SMOOTHSTEP) {
    return t * t * (3 - 2 * t);
  }
  if (interpolation === INTERPOLATION.STEP) {
    return 0;
  }
  return t;
}

/** pan/tilt — 최단 각도 경로 + smooth/linear 보간 */
function sampleAngleTrack(trackData, time) {
  if (!trackData || trackData.keyframeCount === 0) return null;
  if (trackData.keyframeCount === 1) return trackData.values[0];

  if (time <= trackData.times[0]) return trackData.values[0];
  const last = trackData.keyframeCount - 1;
  if (time >= trackData.times[last]) return trackData.values[last * 3];

  let nextIndex = 0;
  while (nextIndex < trackData.keyframeCount && trackData.times[nextIndex] < time) {
    nextIndex++;
  }
  const prevIndex = nextIndex - 1;
  const prevTime = trackData.times[prevIndex];
  const nextTime = trackData.times[nextIndex];
  const rawT = (time - prevTime) / (nextTime - prevTime);
  const t = easeInterpolationT(rawT, trackData.interpolations[prevIndex]);

  const prev = trackData.values[prevIndex * 3];
  const next = trackData.values[nextIndex * 3];
  const delta = ((next - prev + 540) % 360) - 180;
  return prev + delta * t;
}

export const FIXTURE_TRACK_PREFIX = "fx_";
export const FIXTURE_TL_PROPS = ["dim", "pan", "tilt", "color"];

export function fixtureTrackId(fid) {
  return `${FIXTURE_TRACK_PREFIX}${fid}`;
}

export function parseFixtureFid(trackId) {
  if (!trackId || !String(trackId).startsWith(FIXTURE_TRACK_PREFIX)) return null;
  const n = Number(String(trackId).slice(FIXTURE_TRACK_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

export function isFixtureTrackId(trackId) {
  return parseFixtureFid(trackId) != null;
}

function fixtureUuid(fid) {
  return `fixture-rig-${fid}`;
}

/**
 * LightTimeline ↔ FixtureEngine 애니메이션 브릿지
 */
export function createFixtureLightBridge(lightTimeline, editor) {
  const lt = lightTimeline;

  function fe() {
    return editor.fixtureEngine;
  }

  function addFixtureTrack(fid, label, row) {
    const trackId = fixtureTrackId(fid);
    if (lt.tracks.has(trackId)) return lt.tracks.get(trackId);

    const trackElement = document.createElement("div");
    trackElement.className = "timeline-track light-timeline fixture-timeline";
    trackElement.dataset.objectId = trackId;

    const motionTracks = document.createElement("div");
    motionTracks.className = "motion-tracks";
    motionTracks.dataset.objectId = trackId;
    motionTracks.dataset.objectName = label;

    const trackHeader = document.createElement("div");
    trackHeader.className = "track-header";

    const trackInfo = document.createElement("div");
    trackInfo.className = "track-info track-info--light";
    const badge = document.createElement("span");
    badge.className = "light-type-badge light-type-badge--fixture";
    badge.textContent = "FX";
    const nameEl = document.createElement("span");
    nameEl.className = "track-name track-name--fixture";
    nameEl.textContent = label;
    trackInfo.appendChild(badge);
    trackInfo.appendChild(nameEl);

    const trackControls = document.createElement("div");
    trackControls.className = "track-controls";
    trackControls.innerHTML = `
      <button type="button" class="track-visibility-btn" title="숨기기/보이기"><i class="fa fa-eye"></i></button>
      <button type="button" class="add-keyframe-btn" title="키프레임 추가 (K)"><span class="kf-add-diamond" aria-hidden="true"></span></button>
      <button type="button" class="track-lock-btn" title="잠금"><i class="fa fa-lock-open"></i></button>
    `;

    trackHeader.appendChild(trackInfo);
    trackHeader.appendChild(trackControls);

    const trackContent = document.createElement("div");
    trackContent.className = "track-content";
    motionTracks.appendChild(trackHeader);
    motionTracks.appendChild(trackContent);
    trackElement.appendChild(motionTracks);
    lt.container.appendChild(trackElement);

    const track = {
      element: trackElement,
      keyframes: new Map(),
      objectId: trackId,
      objectName: label,
      row,
      col: fid % 10,
      trackContent,
      sprite: null,
      lightType: "Fixture",
      properties: {},
      timelineDataInitialized: true,
      isFixture: true,
      fid,
      fixtureUuid: fixtureUuid(fid),
    };

    lt.tracks.set(trackId, track);
    if (Array.isArray(lt.lightTracks)) lt.lightTracks.push(track);

    lt._ensureTrackHeaderControls?.(track);
    lt.createLightClip(track, label, false);
    lt.bindTrackEvents(track);

    const uuid = track.fixtureUuid;
    FIXTURE_TL_PROPS.forEach((prop) => {
      lt.timelineData.addTrack(uuid, prop, trackId);
    });

    return track;
  }

  function ensureTracks() {
    const engine = fe();
    const list = engine?.getFixtures?.() || [];
    if (!list.length) return 0;

    list.forEach((f, i) => {
      const row = Math.floor(i / RIG_MATRIX.cols);
      const rowName = ROW_DEFS[row]?.name?.replace(/ .*/, "") || "FX";
      const label = `#${f.fid} ${rowName}`;
      addFixtureTrack(f.fid, label, row);
    });

    return list.length;
  }

  function readLive(fid) {
    const f = fe()?.getFixture(fid);
    return f?.live || f?.attr || f?.home || {};
  }

  function addKeyframeAtPlayhead(trackObjectId) {
    const fid = parseFixtureFid(trackObjectId);
    if (!fid || !fe()?.built) {
      return { success: false, message: "픽스처 리그를 먼저 생성하세요." };
    }

    const track = lt.tracks.get(trackObjectId);
    if (!track) {
      return { success: false, message: "픽스처 트랙을 찾을 수 없습니다." };
    }

    const time = lt.getPlayheadTimeSeconds();
    lt.currentTime = time;

    if (!lt.isTimeInTrackClip(track, time)) {
      return {
        success: false,
        message: `플레이헤드(${time.toFixed(2)}s)가 클립 안에 있어야 합니다.`,
      };
    }

    const live = readLive(fid);
    const dim = Math.round(Number(live.dim) || 0);
    const pan = Math.round(Number(live.pan) || 0);
    const tilt = Math.round(Number(live.tilt) || 0);
    const color = new THREE.Vector3(live.r ?? 1, live.g ?? 1, live.b ?? 1);

    lt.addKeyframeForProperty(trackObjectId, "dim", time, dim);
    lt.addKeyframeForProperty(trackObjectId, "pan", time, pan);
    lt.addKeyframeForProperty(trackObjectId, "tilt", time, tilt);
    lt.addKeyframeForProperty(trackObjectId, "color", time, color);

    return { success: true, trackId: trackObjectId, time };
  }

  /** MA Console 그룹/다중 선택 → 선택 픽스처 전체에 키프레임 */
  function addKeyframesForSelection() {
    const engine = fe();
    const ids = engine?.getSelectionIds?.() || [];
    if (!ids.length) {
      return { success: false, message: "픽스처 또는 그룹을 먼저 선택하세요." };
    }
    if (!engine?.built) {
      return { success: false, message: "픽스처 리그를 먼저 생성하세요. (리그 생성 / 재배치)" };
    }

    const firstTrackId = fixtureTrackId(ids[0]);
    if (!lt.tracks.has(firstTrackId)) {
      ensureTracks();
    }
    if (!lt.tracks.has(firstTrackId)) {
      return {
        success: false,
        message: "Light 타임라인에 FX 트랙이 없습니다. 리그 생성 후 다시 시도하세요.",
      };
    }

    const time = lt.getPlayheadTimeSeconds();
    lt.currentTime = time;
    let count = 0;
    const failures = [];

    ids.forEach((fid) => {
      const trackId = fixtureTrackId(fid);
      if (!lt.tracks.has(trackId)) {
        failures.push(`#${fid} 트랙 없음 — 리그 생성 후 시도`);
        return;
      }
      const track = lt.tracks.get(trackId);
      if (!lt.isTimeInTrackClip(track, time)) {
        failures.push(`#${fid}: 플레이헤드가 클립 밖`);
        return;
      }
      const res = addKeyframeAtPlayhead(trackId);
      if (res.success) count++;
      else if (res.message) failures.push(res.message);
    });

    if (count > 0) return { success: true, count, time };
    return {
      success: false,
      message: failures[0] || "키프레임 추가 실패",
    };
  }

  function sampleProp(trackId, prop, time) {
    const td = lt._resolveTrackData(trackId, prop);
    if (!td || td.getKeyframeCount() === 0) return null;

    if (prop === "pan" || prop === "tilt") {
      return sampleAngleTrack(td, time);
    }

    const v = td.getValueAtTime(time);
    if (!v) return null;
    if (prop === "color") return { r: v.x, g: v.y, b: v.z };
    return v.x;
  }

  function syncAttrFromTimeline(f, tl) {
    if (tl.dim != null) f.attr.dim = tl.dim;
    if (tl.pan != null) f.attr.pan = tl.pan;
    if (tl.tilt != null) f.attr.tilt = tl.tilt;
    if (tl.zoom != null) f.attr.zoom = tl.zoom;
    if (tl.focus != null) f.attr.focus = tl.focus;
    if (tl.r != null) f.attr.r = tl.r;
    if (tl.g != null) f.attr.g = tl.g;
    if (tl.b != null) f.attr.b = tl.b;
    f.prog = {};
  }

  function applyAtTime(time) {
    const engine = fe();
    if (!engine?.built) return;

    const playing = !!lt.isPlaying;
    engine.isPlaying = playing;

    let anyTl = false;
    engine.fixtures.forEach((f) => {
      f.tl = null;
    });

    lt.tracks.forEach((track) => {
      if (!track.isFixture) return;
      const fid = track.fid;
      const f = engine.getFixture(fid);
      if (!f) return;

      const tl = {};
      const dim = sampleProp(track.objectId, "dim", time);
      const pan = sampleProp(track.objectId, "pan", time);
      const tilt = sampleProp(track.objectId, "tilt", time);
      const color = sampleProp(track.objectId, "color", time);

      if (dim != null) tl.dim = dim;
      if (pan != null) tl.pan = pan;
      if (tilt != null) tl.tilt = tilt;
      if (color) {
        tl.r = color.r;
        tl.g = color.g;
        tl.b = color.b;
      }

      if (Object.keys(tl).length) {
        f.tl = tl;
        anyTl = true;
        // 정지+스크럽: attr 동기화(선택 픽스처 프리뷰) / 재생: renderFixtures가 f.tl 직접 사용
        if (!playing) {
          syncAttrFromTimeline(f, tl);
        } else {
          f.prog = {};
        }
      }
    });

    engine.timelinePriority = anyTl;
    engine.update(time);
    if (!playing) editor.refreshMaConsole?.();
    if (anyTl) editor.signals?.rendererUpdated?.dispatch?.();
  }

  function clearTimelineOverrides() {
    const engine = fe();
    if (!engine) return;
    engine.isPlaying = false;
    engine.fixtures.forEach((f) => {
      f.tl = null;
    });
    engine.timelinePriority = false;
    engine.update();
  }

  function restoreKeyframeUI() {
    lt.tracks.forEach((track) => {
      if (!track.isFixture) return;
      FIXTURE_TL_PROPS.forEach((prop) => {
        const td = lt._resolveTrackData(track.objectId, prop);
        if (!td) return;
        for (let i = 0; i < td.keyframeCount; i++) {
          const t = td.times[i];
          const tKey = Number(t).toFixed(2);
          const existing = track.sprite?.querySelector(
            `[data-time="${tKey}"][data-property="${prop}"]`,
          );
          if (!existing) lt.addKeyframeUI(track.objectId, prop, t);
        }
      });
    });
  }

  return {
    ensureTracks,
    applyAtTime,
    clearTimelineOverrides,
    addKeyframeAtPlayhead,
    addKeyframesForSelection,
    restoreKeyframeUI,
    isFixtureTrack: isFixtureTrackId,
    fixtureTrackId,
  };
}
