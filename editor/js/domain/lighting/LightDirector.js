import { INTERPOLATION } from '../timeline/types.js';
import {
  applyHouseChannelBag,
  applyHouseLightLevels,
  captureHouseChannelBag,
  defaultHouseLightLevels,
  ensureHouseStageLights,
  readHouseLightLevels,
} from './houseStageLights.js';
import {
  asLightKeyValue,
  emptyLightKeyValue,
  sampleLightBag,
} from './lightKeyValue.js';

/** @typedef {'fill' | 'L' | 'C' | 'R'} HouseChannelId */

/** @type {ReadonlyArray<{
 *   channel: HouseChannelId,
 *   trackName: string,
 *   color: string,
 * }>} */
export const HOUSE_CHANNELS = Object.freeze([
  { channel: 'fill', trackName: 'HOUSE · Fill', color: '#c9a227' },
  { channel: 'L', trackName: 'HOUSE · FOH L', color: '#d4b84a' },
  { channel: 'C', trackName: 'HOUSE · FOH C', color: '#b8952e' },
  { channel: 'R', trackName: 'HOUSE · FOH R', color: '#e0c35c' },
]);

/**
 * LightDirector — HOUSE channels as compound light tracks (1 channel = 1 track).
 */
export class LightDirector {
  /**
   * @param {{
   *   scene: import('three').Scene,
   *   engine: import('../timeline/TimelineEngine.js').TimelineEngine,
   *   stageManager: import('../stage/StageManager.js').StageManager,
   * }} opts
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.engine = opts.engine;
    this.stageManager = opts.stageManager;
    /** @type {Map<string, { channel: HouseChannelId, trackId: string, name: string }>} */
    this.channels = new Map();
    this.suspendApply = false;
  }

  /** Ensure stage lights + 4 timeline tracks (idempotent). */
  ensureHouseTracks() {
    ensureHouseStageLights(this.stageManager);

    const existing = this.engine.listTracks().filter((t) => t.kind === 'light' && t.section === 'light');
    if (existing.length >= 4 && this.channels.size >= 4) {
      applyHouseLightLevels(this.scene, readHouseLightLevels(this.scene));
      return;
    }

    // Clear stale map if tracks were removed
    this.channels.clear();

    for (const def of HOUSE_CHANNELS) {
      const group = `light:house:${def.channel}`;
      let track = this.engine.listTracks().find((t) => t.group === group && t.kind === 'light');
      if (!track) {
        track = this.engine.addTrack({
          name: def.trackName,
          kind: 'light',
          group,
          section: 'light',
          color: def.color,
        });
        const bag = channelStartupBag(def.channel);
        this.engine.addKeyframe(track.id, 0, bag, INTERPOLATION.LINEAR);
      }
      this.channels.set(def.channel, {
        channel: def.channel,
        trackId: track.id,
        name: def.trackName,
      });
    }

    // Dim work lights slightly so HOUSE dominates when raised
    applyHouseLightLevels(this.scene, readHouseLightLevels(this.scene));
    this.engine.emit('tracks');
    this.apply(this.engine.playheadSec);
  }

  list() {
    return [...this.channels.values()];
  }

  /** @param {string} trackId */
  findByTrackId(trackId) {
    for (const ch of this.channels.values()) {
      if (ch.trackId === trackId) return ch;
    }
    return null;
  }

  /** @param {string} trackId */
  get(trackId) {
    return this.findByTrackId(trackId);
  }

  /**
   * @param {string} trackId
   * @returns {import('./lightKeyValue.js').LightKeyValue | null}
   */
  keyValueForTrack(trackId) {
    const ch = this.findByTrackId(trackId);
    if (!ch) return null;
    const track = this.engine.getTrack(trackId);
    if (!track) return captureHouseChannelBag(this.scene, ch.channel);
    return sampleLightBag(
      track.keys,
      this.engine.playheadSec,
      captureHouseChannelBag(this.scene, ch.channel),
    );
  }

  /**
   * Push bag to selected key (or add at playhead) and apply.
   * @param {string} trackId
   * @param {Partial<import('./lightKeyValue.js').LightKeyValue>} patch
   */
  writeBagOnSelectedKey(trackId, patch) {
    const ch = this.findByTrackId(trackId);
    if (!ch) return false;
    const track = this.engine.getTrack(trackId);
    if (!track || track.locked) return false;

    const base = this.keyValueForTrack(trackId) || emptyLightKeyValue();
    const bag = asLightKeyValue({ ...base, ...patch }, base);

    if (this.engine.selectedTrackId === trackId && this.engine.selectedKeyframeId) {
      this.engine.editKeyframe(trackId, this.engine.selectedKeyframeId, { value: bag });
    } else {
      this.engine.addKeyframe(trackId, this.engine.playheadSec, bag, INTERPOLATION.LINEAR);
    }
    this.apply(this.engine.playheadSec);
    return true;
  }

  /** @param {number} timeSec */
  apply(timeSec) {
    if (this.suspendApply) return;
    for (const ch of this.channels.values()) {
      const track = this.engine.getTrack(ch.trackId);
      if (!track || track.hidden) continue;
      const bag = sampleLightBag(
        track.keys,
        timeSec,
        captureHouseChannelBag(this.scene, ch.channel),
      );
      applyHouseChannelBag(this.scene, ch.channel, bag);
    }
  }
}

/** @param {HouseChannelId} channel */
function channelStartupBag(channel) {
  const levels = defaultHouseLightLevels();
  if (channel === 'fill') {
    return asLightKeyValue({
      dim: levels.fill,
      color: levels.colorFill,
      size: 0.5,
    });
  }
  return asLightKeyValue({
    dim: levels[`foh${channel}`],
    color: levels[`color${channel}`],
    size: levels[`size${channel}`],
  });
}
