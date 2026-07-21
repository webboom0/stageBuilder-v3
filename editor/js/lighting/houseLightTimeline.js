import * as THREE from "three";
import { INTERPOLATION } from "../timeline/TimelineCore.js";
import {
  getHouseChannelCapture,
  readHouseLightLevels,
  applyHouseLightLevels,
  rgb01ToHex,
} from "./houseStageLights.js";

export const HOUSE_TRACK_PREFIX = "house_";
export const HOUSE_TL_PROPS = ["dim", "color", "size"];

export const HOUSE_CHANNELS = [
  { id: "fill", label: "House Fill", channel: "fill" },
  { id: "fohL", label: "FOH Left", channel: "L" },
  { id: "fohC", label: "FOH Center", channel: "C" },
  { id: "fohR", label: "FOH Right", channel: "R" },
];

export function houseTrackId(id) {
  return `${HOUSE_TRACK_PREFIX}${id}`;
}

export function parseHouseTrackId(trackId) {
  if (!trackId || !String(trackId).startsWith(HOUSE_TRACK_PREFIX)) return null;
  return String(trackId).slice(HOUSE_TRACK_PREFIX.length);
}

export function isHouseTrackId(trackId) {
  return parseHouseTrackId(trackId) != null;
}

function houseUuid(id) {
  return `house-light-${id}`;
}

function easeInterpolationT(t, interpolation) {
  if (interpolation === INTERPOLATION.SMOOTHSTEP) return t * t * (3 - 2 * t);
  if (interpolation === INTERPOLATION.STEP) return 0;
  return t;
}

function sampleScalar(trackData, time) {
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
  return prev + (next - prev) * t;
}

/**
 * LightTimeline ↔ HOUSE / FOH 핀조명 브릿지
 */
export function createHouseLightBridge(lightTimeline, editor) {
  const lt = lightTimeline;

  function channelMeta(trackId) {
    const id = parseHouseTrackId(trackId);
    return HOUSE_CHANNELS.find((c) => c.id === id) || null;
  }

  function addHouseTrack(def) {
    const trackId = houseTrackId(def.id);
    if (lt.tracks.has(trackId)) {
      const existing = lt.tracks.get(trackId);
      if (existing && !existing.isHouse) {
        existing.isHouse = true;
        existing.houseChannel = def.channel;
      }
      return existing;
    }

    const trackElement = document.createElement("div");
    trackElement.className = "timeline-track light-timeline house-timeline";
    trackElement.dataset.objectId = trackId;

    const motionTracks = document.createElement("div");
    motionTracks.className = "motion-tracks";
    motionTracks.dataset.objectId = trackId;
    motionTracks.dataset.objectName = def.label;

    const trackHeader = document.createElement("div");
    trackHeader.className = "track-header";

    const trackInfo = document.createElement("div");
    trackInfo.className = "track-info track-info--light";
    const badge = document.createElement("span");
    badge.className = "light-type-badge light-type-badge--house";
    badge.textContent = "HS";
    const nameEl = document.createElement("span");
    nameEl.className = "track-name track-name--house";
    nameEl.textContent = def.label;
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
      objectName: def.label,
      trackContent,
      sprite: null,
      lightType: "House",
      properties: {},
      timelineDataInitialized: true,
      isHouse: true,
      houseId: def.id,
      houseChannel: def.channel,
      fixtureUuid: houseUuid(def.id),
    };

    lt.tracks.set(trackId, track);
    if (Array.isArray(lt.lightTracks)) lt.lightTracks.push(track);

    lt._ensureTrackHeaderControls?.(track);
    lt.createLightClip?.(track, def.label, false);
    lt.bindTrackEvents?.(track);

    const uuid = track.fixtureUuid;
    HOUSE_TL_PROPS.forEach((prop) => {
      // fill은 size 키프레임 생략 가능하지만 트랙은 통일
      lt.timelineData.addTrack(uuid, prop, trackId);
    });

    return track;
  }

  function ensureTracks() {
    HOUSE_CHANNELS.forEach((def) => addHouseTrack(def));
    return HOUSE_CHANNELS.length;
  }

  function writeHouseKeyframesAtTime(trackObjectId, time, cap) {
    const dim = Math.round(Number(cap.dim) || 0);
    const size = Math.round(Number(cap.size) ?? 50);
    const color = new THREE.Vector3(cap.r ?? 1, cap.g ?? 1, cap.b ?? 1);
    lt.addKeyframeForProperty(trackObjectId, "dim", time, dim);
    lt.addKeyframeForProperty(trackObjectId, "color", time, color);
    lt.addKeyframeForProperty(trackObjectId, "size", time, size);
  }

  function addKeyframeAtPlayhead(trackObjectId) {
    const meta = channelMeta(trackObjectId);
    if (!meta) {
      return { success: false, message: "HOUSE 트랙이 아닙니다." };
    }
    const track = lt.tracks.get(trackObjectId);
    if (!track) {
      return { success: false, message: "HOUSE 트랙을 찾을 수 없습니다." };
    }

    const time = lt.getPlayheadTimeSeconds();
    lt.currentTime = time;
    if (!lt.isTimeInTrackClip(track, time)) {
      return {
        success: false,
        message: `플레이헤드(${time.toFixed(2)}s)가 클립 안에 있어야 합니다.`,
      };
    }

    const cap = getHouseChannelCapture(editor, meta.channel);
    writeHouseKeyframesAtTime(trackObjectId, time, cap);
    lt.timelineData?.precomputeAnimationData?.();
    lt.clearSelectedKeyframe?.();
    applyAtTime(time);
    return { success: true, trackId: trackObjectId, time };
  }

  function sampleProp(trackId, prop, time) {
    const td = lt._resolveTrackData(trackId, prop);
    if (!td || td.getKeyframeCount() === 0) return null;
    if (prop === "color") {
      const v = td.getValueAtTime(time);
      if (!v) return null;
      return { r: v.x, g: v.y, b: v.z };
    }
    return sampleScalar(td, time);
  }

  function applyAtTime(time) {
    const levels = readHouseLightLevels(editor.scene);
    let any = false;

    HOUSE_CHANNELS.forEach((def) => {
      const trackId = houseTrackId(def.id);
      const track = lt.tracks.get(trackId);
      if (!track) return;

      const userHidden = !!lt._isTrackUserHidden?.(track);
      const dim = sampleProp(trackId, "dim", time);
      const color = sampleProp(trackId, "color", time);
      const size = sampleProp(trackId, "size", time);
      if (dim == null && !color && size == null && !userHidden) return;

      any = true;
      const cap = {
        dim: userHidden
          ? 0
          : dim != null
            ? dim
            : getHouseChannelCapture(editor, def.channel).dim,
        r: color?.r ?? 1,
        g: color?.g ?? 1,
        b: color?.b ?? 1,
        size: size != null ? size : getHouseChannelCapture(editor, def.channel).size,
      };

      if (def.channel === "fill") {
        levels.fill = Math.max(0, Math.min(1, (Number(cap.dim) || 0) / 100));
        levels.colorFill = rgb01ToHex(cap.r, cap.g, cap.b);
      } else {
        const s = def.channel;
        levels[`foh${s}`] = Math.max(0, Math.min(1, (Number(cap.dim) || 0) / 100));
        levels[`color${s}`] = rgb01ToHex(cap.r, cap.g, cap.b);
        levels[`size${s}`] = Math.max(0, Math.min(1, (Number(cap.size) ?? 50) / 100));
      }
    });

    if (any) {
      applyHouseLightLevels(editor, levels);
    }
  }

  function restoreKeyframeUI() {
    lt.tracks.forEach((track) => {
      if (!track.isHouse) return;
      HOUSE_TL_PROPS.forEach((prop) => {
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

  function syncPanelFromSelection() {
    const levels = readHouseLightLevels(editor.scene);
    const pct = (v) => Math.round((Number(v) || 0) * 100);
    const setRange = (id, valId, v01) => {
      const el = document.querySelector(id);
      const vel = document.querySelector(valId);
      if (el) el.value = String(pct(v01));
      if (vel) vel.textContent = `${pct(v01)}%`;
    };
    const setColor = (id, hex) => {
      const el = document.querySelector(id);
      if (el && hex) el.value = hex;
    };
    setRange("#sbHouseFill", "#sbHouseFillVal", levels.fill);
    setRange("#sbHouseL", "#sbHouseLVal", levels.fohL);
    setRange("#sbHouseC", "#sbHouseCVal", levels.fohC);
    setRange("#sbHouseR", "#sbHouseRVal", levels.fohR);
    setRange("#sbHouseLSize", "#sbHouseLSizeVal", levels.sizeL);
    setRange("#sbHouseCSize", "#sbHouseCSizeVal", levels.sizeC);
    setRange("#sbHouseRSize", "#sbHouseRSizeVal", levels.sizeR);
    setColor("#sbHouseFillColor", levels.colorFill);
    setColor("#sbHouseLColor", levels.colorL);
    setColor("#sbHouseCColor", levels.colorC);
    setColor("#sbHouseRColor", levels.colorR);
    editor.refreshMaConsole?.();
  }

  return {
    ensureTracks,
    applyAtTime,
    addKeyframeAtPlayhead,
    writeHouseKeyframesAtTime,
    restoreKeyframeUI,
    syncPanelFromSelection,
    isHouseTrack: isHouseTrackId,
    houseTrackId,
    HOUSE_CHANNELS,
  };
}
