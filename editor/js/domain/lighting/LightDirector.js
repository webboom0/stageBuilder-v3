import { INTERPOLATION } from '../timeline/types.js';
import { keyframeTimeEps, snapKeyframeTimeSec } from '../timeline/KeyframeStore.js';
import {
  applyHouseChannelBag,
  applyHouseLightLevels,
  captureHouseChannelBag,
  ensureHouseStageLights,
  isWorkLightActive,
  readHouseLightLevels,
  resetHouseChannelLive,
} from './houseStageLights.js';
import {
  asLightKeyValue,
  emptyLightKeyValue,
  sampleLightBag,
} from './lightKeyValue.js';

/** @typedef {'fill' | 'L' | 'C' | 'R'} HouseChannelId */

const DEFAULT_KEY_INTERP = INTERPOLATION.SMOOTH;

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
    /** @type {Map<string, import('./lightKeyValue.js').LightKeyValue>} */
    this._preHideBag = new Map();
  }

  /** Ensure physical HOUSE lights exist — no auto timeline tracks. */
  ensureHouseLights() {
    ensureHouseStageLights(this.stageManager);
    applyHouseLightLevels(this.scene, readHouseLightLevels(this.scene), this.stageManager);
    this.resyncChannelsFromEngine();
    this.apply(this.engine.playheadSec);
  }

  /** @deprecated use ensureHouseLights */
  ensureHouseTracks() {
    this.ensureHouseLights();
  }

  resyncChannelsFromEngine() {
    this.channels.clear();
    for (const def of HOUSE_CHANNELS) {
      const group = `light:house:${def.channel}`;
      const track = this.engine.listTracks().find((t) => t.group === group && t.kind === 'light');
      if (!track) continue;
      this.channels.set(def.channel, {
        channel: def.channel,
        trackId: track.id,
        name: def.trackName,
        kind: 'house',
      });
    }
  }

  /** Reset live HOUSE levels before loading another scene's tracks. */
  resetForSceneLoad() {
    for (const def of HOUSE_CHANNELS) {
      resetHouseChannelLive(this.scene, def.channel);
    }
    this._preHideBag.clear();
    this.channels.clear();
  }

  /**
   * @param {HouseChannelId} channel
   */
  ensureTrackForChannel(channel) {
    this.ensureHouseLights();
    const def = HOUSE_CHANNELS.find((d) => d.channel === channel);
    if (!def) return null;

    let ch = this.channels.get(channel);
    if (ch && this.engine.getTrack(ch.trackId)) return { ...ch, kind: 'house' };

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
      this.engine.emit('tracks');
    }
    ch = {
      channel: def.channel,
      trackId: track.id,
      name: def.trackName,
      kind: 'house',
    };
    this.channels.set(def.channel, ch);
    return { ...ch };
  }

  /** @param {string} trackId @param {{ history?: boolean }} [opt] */
  removeTrackById(trackId, opt = {}) {
    const ch = this.findByTrackId(trackId);
    if (!ch) return false;
    const { channel } = ch;
    this._preHideBag.delete(channel);
    this.channels.delete(channel);
    this.engine.removeTrack(trackId, { history: opt.history !== false });
    resetHouseChannelLive(this.scene, channel);
    this.apply(this.engine.playheadSec);
    return true;
  }

  /** Live bag for a channel (no track required). */
  liveBagForChannel(channel) {
    return asLightKeyValue(captureHouseChannelBag(this.scene, channel));
  }

  writeLiveForChannel(channel, patch) {
    const live = this.liveBagForChannel(channel);
    const bag = asLightKeyValue({ ...live, ...patch }, live);
    applyHouseChannelBag(this.scene, channel, bag);
    return true;
  }

  findByChannel(channel) {
    const ch = this.channels.get(channel);
    return ch ? { ...ch, kind: 'house' } : null;
  }

  /** Channels that have tracks. */
  list() {
    return [...this.channels.values()];
  }

  /** @param {string} trackId */
  findByTrackId(trackId) {
    for (const ch of this.channels.values()) {
      if (ch.trackId === trackId) {
        return { ...ch, kind: 'house' };
      }
    }
    return null;
  }

  /** @param {string} trackId */
  get(trackId) {
    return this.findByTrackId(trackId);
  }

  liveBagForTrack(trackId) {
    const ch = this.findByTrackId(trackId);
    if (!ch) return null;
    return asLightKeyValue(captureHouseChannelBag(this.scene, ch.channel));
  }

  keyValueForTrack(trackId) {
    const ch = this.findByTrackId(trackId);
    if (!ch) return null;
    const track = this.engine.getTrack(trackId);
    const fallback = this.liveBagForTrack(trackId) || emptyLightKeyValue();
    if (!track || !track.keys.length) return fallback;
    return sampleLightBag(track.keys, this.engine.playheadSec, fallback);
  }

  /**
   * @param {string} trackId
   * @param {Partial<import('./lightKeyValue.js').LightKeyValue>} patch
   * @param {{ forceKey?: boolean, interpolation?: number }} [opt]
   */
  writeBagOnSelectedKey(trackId, patch, opt = {}) {
    const ch = this.findByTrackId(trackId);
    if (!ch) return false;
    const track = this.engine.getTrack(trackId);
    if (!track || track.locked) return false;

    const ph = snapKeyframeTimeSec(this.engine.playheadSec, this.engine.fps);
    const eps = keyframeTimeEps(this.engine.fps);
    const nearPh = (kf) => kf && Math.abs(kf.timeSec - ph) <= eps;

    const liveBase = this.liveBagForTrack(trackId) || emptyLightKeyValue();
    const selId = this.engine.selectedTrackId === trackId ? this.engine.selectedKeyframeId : null;
    const selKfRaw = selId ? track.keys.get(selId) : null;
    const selKf = nearPh(selKfRaw) ? selKfRaw : null;
    const atPh = track.keys.findAtTime(ph, { eps });

    let bag;
    if (opt.forceKey) {
      bag = asLightKeyValue({ ...liveBase, ...patch }, liveBase);
    } else {
      const keyRaw = (selKf?.value || atPh?.value) || null;
      const base = keyRaw ? asLightKeyValue(keyRaw, liveBase) : liveBase;
      bag = asLightKeyValue({ ...base, ...patch }, base);
    }

    if (opt.forceKey) {
      if (atPh) {
        this.engine.editKeyframe(trackId, atPh.id, { value: bag });
      } else {
        this.engine.addKeyframe(
          trackId,
          ph,
          bag,
          opt.interpolation ?? DEFAULT_KEY_INTERP,
        );
      }
    } else if (selKf) {
      this.engine.editKeyframe(trackId, selKf.id, { value: bag });
    } else if (atPh) {
      this.engine.editKeyframe(trackId, atPh.id, { value: bag });
    } else {
      applyHouseChannelBag(this.scene, ch.channel, bag);
      return true;
    }
    this.apply(this.engine.playheadSec);
    return true;
  }

  addKeyAtPlayhead(trackId, opt = {}) {
    return this.writeBagOnSelectedKey(trackId, {}, { forceKey: true, ...opt });
  }

  navigateChannelKeys(channel, dir) {
    const ch = this.findByChannel(channel);
    if (!ch) return false;
    const track = this.engine.getTrack(ch.trackId);
    if (!track?.keys.length) return false;
    const ph = this.engine.playheadSec;
    const times = track.keys.list()
      .map((k) => k.timeSec)
      .filter((t) => (dir === 'prev' ? t < ph - 1e-6 : t > ph + 1e-6));
    if (!times.length) return false;
    times.sort((a, b) => a - b);
    this.engine.playheadSec = dir === 'prev' ? times[times.length - 1] : times[0];
    this.engine.emit('playhead');
    this.apply(this.engine.playheadSec);
    return true;
  }

  deleteKeyAtPlayhead(channel) {
    const ch = this.findByChannel(channel);
    if (!ch) return false;
    const track = this.engine.getTrack(ch.trackId);
    if (!track) return false;
    const atPh = track.keys.findAtTime(this.engine.playheadSec);
    if (!atPh) return false;
    this.engine.removeKeyframe(ch.trackId, atPh.id);
    this.apply(this.engine.playheadSec);
    return true;
  }

  /** @param {number} timeSec */
  apply(timeSec) {
    if (this.suspendApply) return;
    for (const ch of this.channels.values()) {
      const track = this.engine.getTrack(ch.trackId);
      if (!track) continue;

      // v3: eye-off → dim 0 (mute). Restore from keys / pre-hide cache when shown again.
      if (track.hidden) {
        if (!this._preHideBag.has(ch.channel)) {
          this._preHideBag.set(
            ch.channel,
            captureHouseChannelBag(this.scene, ch.channel),
          );
        }
        const base = track.keys.length
          ? sampleLightBag(
            track.keys,
            timeSec,
            this._preHideBag.get(ch.channel),
          )
          : this._preHideBag.get(ch.channel);
        applyHouseChannelBag(this.scene, ch.channel, { ...asLightKeyValue(base), dim: 0 });
        continue;
      }

      if (this._preHideBag.has(ch.channel) && !track.keys.length) {
        applyHouseChannelBag(this.scene, ch.channel, this._preHideBag.get(ch.channel));
        this._preHideBag.delete(ch.channel);
        continue;
      }
      this._preHideBag.delete(ch.channel);

      // WORK off + no fill keys → keep fill dark (don't let stray live levels glow)
      if (ch.channel === 'fill' && !isWorkLightActive(this.scene) && !track.keys.length) {
        applyHouseChannelBag(this.scene, ch.channel, {
          ...captureHouseChannelBag(this.scene, ch.channel),
          dim: 0,
        });
        continue;
      }

      // No keys → leave live levels (panel dim without +키)
      if (!track.keys.length) continue;
      const bag = sampleLightBag(
        track.keys,
        timeSec,
        captureHouseChannelBag(this.scene, ch.channel),
      );
      applyHouseChannelBag(this.scene, ch.channel, bag);
    }
  }
}
