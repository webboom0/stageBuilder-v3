import { CommandStack } from './CommandStack.js';
import { DEFAULT_DURATION_SEC, DEFAULT_FPS, DURATION_MODE } from './types.js';
import {
  cmdAddKeyframe,
  cmdRemoveKeyframe,
  cmdMoveKeyframe,
  cmdEditKeyframe,
  cmdSetDuration,
} from './KeyframeCommands.js';
import { Track, syncTrackIdSeqFromSnapshots } from './Track.js';
import { syncKeyframeIdSeqFromSnapshots } from './KeyframeStore.js';

/**
 * TimelineEngine — duration, fps, playhead, zoom/pan, tracks, commands.
 * All key times are absolute seconds (P2-5).
 */
export class TimelineEngine {
  /**
   * @param {{ durationSec?: number, fps?: number }} [opts]
   */
  constructor(opts = {}) {
    this.durationSec = opts.durationSec ?? DEFAULT_DURATION_SEC;
    this.fps = opts.fps ?? DEFAULT_FPS;
    this.playheadSec = 0;
    this.playing = false;
    this.pxPerSec = 8;
    this.scrollSec = 0;
    this.durationMode = DURATION_MODE.CLAMP_END;
    /** Skip per-keyframe undo steps while lighting panel gesture batches edits */
    this._suspendHistory = false;

    /** @type {Map<string, Track>} */
    this.tracks = new Map();
    /** @type {Map<string, { id: string, name: string, collapsed: boolean }>} */
    this.folders = new Map();
    this.commands = new CommandStack();
    this.selectedKeyframeId = null;
    this.selectedTrackId = null;
    /** @type {Array<{ trackId: string, keyId: string }>} */
    this.selectedKeys = [];
    /** @type {Set<string>} */
    this.selectedTrackIds = new Set();

    /** Last explicit key-edit target per timeline section (survives viewport / section switches). */
    /** @type {Record<string, string | null>} */
    this.keyTargetBySection = { motion: null, stage: null, light: null, audio: null };
    /** @type {string | null} */
    this.recentKeyTargetTrackId = null;

    /** @type {Set<(ev: { type: string }) => void>} */
    this._listeners = new Set();

    this._lastTick = 0;
    this._raf = 0;
  }

  /** @param {(ev: { type: string }) => void} fn */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  emit(type = 'change') {
    const ev = { type };
    this._listeners.forEach((fn) => fn(ev));
  }

  /**
   * @param {{ name: string, kind?: import('./types.js').TrackKind, group?: string, id?: string }} opts
   */
  addTrack(opts) {
    const track = new Track(opts);
    this.tracks.set(track.id, track);
    this.emit('tracks');
    return track;
  }

  /** @param {string} id */
  getTrack(id) {
    return this.tracks.get(id) ?? null;
  }

  listTracks() {
    return [...this.tracks.values()];
  }

  /**
   * @param {{ id?: string, name: string, collapsed?: boolean }} opts
   */
  ensureFolder(opts) {
    const id = opts.id ?? `folder_${this.folders.size + 1}_${Date.now().toString(36)}`;
    const existing = this.folders.get(id);
    if (existing) {
      if (opts.name && existing.name !== opts.name) {
        existing.name = opts.name;
        this.emit('tracks');
      }
      return existing;
    }
    const folder = {
      id,
      name: opts.name,
      collapsed: opts.collapsed ?? false,
    };
    this.folders.set(id, folder);
    this.emit('tracks');
    return folder;
  }

  /**
   * @param {string} folderId
   * @param {string} name
   */
  renameFolder(folderId, name) {
    const f = this.folders.get(folderId);
    if (!f) return false;
    const next = String(name || '').trim();
    if (!next || f.name === next) return false;
    f.name = next;
    this.emit('tracks');
    return true;
  }

  /** @param {string} folderId @param {boolean} collapsed */
  setFolderCollapsed(folderId, collapsed) {
    const f = this.folders.get(folderId);
    if (!f) return;
    f.collapsed = !!collapsed;
    this.emit('tracks');
  }

  listFolders() {
    return [...this.folders.values()];
  }

  /**
   * Remove an empty group folder from the timeline UI.
   * @param {string} folderId
   * @returns {boolean}
   */
  removeFolder(folderId) {
    if (!this.folders.has(folderId)) return false;
    this.folders.delete(folderId);
    this.emit('tracks');
    return true;
  }

  /**
   * @param {string} id
   * @param {{ history?: boolean }} [opt] history:false when scene object was disposed (no safe undo)
   * @returns {boolean}
   */
  removeTrack(id, opt = {}) {
    const track = this.tracks.get(id);
    if (!track) return false;
    const snap = track.snapshot();
    this.tracks.delete(id);
    this._pruneSelectionForMissing();
    if (opt.history !== false) {
      this.commands.push({
        label: 'Remove track',
        undo: () => {
          this.tracks.set(id, Track.fromSnapshot(snap));
        },
        redo: () => {
          this.tracks.delete(id);
          this._pruneSelectionForMissing();
        },
      });
    }
    this.emit('tracks');
    return true;
  }

  /** Unified keyframe API (P2-3) */
  addKeyframe(trackId, timeSec, value, interpolation) {
    const result = cmdAddKeyframe(this, { trackId, timeSec, value, interpolation });
    this.emit('keys');
    return result;
  }

  removeKeyframe(trackId, keyframeId) {
    const result = cmdRemoveKeyframe(this, { trackId, keyframeId });
    this.emit('keys');
    return result;
  }

  moveKeyframe(trackId, keyframeId, timeSec) {
    const result = cmdMoveKeyframe(this, { trackId, keyframeId, timeSec });
    this.emit('keys');
    return result;
  }

  editKeyframe(trackId, keyframeId, patch) {
    const result = cmdEditKeyframe(this, { trackId, keyframeId, patch });
    this.emit('keys');
    return result;
  }

  /**
   * @param {number} durationSec
   * @param {'scaleAll' | 'clampEnd'} [mode]
   */
  setDuration(durationSec, mode = this.durationMode) {
    cmdSetDuration(this, { durationSec, mode });
    this.emit('duration');
  }

  setDurationMode(mode) {
    this.durationMode = mode === DURATION_MODE.CLAMP_END
      ? DURATION_MODE.CLAMP_END
      : DURATION_MODE.SCALE_ALL;
    this.emit('duration');
  }

  setPlayhead(sec) {
    this.playheadSec = clamp(sec, 0, this.durationSec);
    this.emit('playhead');
  }

  setZoom(pxPerSec) {
    this.pxPerSec = clamp(pxPerSec, 2, 80);
    this.emit('view');
  }

  setScrollSec(sec) {
    this.scrollSec = Math.max(0, sec);
    this.emit('view');
  }

  /** @param {string} trackId */
  getTrackSection(trackId) {
    const t = this.getTrack(trackId);
    if (!t) return null;
    if (t.section) return t.section;
    if (t.kind === 'audio') return 'audio';
    if (t.kind === 'light') return 'light';
    return 'motion';
  }

  /** @param {string} trackId */
  _touchKeyTarget(trackId) {
    if (!trackId || !this.getTrack(trackId)) return;
    const section = this.getTrackSection(trackId);
    if (!section) return;
    this.keyTargetBySection[section] = trackId;
    this.recentKeyTargetTrackId = trackId;
  }

  /** @param {string} section */
  getKeyTargetTrackId(section) {
    const id = this.keyTargetBySection[section];
    return id && this.getTrack(id) ? id : null;
  }

  getRecentKeyTargetTrackId() {
    const id = this.recentKeyTargetTrackId;
    return id && this.getTrack(id) ? id : null;
  }

  _resetKeyTargets() {
    this.keyTargetBySection = { motion: null, stage: null, light: null, audio: null };
    this.recentKeyTargetTrackId = null;
  }

  /** @param {string} section */
  _purgeSelectionExceptSection(section) {
    this.selectedKeys = this.selectedKeys.filter(
      (r) => this.getTrackSection(r.trackId) === section,
    );
    for (const id of [...this.selectedTrackIds]) {
      if (this.getTrackSection(id) !== section) this.selectedTrackIds.delete(id);
    }
    if (this.selectedTrackId && this.getTrackSection(this.selectedTrackId) !== section) {
      this.selectedTrackId = null;
      this.selectedKeyframeId = null;
    }
  }

  /**
   * @param {string} trackId
   * @param {string} keyframeId
   * @param {{ updateKeyTarget?: boolean }} [opt]
   */
  selectKeyframe(trackId, keyframeId, opt = {}) {
    const section = trackId ? this.getTrackSection(trackId) : null;
    if (section) this._purgeSelectionExceptSection(section);
    this.selectedTrackId = trackId || null;
    this.selectedKeyframeId = keyframeId || null;
    this.selectedKeys = trackId && keyframeId
      ? [{ trackId, keyId: keyframeId }]
      : [];
    this.selectedTrackIds = new Set(trackId ? [trackId] : []);
    if (opt.updateKeyTarget !== false) this._touchKeyTarget(trackId);
    this.emit('selection');
  }

  /**
   * Multi key selection. Primary = refs[0] (panels / properties).
   * @param {Array<{ trackId: string, keyId: string }>} refs
   */
  selectKeyframes(refs) {
    const cleaned = [];
    const seen = new Set();
    for (const r of refs || []) {
      if (!r?.trackId || !r?.keyId) continue;
      const track = this.getTrack(r.trackId);
      if (!track?.keys.get(r.keyId)) continue;
      const k = `${r.trackId}\0${r.keyId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      cleaned.push({ trackId: r.trackId, keyId: r.keyId });
    }
    const section = cleaned[0] ? this.getTrackSection(cleaned[0].trackId) : null;
    if (section) this._purgeSelectionExceptSection(section);
    const filtered = section
      ? cleaned.filter((r) => this.getTrackSection(r.trackId) === section)
      : cleaned;
    this.selectedKeys = filtered;
    const primary = filtered[0] || null;
    this.selectedTrackId = primary?.trackId ?? null;
    this.selectedKeyframeId = primary?.keyId ?? null;
    this.selectedTrackIds = new Set(filtered.map((r) => r.trackId));
    if (filtered[0]) this._touchKeyTarget(filtered[0].trackId);
    this.emit('selection');
  }

  /**
   * Highlight tracks (e.g. fixture panel multi-select) without requiring keys.
   * @param {Iterable<string>} trackIds
   * @param {{ keepKeys?: boolean, updateKeyTarget?: boolean }} [opt]
   */
  selectTracks(trackIds, opt = {}) {
    const ids = [...new Set([...(trackIds || [])].filter(Boolean))].filter((id) => this.getTrack(id));
    const section = ids[0] ? this.getTrackSection(ids[0]) : null;
    if (section) this._purgeSelectionExceptSection(section);
    const filtered = section
      ? ids.filter((id) => this.getTrackSection(id) === section)
      : ids;
    this.selectedTrackIds = new Set(filtered);
    this.selectedTrackId = filtered[0] ?? null;
    if (!opt.keepKeys) {
      this.selectedKeyframeId = null;
      this.selectedKeys = [];
    } else {
      this.selectedKeys = this.selectedKeys.filter(
        (r) => this.selectedTrackIds.has(r.trackId)
          && (!section || this.getTrackSection(r.trackId) === section),
      );
      if (this.selectedKeyframeId && !this.selectedKeys.some((r) => r.keyId === this.selectedKeyframeId)) {
        const p = this.selectedKeys[0];
        this.selectedTrackId = p?.trackId ?? this.selectedTrackId;
        this.selectedKeyframeId = p?.keyId ?? null;
      }
    }
    if (opt.updateKeyTarget !== false && filtered[0]) {
      this._touchKeyTarget(filtered[0]);
    }
    this.emit('selection');
  }

  /** @param {string} trackId @param {string} keyId */
  isKeySelected(trackId, keyId) {
    if (this.selectedTrackId === trackId && this.selectedKeyframeId === keyId) return true;
    return this.selectedKeys.some((r) => r.trackId === trackId && r.keyId === keyId);
  }

  /** @param {string} trackId */
  isTrackSelected(trackId) {
    return this.selectedTrackId === trackId || this.selectedTrackIds.has(trackId);
  }

  listSelectedKeys() {
    return this.selectedKeys.slice();
  }

  clearSelection() {
    this.selectedTrackId = null;
    this.selectedKeyframeId = null;
    this.selectedKeys = [];
    this.selectedTrackIds.clear();
    this.emit('selection');
  }

  /** Drop selection refs that no longer exist. */
  _pruneSelectionForMissing() {
    this.selectedKeys = this.selectedKeys.filter((r) => {
      const t = this.getTrack(r.trackId);
      return t && t.keys.get(r.keyId);
    });
    for (const id of [...this.selectedTrackIds]) {
      if (!this.getTrack(id)) this.selectedTrackIds.delete(id);
    }
    if (this.selectedTrackId && !this.getTrack(this.selectedTrackId)) {
      this.selectedTrackId = null;
      this.selectedKeyframeId = null;
    }
    if (this.selectedKeyframeId && this.selectedTrackId) {
      const t = this.getTrack(this.selectedTrackId);
      if (!t?.keys.get(this.selectedKeyframeId)) {
        this.selectedKeyframeId = null;
      }
    }
    if (!this.selectedKeyframeId && this.selectedKeys.length) {
      this.selectedTrackId = this.selectedKeys[0].trackId;
      this.selectedKeyframeId = this.selectedKeys[0].keyId;
    } else if (!this.selectedTrackId && this.selectedTrackIds.size) {
      this.selectedTrackId = [...this.selectedTrackIds][0];
    }
  }

  undo() {
    const ok = this.commands.undo();
    if (ok) {
      this.emit('keys');
      this.emit('tracks');
      this.emit('selection');
    }
    return ok;
  }

  redo() {
    const ok = this.commands.redo();
    if (ok) {
      this.emit('keys');
      this.emit('tracks');
      this.emit('selection');
    }
    return ok;
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this._lastTick = performance.now();
    this.emit('playhead');
    const loop = (now) => {
      if (!this.playing) return;
      const dt = (now - this._lastTick) / 1000;
      this._lastTick = now;
      let next = this.playheadSec + dt;
      if (next >= this.durationSec) {
        next = this.durationSec;
        this.playheadSec = next;
        this.playing = false;
        this.emit('playhead');
        this.emit('play');
        return;
      }
      this.playheadSec = next;
      this.emit('playhead');
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    this.emit('play');
  }

  pause() {
    this.playing = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this.emit('play');
  }

  togglePlay() {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Clear timeline for scene switch / project load (no undo). */
  resetForSceneLoad() {
    this.pause();
    this.tracks.clear();
    this.folders.clear();
    this.commands.reset();
    this.clearSelection();
    this._resetKeyTargets();
    this.playheadSec = 0;
    this.emit('tracks');
    this.emit('keys');
  }

  /**
   * @param {{
   *   durationSec?: number,
   *   durationMode?: string,
   *   playheadSec?: number,
   *   timelinePxPerSec?: number,
   *   tracks?: ReturnType<Track['snapshot']>[],
   *   folders?: Array<{ id: string, name: string, collapsed: boolean }>,
   * }} data
   */
  loadFromSceneData(data) {
    this.resetForSceneLoad();
    if (Number.isFinite(data.durationSec)) this.durationSec = data.durationSec;
    if (data.durationMode) this.durationMode = data.durationMode;
    if (Number.isFinite(data.playheadSec)) this.playheadSec = data.playheadSec;
    if (Number.isFinite(data.timelinePxPerSec)) {
      this.pxPerSec = clamp(data.timelinePxPerSec, 2, 80);
    } else {
      this.pxPerSec = 8;
    }
    for (const f of data.folders || []) {
      this.folders.set(f.id, {
        id: f.id,
        name: f.name,
        collapsed: !!f.collapsed,
      });
    }
    for (const snap of data.tracks || []) {
      this.tracks.set(snap.id, Track.fromSnapshot(snap));
    }
    syncTrackIdSeqFromSnapshots(data.tracks || []);
    syncKeyframeIdSeqFromSnapshots(data.tracks || []);
    this.emit('tracks');
    this.emit('duration');
    this.emit('playhead');
    this.emit('view');
  }

  /** Seed demo tracks for Phase 2 QA */
  seedDemoTracks() {
    if (this.tracks.size) return;
    const opacity = this.addTrack({ name: 'Demo · opacity', kind: 'scalar', group: 'demo', section: 'motion' });
    const visible = this.addTrack({ name: 'Demo · visible', kind: 'bool', group: 'demo', section: 'motion' });
    this.addKeyframe(opacity.id, 0, 0);
    this.addKeyframe(opacity.id, 2, 1);
    this.addKeyframe(opacity.id, 10, 1);
    this.addKeyframe(opacity.id, 12, 0);
    this.addKeyframe(opacity.id, 170, 0.5); // near end — clampEnd QA
    this.addKeyframe(visible.id, 0, true);
    this.addKeyframe(visible.id, 12, false);
    // Clear undo stack so seed isn't undoable noise
    this.commands = new CommandStack();
    this.emit('tracks');
  }
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
