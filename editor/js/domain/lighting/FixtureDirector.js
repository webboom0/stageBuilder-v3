import { INTERPOLATION } from '../timeline/types.js';
import { keyframeTimeEps, snapKeyframeTimeSec } from '../timeline/KeyframeStore.js';
import { FixtureEngine } from './FixtureEngine.js';
import { ensureHouseStageLights } from './houseStageLights.js';
import {
  fixtureTrackGroup,
  parseFixtureFidFromGroup,
  ROW_DEFS,
} from './fixtureTypes.js';
import {
  asFixtureKeyValue,
  emptyFixtureKeyValue,
  engineAttrToFixtureBag,
  fixtureBagToEngineAttr,
  sampleFixtureBag,
} from './fixtureKeyValue.js';

const TRACK_COLORS = Object.freeze({
  mh: '#6ea8fe',
  foh: '#7dd3a0',
  back: '#c9a0dc',
});

const DEFAULT_KEY_INTERP = INTERPOLATION.SMOOTH;

/**
 * FixtureDirector — rig always available; timeline tracks only when user adds them.
 */
export class FixtureDirector {
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
    this.fxEngine = new FixtureEngine({
      scene: opts.scene,
      stageManager: opts.stageManager,
    });
    /** @type {Map<number, { fid: number, trackId: string, name: string, grp: string }>} */
    this.channels = new Map();
    this.suspendApply = false;
  }

  /** Build / refit rig only — no auto timeline tracks (v3-style on demand). */
  ensureRig() {
    ensureHouseStageLights(this.stageManager);
    this.fxEngine.ensureRig();
    this.resyncChannelsFromEngine();
    this.apply(this.engine.playheadSec);
  }

  /** @deprecated use ensureRig — kept so old call sites still build the rig */
  ensureFixtureTracks() {
    this.ensureRig();
  }

  /** Rebuild channel map from existing light tracks only. */
  resyncChannelsFromEngine() {
    this.channels.clear();
    for (const track of this.engine.listTracks()) {
      if (track.kind !== 'light') continue;
      const fid = parseFixtureFidFromGroup(track.group);
      if (fid == null) continue;
      const f = this.fxEngine.getFixture(fid);
      if (!f) continue;
      this.channels.set(fid, {
        fid,
        trackId: track.id,
        name: track.name,
        grp: f.grp,
      });
    }
  }

  /** Clear fixture timeline + live programmer state before loading another scene. */
  resetForSceneLoad() {
    this.channels.clear();
    if (this.fxEngine.built) {
      this.fxEngine.resetLiveState();
    }
  }

  /**
   * Create timeline track for one fixture if missing.
   * @param {number} fid
   */
  ensureTrackForFid(fid) {
    this.ensureRig();
    const n = Number(fid);
    const f = this.fxEngine.getFixture(n);
    if (!f) return null;

    let ch = this.channels.get(n);
    if (ch && this.engine.getTrack(ch.trackId)) return ch;

    const group = fixtureTrackGroup(n);
    let track = this.engine.listTracks().find((t) => t.group === group && t.kind === 'light');
    const trackName = `FX ${n} · ${f.short || f.grp}`;
    if (!track) {
      track = this.engine.addTrack({
        name: trackName,
        kind: 'light',
        group,
        section: 'light',
        color: TRACK_COLORS[f.grp] || '#8899aa',
      });
      this.engine.emit('tracks');
    }
    ch = {
      fid: n,
      trackId: track.id,
      name: track.name || trackName,
      grp: f.grp,
    };
    this.channels.set(n, ch);
    return ch;
  }

  /** @param {Iterable<number>} fids */
  ensureTracksForFids(fids) {
    let n = 0;
    for (const fid of fids) {
      if (this.ensureTrackForFid(fid)) n += 1;
    }
    return n;
  }

  /**
   * Remove timeline track for fixture (rig stays).
   * @param {string} trackId
   * @param {{ history?: boolean }} [opt]
   */
  removeTrackById(trackId, opt = {}) {
    const ch = this.findByTrackId(trackId);
    if (!ch) return false;
    this.channels.delete(ch.fid);
    this.fxEngine.setTimelineBag(ch.fid, null);
    this.engine.removeTrack(trackId, { history: opt.history !== false });
    this.fxEngine.update();
    return true;
  }

  refit() {
    if (!this.fxEngine.built) return;
    this.fxEngine.fitToStage();
    this.apply(this.engine.playheadSec);
  }

  /** @param {number} fid */
  findByFid(fid) {
    const ch = this.channels.get(Number(fid));
    if (!ch) return null;
    return {
      kind: 'fixture',
      fid: ch.fid,
      trackId: ch.trackId,
      name: ch.name,
      grp: ch.grp,
      channel: `fx_${ch.fid}`,
    };
  }

  /** Fixtures that already have timeline tracks. */
  list() {
    return [...this.channels.values()];
  }

  /** All rig fixtures (with or without tracks) for the sheet UI. */
  listRigFixtures() {
    this.ensureRig();
    return this.fxEngine.getFixtures().map((f) => ({
      fid: f.fid,
      name: f.name,
      grp: f.grp,
      short: f.short,
      trackId: this.channels.get(f.fid)?.trackId || null,
      hasTrack: this.channels.has(f.fid),
    }));
  }

  /** @param {string} trackId */
  findByTrackId(trackId) {
    for (const ch of this.channels.values()) {
      if (ch.trackId === trackId) {
        return {
          kind: 'fixture',
          fid: ch.fid,
          trackId: ch.trackId,
          name: ch.name,
          grp: ch.grp,
          channel: `fx_${ch.fid}`,
        };
      }
    }
    const track = this.engine.getTrack(trackId);
    const fid = track ? parseFixtureFidFromGroup(track.group) : null;
    if (fid != null && this.fxEngine.getFixture(fid)) {
      return {
        kind: 'fixture',
        fid,
        trackId,
        name: track.name,
        grp: this.fxEngine.getFixture(fid)?.grp || 'mh',
        channel: `fx_${fid}`,
      };
    }
    return null;
  }

  liveBagForTrack(trackId) {
    const ch = this.findByTrackId(trackId);
    if (!ch) return null;
    const cap = this.fxEngine.getFixtureCaptureState(ch.fid);
    return engineAttrToFixtureBag(cap || this.fxEngine.captureAttr(ch.fid));
  }

  /** Live bag for a fid (even without track). */
  liveBagForFid(fid) {
    const cap = this.fxEngine.getFixtureCaptureState(Number(fid));
    return engineAttrToFixtureBag(cap || this.fxEngine.captureAttr(Number(fid)));
  }

  keyValueForTrack(trackId) {
    const ch = this.findByTrackId(trackId);
    if (!ch) return null;
    const track = this.engine.getTrack(trackId);
    const fallback = this.liveBagForTrack(trackId) || emptyFixtureKeyValue();
    if (!track || !track.keys.length) return fallback;
    return sampleFixtureBag(track.keys, this.engine.playheadSec, fallback);
  }

  /**
   * @param {string} trackId
   * @param {Partial<import('./fixtureKeyValue.js').FixtureKeyValue>} patch
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

    const multi = (this.engine.listSelectedKeys?.() || [])
      .filter((r) => r.trackId === trackId);
    const selId = multi[0]?.keyId
      || (this.engine.selectedTrackId === trackId ? this.engine.selectedKeyframeId : null);
    const selKfRaw = selId ? track.keys.get(selId) : null;
    // Only edit a selected key if it sits on the playhead (moving time must not overwrite old keys)
    const selKf = nearPh(selKfRaw) ? selKfRaw : null;
    const atPh = track.keys.findAtTime(ph, { eps });

    const liveBase = this.liveBagForTrack(trackId) || emptyFixtureKeyValue();
    let bag;
    if (opt.forceKey) {
      // +키 — capture current live/panel state; same-time key is overwritten, not stacked
      bag = asFixtureKeyValue({ ...liveBase, ...patch }, liveBase);
    } else {
      const keyRaw = (selKf?.value || atPh?.value) || null;
      const base = keyRaw ? asFixtureKeyValue(keyRaw, liveBase) : liveBase;
      bag = asFixtureKeyValue({ ...base, ...patch }, base);
    }
    const engAttr = fixtureBagToEngineAttr(bag);

    if (opt.forceKey) {
      // +키 always targets playhead — never the previously selected off-time key
      if (atPh) {
        this.engine.editKeyframe(trackId, atPh.id, { value: bag });
      } else {
        this.engine.addKeyframe(
          trackId,
          ph,
          bag,
          opt.interpolation ?? DEFAULT_KEY_INTERP,
        );
        this.fxEngine.commitFixtureEditToAttr(ch.fid);
      }
    } else if (selKf) {
      this.engine.editKeyframe(trackId, selKf.id, { value: bag });
    } else if (atPh) {
      this.engine.editKeyframe(trackId, atPh.id, { value: bag });
    } else {
      this.fxEngine.applyLiveBag(ch.fid, engAttr);
      return true;
    }
    this.apply(this.engine.playheadSec);
    return true;
  }

  /** Write live patch by fid (no track required). */
  writeLiveForFid(fid, patch) {
    const live = this.liveBagForFid(fid) || emptyFixtureKeyValue();
    const bag = asFixtureKeyValue({ ...live, ...patch }, live);
    this.fxEngine.applyLiveBag(Number(fid), fixtureBagToEngineAttr(bag));
    return true;
  }

  addKeyAtPlayhead(trackId, opt = {}) {
    return this.writeBagOnSelectedKey(trackId, {}, { forceKey: true, ...opt });
  }

  addKeysForFids(fids, patch = {}) {
    const list = [...fids];
    const refs = [];
    for (const fid of list) {
      const ch = this.ensureTrackForFid(fid);
      if (!ch) continue;
      if (Object.keys(patch).length) {
        this.writeBagOnSelectedKey(ch.trackId, patch, { forceKey: true });
      } else {
        this.addKeyAtPlayhead(ch.trackId);
      }
      const at = this.engine.getTrack(ch.trackId)?.keys.findAtTime(this.engine.playheadSec);
      if (at) refs.push({ trackId: ch.trackId, keyId: at.id });
    }
    // Keep all newly written keys selected (each addKeyframe alone leaves only the last)
    if (refs.length) this.engine.selectKeyframes(refs);
    return refs.length;
  }

  navigateSelectionKeys(dir, fids) {
    const times = new Set();
    const ph = this.engine.playheadSec;
    for (const fid of fids) {
      const fx = this.findByFid(fid);
      if (!fx) continue;
      const track = this.engine.getTrack(fx.trackId);
      if (!track) continue;
      for (const k of track.keys.list()) {
        if (dir === 'prev' && k.timeSec < ph - 1e-6) times.add(k.timeSec);
        if (dir === 'next' && k.timeSec > ph + 1e-6) times.add(k.timeSec);
      }
    }
    if (!times.size) return false;
    const sorted = [...times].sort((a, b) => a - b);
    this.engine.playheadSec = dir === 'prev' ? sorted[sorted.length - 1] : sorted[0];
    this.engine.emit('playhead');
    this.apply(this.engine.playheadSec);
    this.selectKeysAtPlayheadForFids(fids);
    return true;
  }

  /**
   * Select timeline tracks + keys @ playhead for panel-selected fixtures.
   * @param {Iterable<number>} fids
   */
  selectKeysAtPlayheadForFids(fids) {
    const trackIds = [];
    const keyRefs = [];
    const ph = this.engine.playheadSec;
    for (const fid of fids) {
      const fx = this.findByFid(fid);
      if (!fx) continue;
      trackIds.push(fx.trackId);
      const track = this.engine.getTrack(fx.trackId);
      if (!track) continue;
      const at = track.keys.findAtTime(ph);
      if (at) keyRefs.push({ trackId: fx.trackId, keyId: at.id });
    }
    if (keyRefs.length) {
      this.engine.selectKeyframes(keyRefs);
    } else if (trackIds.length) {
      this.engine.selectTracks(trackIds);
    }
    return keyRefs.length;
  }

  deleteKeysAtPlayhead(fids) {
    // Prefer multi-selected keys if they belong to these fids
    const selected = this.engine.listSelectedKeys?.() || [];
    const fidSet = new Set([...fids].map(Number));
    const fromSel = selected.filter((r) => {
      const ch = this.findByTrackId(r.trackId);
      return ch && fidSet.has(ch.fid);
    });
    if (fromSel.length) {
      let n = 0;
      for (const ref of fromSel) {
        if (this.engine.removeKeyframe(ref.trackId, ref.keyId)) n += 1;
      }
      if (n) this.apply(this.engine.playheadSec);
      return n;
    }
    let n = 0;
    for (const fid of fids) {
      const fx = this.findByFid(fid);
      if (!fx) continue;
      const track = this.engine.getTrack(fx.trackId);
      if (!track) continue;
      const atPh = track.keys.findAtTime(this.engine.playheadSec);
      if (!atPh) continue;
      this.engine.removeKeyframe(fx.trackId, atPh.id);
      n += 1;
    }
    if (n) this.apply(this.engine.playheadSec);
    return n;
  }

  /** @param {number} timeSec */
  apply(timeSec) {
    if (this.suspendApply || !this.fxEngine.built) return;
    this.fxEngine.isPlaying = !!this.engine.playing;
    this.fxEngine.clearAllTimelineBags();
    for (const ch of this.channels.values()) {
      const track = this.engine.getTrack(ch.trackId);
      if (!track) {
        this.channels.delete(ch.fid);
        continue;
      }
      if (track.hidden) {
        this.fxEngine.setTimelineBag(ch.fid, { dim: 0 });
        continue;
      }
      if (!track.keys.length) continue;
      const fallback = engineAttrToFixtureBag(this.fxEngine.captureAttr(ch.fid));
      const bag = sampleFixtureBag(track.keys, timeSec, fallback);
      this.fxEngine.setTimelineBag(ch.fid, fixtureBagToEngineAttr(bag));
    }
    this.fxEngine.update();
  }
}

export { ROW_DEFS };
