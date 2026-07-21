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
export const FIXTURE_TL_PROPS = ["dim", "pan", "tilt", "color", "zoom", "focus"];

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
    if (lt.tracks.has(trackId)) {
      const existing = lt.tracks.get(trackId);
      if (existing && existing.fid == null) existing.fid = fid;
      return existing;
    }

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

  function removeAllFixtureTracks() {
    const ids = [];
    lt.tracks.forEach((track, id) => {
      if (isFixtureTrackId(id)) ids.push(id);
    });

    ids.forEach((id) => {
      const track = lt.tracks.get(id);
      track?.element?.remove();
      lt.tracks.delete(id);
      FIXTURE_TL_PROPS.forEach((prop) => {
        lt.timelineData?.removeTrackById?.(id, prop);
      });
    });

    if (ids.length) {
      lt.timelineData.dirty = true;
      lt.updateUI?.();
    }

    return ids.length;
  }

  function readCapture(fid) {
    const engine = fe();
    return (
      engine?.getFixtureCaptureState?.(fid) ||
      engine?.getFixture(fid)?.attr ||
      {}
    );
  }

  function writeFixtureKeyframesAtTime(trackObjectId, time, cap) {
    const dim = Math.round(Number(cap.dim) || 0);
    const pan = Math.round(Number(cap.pan) || 0);
    const tilt = Math.round(Number(cap.tilt) || 0);
    const color = new THREE.Vector3(cap.r ?? 1, cap.g ?? 1, cap.b ?? 1);

    lt.addKeyframeForProperty(trackObjectId, "dim", time, dim);
    lt.addKeyframeForProperty(trackObjectId, "pan", time, pan);
    lt.addKeyframeForProperty(trackObjectId, "tilt", time, tilt);
    lt.addKeyframeForProperty(trackObjectId, "color", time, color);
    if (cap.zoom != null) {
      lt.addKeyframeForProperty(
        trackObjectId,
        "zoom",
        time,
        Math.round(Number(cap.zoom) || 0)
      );
    }
    if (cap.focus != null) {
      lt.addKeyframeForProperty(
        trackObjectId,
        "focus",
        time,
        Math.round(Number(cap.focus) || 0)
      );
    }
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

    const cap = readCapture(fid);
    writeFixtureKeyframesAtTime(trackObjectId, time, cap);

    fe()?.commitFixtureEditToAttr?.(fid);
    lt.timelineData?.precomputeAnimationData?.();
    lt.clearSelectedKeyframe?.();
    applyAtTime(time);

    return { success: true, trackId: trackObjectId, time };
  }

  /** MA Console 그룹/다중 선택 → 픽스처별 값을 각자 캡처 후 일괄 키프레임 */
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

    const pending = [];
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
      pending.push({ fid, trackId, cap: readCapture(fid) });
    });

    if (!pending.length) {
      return {
        success: false,
        message: failures[0] || "키프레임 추가 실패",
      };
    }

    pending.forEach(({ fid, trackId, cap }) => {
      writeFixtureKeyframesAtTime(trackId, time, cap);
      engine.commitFixtureEditToAttr?.(fid);
    });

    lt.timelineData?.precomputeAnimationData?.();
    // 그룹 키 추가 후 키/픽스처 단일 선택으로 바뀌지 않게 유지
    lt.clearSelectedKeyframe?.();
    applyAtTime(time);

    return {
      success: true,
      count: pending.length,
      time,
      failures: failures.length ? failures : undefined,
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

  function applyAtTime(time, { syncSelected = false } = {}) {
    const engine = fe();
    if (!engine?.built) return;

    const playing = !!lt.isPlaying;
    engine.isPlaying = playing;

    let anyTl = false;
    let panelSync = false;
    engine.fixtures.forEach((f) => {
      f.tl = null;
    });

    lt.tracks.forEach((track) => {
      if (!track.isFixture) return;
      const fid = track.fid ?? parseFixtureFid(track.objectId);
      if (fid == null) return;
      const f = engine.getFixture(fid);
      if (!f) return;

      const userHidden = !!lt._isTrackUserHidden?.(track);
      const tl = {};
      const dim = sampleProp(track.objectId, "dim", time);
      const pan = sampleProp(track.objectId, "pan", time);
      const tilt = sampleProp(track.objectId, "tilt", time);
      const color = sampleProp(track.objectId, "color", time);
      const zoom = sampleProp(track.objectId, "zoom", time);
      const focus = sampleProp(track.objectId, "focus", time);

      if (dim != null) tl.dim = userHidden ? 0 : dim;
      else if (userHidden) tl.dim = 0;
      if (pan != null) tl.pan = pan;
      if (tilt != null) tl.tilt = tilt;
      if (zoom != null) tl.zoom = zoom;
      if (focus != null) tl.focus = focus;
      if (color) {
        tl.r = color.r;
        tl.g = color.g;
        tl.b = color.b;
      }

      if (Object.keys(tl).length) {
        f.tl = tl;
        anyTl = true;
        if (!playing) {
          const preservePanel =
            f.sel && f.prog && Object.keys(f.prog).length > 0;
          if (!preservePanel || syncSelected) {
            syncAttrFromTimeline(f, tl);
            panelSync = true;
          }
        } else {
          f.prog = {};
        }
      } else if (userHidden) {
        f.tl = { dim: 0 };
        anyTl = true;
      }
    });

    engine.timelinePriority = anyTl;
    engine.update(time);
    if (!playing && panelSync) editor.refreshMaConsole?.();
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

  function collectSelectionKeyframeTimes() {
    const ids = fe()?.getSelectionIds?.() || [];
    const times = new Set();
    ids.forEach((fid) => {
      const trackId = fixtureTrackId(fid);
      FIXTURE_TL_PROPS.forEach((prop) => {
        const td = lt._resolveTrackData(trackId, prop);
        if (!td) return;
        for (let i = 0; i < td.keyframeCount; i++) {
          times.add(Number(Number(td.times[i]).toFixed(3)));
        }
      });
    });
    return Array.from(times).sort((a, b) => a - b);
  }

  function navigateSelectionKeyframes(direction) {
    const times = collectSelectionKeyframeTimes();
    if (!times.length) return { success: false, message: "키프레임 없음" };

    const t = lt.getPlayheadTimeSeconds?.() ?? lt.currentTime ?? 0;
    let target = null;
    if (direction === "prev") {
      for (let i = times.length - 1; i >= 0; i--) {
        if (times[i] < t - 0.02) {
          target = times[i];
          break;
        }
      }
      if (target == null) target = times[times.length - 1];
    } else {
      for (let i = 0; i < times.length; i++) {
        if (times[i] > t + 0.02) {
          target = times[i];
          break;
        }
      }
      if (target == null) target = times[0];
    }

    lt.movePlayheadToTime?.(target);
    lt.currentTime = target;

    const fid = fe()?.getSelectionIds?.()?.[0];
    if (fid) {
      const trackId = fixtureTrackId(fid);
      const track = lt.tracks.get(trackId);
      if (track?.element) {
        lt.selectLightTrack?.(trackId);
        const tol = 0.02;
        const kf = track.sprite?.querySelector(".keyframe");
        let match = null;
        track.sprite?.querySelectorAll(".keyframe").forEach((el) => {
          const kt = parseFloat(el.dataset.time);
          if (!Number.isNaN(kt) && Math.abs(kt - target) < tol) match = el;
        });
        if (match) {
          lt.selectKeyframe(
            trackId,
            target,
            match,
            match.dataset.property || "dim",
          );
        }
      }
    }

    applyAtTime(target, { syncSelected: true });
    return { success: true, time: target };
  }

  function deleteSelectionKeyframesAtPlayhead() {
    const ids = fe()?.getSelectionIds?.() || [];
    if (!ids.length) return { success: false, message: "픽스처 선택 필요" };

    const time = lt.getPlayheadTimeSeconds?.() ?? lt.currentTime ?? 0;
    let count = 0;
    ids.forEach((fid) => {
      const trackId = fixtureTrackId(fid);
      const track = lt.tracks.get(trackId);
      if (!track) return;
      if (lt._deleteKeyframesAtTimeForTrack?.(track, time, { clearSelection: false })) {
        count++;
      }
    });

    lt.clearSelectedKeyframe?.();
    applyAtTime(time);
    return { success: count > 0, count };
  }

  return {
    ensureTracks,
    removeAllFixtureTracks,
    applyAtTime,
    clearTimelineOverrides,
    addKeyframeAtPlayhead,
    addKeyframesForSelection,
    writeFixtureKeyframesAtTime,
    restoreKeyframeUI,
    navigateSelectionKeyframes,
    deleteSelectionKeyframesAtPlayhead,
    isFixtureTrack: isFixtureTrackId,
    fixtureTrackId,
  };
}
