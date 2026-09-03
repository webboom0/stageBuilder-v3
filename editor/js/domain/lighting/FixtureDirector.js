import { INTERPOLATION } from '../timeline/types.js';
import { keyframeTimeEps, snapKeyframeTimeSec } from '../timeline/KeyframeStore.js';
import { FixtureEngine } from './FixtureEngine.js';
import { ensureHouseStageLights } from './houseStageLights.js';
import {
  fixtureTrackGroup,
  fixtureAiTrackGroup,
  isAiFollowGroup,
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
    /** @type {Map<number, { fid: number, trackId: string, name: string, grp: string, aiTrackId?: string|null }>} */
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
      const isAi = isAiFollowGroup(track.group);
      let ch = this.channels.get(fid);
      if (!ch) {
        ch = { fid, trackId: '', name: '', grp: f.grp, aiTrackId: null };
        this.channels.set(fid, ch);
      }
      if (isAi) {
        ch.aiTrackId = track.id;
      } else {
        ch.trackId = track.id;
        ch.name = track.name;
      }
    }
    // Remove entries that have neither manual nor AI track
    for (const [fid, ch] of this.channels) {
      if (!ch.trackId && !ch.aiTrackId) this.channels.delete(fid);
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
    if (ch && ch.trackId && this.engine.getTrack(ch.trackId)) return ch;

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
    if (!ch) {
      ch = { fid: n, trackId: track.id, name: track.name || trackName, grp: f.grp, aiTrackId: null };
    } else {
      ch.trackId = track.id;
      ch.name = track.name || trackName;
    }
    this.channels.set(n, ch);
    return ch;
  }

  /**
   * Create or get the AI follow track for a fixture.
   * @param {number} fid
   */
  ensureAiTrackForFid(fid) {
    this.ensureRig();
    const n = Number(fid);
    const f = this.fxEngine.getFixture(n);
    if (!f) return null;

    let ch = this.channels.get(n);
    if (ch?.aiTrackId && this.engine.getTrack(ch.aiTrackId)) return ch;

    const group = fixtureAiTrackGroup(n);
    let track = this.engine.listTracks().find((t) => t.group === group && t.kind === 'light');
    const trackName = `FX ${n} · ${f.short || f.grp}`;
    if (!track) {
      track = this.engine.addTrack({
        name: trackName,
        kind: 'light',
        group,
        section: 'light',
        color: TRACK_COLORS[f.grp] || '#8899aa',
        source: 'ai-follow',
        locked: true,
      });
      this.engine.emit('tracks');
    }
    if (!ch) {
      ch = { fid: n, trackId: '', name: '', grp: f.grp, aiTrackId: track.id };
    } else {
      ch.aiTrackId = track.id;
    }
    this.channels.set(n, ch);
    return ch;
  }

  /** Get the AI track for a fid (if exists). */
  getAiTrackForFid(fid) {
    const ch = this.channels.get(Number(fid));
    if (!ch?.aiTrackId) return null;
    return this.engine.getTrack(ch.aiTrackId) || null;
  }

  /**
   * True when the fixture is driven only by an AI track (no manual track yet).
   * @param {number} fid
   */
  isAiOnly(fid) {
    const ch = this.channels.get(Number(fid));
    return !!(ch?.aiTrackId && !ch.trackId);
  }

  /**
   * Turn an AI track into a plain manual track in place — keys stay, the prompt
   * link is dropped and the row unlocks. One fixture keeps one track.
   * @param {string} aiTrackId
   * @returns {{ ok: true, trackId: string, fid: number } | { ok: false, error: string }}
   */
  convertAiTrackToManual(aiTrackId) {
    const track = this.engine.getTrack(aiTrackId);
    if (!track || track.source !== 'ai-follow') {
      return { ok: false, error: 'AI 트랙이 아닙니다.' };
    }
    const fid = parseFixtureFidFromGroup(track.group);
    if (fid == null) return { ok: false, error: 'Fixture를 찾을 수 없습니다.' };

    const ch = this.channels.get(fid);
    if (ch?.trackId && this.engine.getTrack(ch.trackId)) {
      return {
        ok: false,
        error: `FX ${fid}에 이미 수동 트랙이 있습니다. 둘 중 하나를 먼저 삭제하세요.`,
      };
    }

    const f = this.fxEngine.getFixture(fid);
    track.group = fixtureTrackGroup(fid);
    track.source = null;
    track.fixtureFollowPrompt = null;
    track.locked = false;
    track.name = `FX ${fid} · ${f?.short || f?.grp || ''}`.trim();

    this.channels.set(fid, {
      fid,
      trackId: track.id,
      name: track.name,
      grp: f?.grp || 'mh',
      aiTrackId: null,
    });

    this.engine.emit('tracks');
    this.apply(this.engine.playheadSec);
    return { ok: true, trackId: track.id, fid };
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
    const chData = this.channels.get(ch.fid);
    if (chData) {
      const isAi = chData.aiTrackId === trackId;
      if (isAi) {
        chData.aiTrackId = null;
      } else {
        chData.trackId = '';
      }
      // Remove channel entry only if both tracks gone
      if (!chData.trackId && !chData.aiTrackId) {
        this.channels.delete(ch.fid);
      }
    }
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
      // Effective track for reads/selection — AI layer when no manual layer exists yet
      trackId: ch.trackId || ch.aiTrackId || '',
      manualTrackId: ch.trackId || null,
      aiTrackId: ch.aiTrackId || null,
      hasManual: !!ch.trackId,
      name: ch.name,
      grp: ch.grp,
      channel: `fx_${ch.fid}`,
    };
  }

  /** Track ids for a fixture, AI layer first. */
  trackIdsForFid(fid) {
    const ch = this.channels.get(Number(fid));
    if (!ch) return [];
    return [ch.aiTrackId, ch.trackId].filter(Boolean);
  }

  /** Remove every layer (AI + manual) for a fixture. */
  removeAllTracksForFid(fid, opt = {}) {
    let n = 0;
    for (const id of this.trackIdsForFid(fid)) {
      if (this.removeTrackById(id, opt)) n += 1;
    }
    return n;
  }

  /** Fixtures that already have timeline tracks. */
  list() {
    return [...this.channels.values()];
  }

  /** All rig fixtures (with or without tracks) for the sheet UI. */
  listRigFixtures() {
    this.ensureRig();
    return this.fxEngine.getFixtures().map((f) => {
      const ch = this.channels.get(f.fid);
      return {
        fid: f.fid,
        name: f.name,
        grp: f.grp,
        short: f.short,
        trackId: ch?.trackId || null,
        aiTrackId: ch?.aiTrackId || null,
        hasTrack: !!(ch?.trackId || ch?.aiTrackId),
      };
    });
  }

  /** @param {string} trackId */
  findByTrackId(trackId) {
    for (const ch of this.channels.values()) {
      if (ch.trackId === trackId || ch.aiTrackId === trackId) {
        return {
          kind: 'fixture',
          fid: ch.fid,
          trackId: ch.trackId || ch.aiTrackId,
          name: ch.name,
          grp: ch.grp,
          channel: `fx_${ch.fid}`,
          isAiTrack: ch.aiTrackId === trackId,
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
        isAiTrack: isAiFollowGroup(track.group),
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

    // Manual edits never touch the AI layer — they land on the manual override track.
    // Without one yet, a slider move stays live (programmer) until the user commits a key.
    let targetId = this.channels.get(ch.fid)?.trackId || '';
    if (!targetId || targetId !== trackId) {
      if (!targetId && !opt.forceKey) {
        return this.writeLiveForFid(ch.fid, patch);
      }
      targetId = this.ensureTrackForFid(ch.fid)?.trackId || '';
      if (!targetId) return false;
    }
    trackId = targetId;

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
    const fxRow = this.fxEngine.getFixture(ch.fid);
    if (fxRow) fxRow.prog = {};
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

  /**
   * Patch every key on selected fixture tracks (e.g. Dim/Zoom/Focus/Color after AI bake).
   * Callers should omit pan/tilt so AI follow aims stay intact.
   * @param {Iterable<number>} fids
   * @param {Partial<import('./fixtureKeyValue.js').FixtureKeyValue>} patch
   * @returns {number} keys updated
   */
  patchAllKeysForFids(fids, patch) {
    if (!patch || !Object.keys(patch).length) return 0;
    let n = 0;
    for (const fid of fids) {
      const chData = this.channels.get(Number(fid));
      if (!chData && !this.ensureTrackForFid(fid)) continue;
      const ch = this.channels.get(Number(fid));
      // Both layers get the attribute patch — AI aim (pan/tilt) is left to the caller
      for (const id of [ch.aiTrackId, ch.trackId]) {
        const track = id ? this.engine.getTrack(id) : null;
        if (!track) continue;
        const isAi = track.source === 'ai-follow';
        if (track.locked && !isAi) continue;
        if (isAi) track.locked = false;
        for (const kf of track.keys.list()) {
          const base = asFixtureKeyValue(kf.value, emptyFixtureKeyValue());
          const bag = asFixtureKeyValue({ ...base, ...patch }, base);
          this.engine.editKeyframe(id, kf.id, { value: bag });
          n += 1;
        }
        if (isAi) track.locked = true;
      }
      const f = this.fxEngine.getFixture(Number(fid));
      if (f) {
        f.prog = {};
        // so panel/live also match without waiting for next sample
        if (patch.zoom != null) f.attr.zoom = patch.zoom;
        if (patch.focus != null) f.attr.focus = patch.focus;
        if (patch.pan != null) f.attr.pan = patch.pan;
        if (patch.tilt != null) f.attr.tilt = patch.tilt;
        if (patch.dim != null) f.attr.dim = Math.max(0, Math.min(100, patch.dim * 100));
        if (patch.color) {
          const rgb = fixtureBagToEngineAttr({ ...emptyFixtureKeyValue(), color: patch.color });
          f.attr.r = rgb.r;
          f.attr.g = rgb.g;
          f.attr.b = rgb.b;
        }
      }
    }
    this.apply(this.engine.playheadSec);
    return n;
  }

  navigateSelectionKeys(dir, fids) {
    const times = new Set();
    const ph = this.engine.playheadSec;
    for (const fid of fids) {
      for (const id of this.trackIdsForFid(fid)) {
        const track = this.engine.getTrack(id);
        if (!track) continue;
        for (const k of track.keys.list()) {
          if (dir === 'prev' && k.timeSec < ph - 1e-6) times.add(k.timeSec);
          if (dir === 'next' && k.timeSec > ph + 1e-6) times.add(k.timeSec);
        }
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
      for (const id of this.trackIdsForFid(fid)) {
        const track = this.engine.getTrack(id);
        if (!track) continue;
        trackIds.push(id);
        const at = track.keys.findAtTime(ph);
        if (at) keyRefs.push({ trackId: id, keyId: at.id });
      }
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
      // AI keys are not deletable here — re-bake or delete the AI track instead
      const manualId = this.channels.get(Number(fid))?.trackId;
      const track = manualId ? this.engine.getTrack(manualId) : null;
      if (!track) continue;
      const atPh = track.keys.findAtTime(this.engine.playheadSec);
      if (!atPh) continue;
      this.engine.removeKeyframe(manualId, atPh.id);
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
      const manualTrack = ch.trackId ? this.engine.getTrack(ch.trackId) : null;
      const aiTrack = ch.aiTrackId ? this.engine.getTrack(ch.aiTrackId) : null;
      if (!manualTrack && !aiTrack) {
        this.channels.delete(ch.fid);
        continue;
      }
      // Every existing layer hidden → blackout
      const manualLive = manualTrack && !manualTrack.hidden;
      const aiLive = aiTrack && !aiTrack.hidden;
      if (!manualLive && !aiLive) {
        this.fxEngine.setTimelineBag(ch.fid, { dim: 0 });
        continue;
      }
      const fallback = engineAttrToFixtureBag(this.fxEngine.captureAttr(ch.fid));
      // Manual layer wins outright once it holds any key; the AI layer is the base
      // until then. Hiding a layer (eye) switches between the two versions.
      const driver = manualLive && manualTrack.keys.length ? manualTrack
        : (aiLive && aiTrack.keys.length ? aiTrack : null);
      if (!driver) continue;
      const bag = sampleFixtureBag(driver.keys, timeSec, fallback);
      if (!bag) continue;
      this.fxEngine.setTimelineBag(ch.fid, fixtureBagToEngineAttr(bag));
    }
    this.fxEngine.update();
  }
}

export { ROW_DEFS };
