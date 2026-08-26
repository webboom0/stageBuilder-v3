import { CommandStack } from './CommandStack.js';
import { DEFAULT_DURATION_SEC, DEFAULT_FPS, DURATION_MODE } from './types.js';
import {
  cmdAddKeyframe,
  cmdRemoveKeyframe,
  cmdMoveKeyframe,
  cmdEditKeyframe,
  cmdSetDuration,
} from './KeyframeCommands.js';
import { Track } from './Track.js';

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
    this.durationMode = DURATION_MODE.SCALE_ALL;

    /** @type {Map<string, Track>} */
    this.tracks = new Map();
    /** @type {Map<string, { id: string, name: string, collapsed: boolean }>} */
    this.folders = new Map();
    this.commands = new CommandStack();
    this.selectedKeyframeId = null;
    this.selectedTrackId = null;

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
   * @param {string} id
   * @param {{ history?: boolean }} [opt] history:false when scene object was disposed (no safe undo)
   * @returns {boolean}
   */
  removeTrack(id, opt = {}) {
    const track = this.tracks.get(id);
    if (!track) return false;
    const snap = track.snapshot();
    this.tracks.delete(id);
    if (this.selectedTrackId === id) this.clearSelection();
    if (opt.history !== false) {
      this.commands.push({
        label: 'Remove track',
        undo: () => {
          this.tracks.set(id, Track.fromSnapshot(snap));
        },
        redo: () => {
          this.tracks.delete(id);
          if (this.selectedTrackId === id) this.clearSelection();
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

  selectKeyframe(trackId, keyframeId) {
    this.selectedTrackId = trackId;
    this.selectedKeyframeId = keyframeId;
    this.emit('selection');
  }

  clearSelection() {
    this.selectedTrackId = null;
    this.selectedKeyframeId = null;
    this.emit('selection');
  }

  undo() {
    const ok = this.commands.undo();
    if (ok) this.emit('keys');
    return ok;
  }

  redo() {
    const ok = this.commands.redo();
    if (ok) this.emit('keys');
    return ok;
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this._lastTick = performance.now();
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
