import { Track } from '../timeline/Track.js';
import { DEFAULT_CLIP_VOLUME, MIN_CLIP_SEC } from './types.js';
import {
  assertServerAudioPath,
  canSplitClipAt,
  probeAudioDurationSec,
  resolveAudioUrl,
  setWaveformSuspended,
} from './audioPaths.js';

/**
 * AudioDirector — multi-track clips, trim/split, playback sync.
 * Reference UX: stageBuilder_v2 AudioTimeline (not v3 LightTimeline).
 */
export class AudioDirector {
  /**
   * @param {{ engine: import('../timeline/TimelineEngine.js').TimelineEngine }} opts
   */
  constructor(opts) {
    this.engine = opts.engine;
    this.masterVolume = 1;
    /** @type {string | null} */
    this.selectedClipId = null;
    /** @type {string | null} */
    this.selectedTrackId = null;
    /** @type {string | null} Assets + 클립이 들어갈 타겟 트랙 */
    this.insertTrackId = null;
    /** @type {Map<string, HTMLAudioElement>} */
    this._elements = new Map();
    /** @type {Set<string>} */
    this._clipSeekDirty = new Set();
    /** @type {Map<string, { active: boolean }>} */
    this._playState = new Map();
    this._lastPlayheadSec = 0;
  }

  /** @param {string} trackId */
  findByTrackId(trackId) {
    const track = this.engine.getTrack(trackId);
    if (!track || track.kind !== 'audio') return null;
    return { trackId: track.id, name: track.name, clips: track.clips.list() };
  }

  listAudioTracks() {
    return this.engine.listTracks().filter((t) => t.kind === 'audio');
  }

  /**
   * 빈 오디오 트랙 추가 (DAW 스타일 멀티트랙).
   * @param {string} [name]
   */
  createTrack(name) {
    const n = this.listAudioTracks().length + 1;
    const track = this.engine.addTrack({
      name: name || `Audio ${n}`,
      kind: 'audio',
      group: 'audio',
      section: 'audio',
      color: '#4a7ab5',
    });
    this.selectTrackTarget(track.id);
    this._emitClips();
    return track;
  }

  /** @param {string} trackId */
  selectTrackTarget(trackId) {
    const track = this.engine.getTrack(trackId);
    if (!track || track.kind !== 'audio') return;
    this.insertTrackId = trackId;
    this.selectedTrackId = trackId;
    this.selectedClipId = null;
    this.engine.selectTracks([trackId]);
    this._emitClips();
  }

  /**
   * Assets + — 항상 새 오디오 트랙을 만들고 클립을 배치합니다.
   * @param {{ name: string, path: string, filename?: string, atSec?: number, trackId?: string }} entry
   */
  async addFromAsset(entry) {
    const n = this.listAudioTracks().length + 1;
    const trackName = entry.name || entry.filename || `Audio ${n}`;
    const track = this.createTrack(trackName);
    try {
      return await this.addClipToTrack(track.id, entry);
    } catch (err) {
      this.removeTrack(track.id);
      throw err;
    }
  }

  /**
   * @param {import('../timeline/Track.js').Track} track
   * @param {number} preferredStartSec
   * @param {number} sourceDuration
   * @returns {{ timelineStart: number, clipDuration: number } | null}
   */
  _findClipPlacement(track, preferredStartSec, sourceDuration) {
    const timelineDuration = this.engine.durationSec;
    let start = Math.max(0, Math.min(preferredStartSec, timelineDuration));
    const clips = [...track.clips.list()].sort(
      (a, b) => a.timelineStartSec - b.timelineStartSec || a.id.localeCompare(b.id),
    );

    for (let guard = 0; guard < clips.length + 8; guard++) {
      const room = timelineDuration - start;
      const clipDuration = Math.min(sourceDuration, room);
      if (clipDuration < MIN_CLIP_SEC) return null;

      const end = start + clipDuration;
      const blocker = clips.find((c) => {
        const cEnd = c.timelineStartSec + c.durationSec;
        return start < cEnd - 1e-6 && end > c.timelineStartSec + 1e-6;
      });
      if (!blocker) return { timelineStart: start, clipDuration };

      start = blocker.timelineStartSec + blocker.durationSec;
      if (start >= timelineDuration - MIN_CLIP_SEC) return null;
    }
    return null;
  }

  /**
   * @param {string} trackId
   * @param {{ name: string, path: string, filename?: string, atSec?: number }} entry
   */
  async addClipToTrack(trackId, entry) {
    const track = this.engine.getTrack(trackId);
    if (!track || track.kind !== 'audio') {
      throw new Error('오디오 트랙이 아닙니다.');
    }

    const sourcePath = assertServerAudioPath(entry.path);
    const sourceDuration = await probeAudioDurationSec(sourcePath);
    const atSec = Number.isFinite(entry.atSec) ? entry.atSec : this.engine.playheadSec;
    const placement = this._findClipPlacement(track, atSec, sourceDuration);
    if (!placement) {
      throw new Error('타임라인에 배치할 공간이 없습니다.');
    }

    const { timelineStart, clipDuration } = placement;
    const label = entry.name || entry.filename || 'Audio';
    const clip = track.clips.add({
      trackId: track.id,
      label,
      sourcePath,
      timelineStartSec: timelineStart,
      durationSec: clipDuration,
      sourceInSec: 0,
      sourceOutSec: clipDuration,
      sourceDurationSec: sourceDuration,
      volume: DEFAULT_CLIP_VOLUME,
      muted: false,
    });

    this.selectClip(clip.id, track.id);
    this._primeElement(clip);
    this._emitClips();
    return { track, clip };
  }

  /** @param {string} trackId */
  removeTrack(trackId) {
    const track = this.engine.getTrack(trackId);
    if (!track || track.kind !== 'audio') return false;
    for (const c of track.clips.list()) {
      this._disposeElement(c.id);
    }
    if (this.selectedTrackId === trackId) this.clearSelection();
    this.engine.removeTrack(trackId, { history: true });
    this._emitClips();
    return true;
  }

  /** @param {string} clipId */
  removeClip(clipId) {
    const found = this._findClip(clipId);
    if (!found) return false;
    const snap = { ...found.clip };
    this._runEdit('Remove audio clip', () => {
      found.track.clips.remove(clipId);
      this._disposeElement(clipId);
      if (this.selectedClipId === clipId) this.clearSelection();
    }, () => {
      found.track.clips.add(snap);
    });
    return true;
  }

  /** @param {string} clipId @param {number} timelineStartSec */
  moveClip(clipId, timelineStartSec) {
    const found = this._findClip(clipId);
    if (!found || found.track.locked) return false;
    const next = Math.max(
      0,
      Math.min(timelineStartSec, this.engine.durationSec - found.clip.durationSec),
    );
    return this._patchClip(clipId, { timelineStartSec: next }, 'Move audio clip');
  }

  /**
   * @param {string} clipId
   * @param {Partial<{ timelineStartSec: number, durationSec: number, sourceInSec: number, sourceOutSec: number }>} patch
   */
  trimClip(clipId, patch) {
    const found = this._findClip(clipId);
    if (!found || found.track.locked) return false;
    const c = found.clip;
    const next = {
      timelineStartSec: patch.timelineStartSec ?? c.timelineStartSec,
      durationSec: patch.durationSec ?? c.durationSec,
      sourceInSec: patch.sourceInSec ?? c.sourceInSec,
      sourceOutSec: patch.sourceOutSec ?? c.sourceOutSec,
    };
    next.durationSec = Math.max(MIN_CLIP_SEC, next.durationSec);
    next.sourceOutSec = next.sourceInSec + next.durationSec;
    return this._patchClip(clipId, next, 'Trim audio clip');
  }

  /** @param {string} clipId @param {number} splitTimelineSec */
  splitClipAt(clipId, splitTimelineSec) {
    const found = this._findClip(clipId);
    if (!found || found.track.locked) return null;
    const clip = found.clip;
    if (!canSplitClipAt(clip, splitTimelineSec)) return null;

    const rel = splitTimelineSec - clip.timelineStartSec;
    const splitSource = clip.sourceInSec + rel;
    const snap = { ...clip };
    let rightId = null;

    this._runEdit('Split audio clip', () => {
      found.track.clips.update(snap.id, {
        durationSec: rel,
        sourceOutSec: splitSource,
      });
      const right = found.track.clips.add({
        trackId: snap.trackId,
        label: snap.label,
        sourcePath: snap.sourcePath,
        timelineStartSec: splitTimelineSec,
        durationSec: snap.durationSec - rel,
        sourceInSec: splitSource,
        sourceOutSec: snap.sourceOutSec,
        sourceDurationSec: snap.sourceDurationSec,
        volume: snap.volume,
        muted: snap.muted,
      });
      rightId = right.id;
      this.selectClip(right.id, found.track.id);
    }, () => {
      if (rightId) found.track.clips.remove(rightId);
      found.track.clips.update(snap.id, snap);
      this.selectClip(snap.id, found.track.id);
    });

    return rightId;
  }

  splitSelectedAtPlayhead() {
    const ph = this.engine.playheadSec;
    const clipId = this._clipIdForSplitAt(ph);
    if (!clipId) return null;
    return this.splitClipAt(clipId, ph);
  }

  /** @param {number} playheadSec */
  canSplitAtPlayhead(playheadSec = this.engine.playheadSec) {
    return !!this._clipIdForSplitAt(playheadSec);
  }

  /** @param {number} playheadSec */
  _clipIdForSplitAt(playheadSec) {
    if (this.selectedClipId) {
      const found = this._findClip(this.selectedClipId);
      if (found && canSplitClipAt(found.clip, playheadSec)) {
        return this.selectedClipId;
      }
    }
    for (const track of this.listAudioTracks()) {
      if (track.locked) continue;
      for (const clip of track.clips.list()) {
        if (canSplitClipAt(clip, playheadSec)) return clip.id;
      }
    }
    return null;
  }

  /** @param {string | null} clipId @param {string | null} [trackId] */
  selectClip(clipId, trackId = null) {
    this.selectedClipId = clipId;
    if (clipId) {
      const found = this._findClip(clipId);
      this.selectedTrackId = trackId || found?.track.id || null;
      this.insertTrackId = this.selectedTrackId;
      if (this.selectedTrackId) {
        this.engine.selectTracks([this.selectedTrackId]);
      }
    } else if (trackId) {
      this.selectTrackTarget(trackId);
      return;
    } else {
      this.selectedTrackId = null;
      this.insertTrackId = null;
    }
    this.engine.emit('selection');
  }

  clearSelection() {
    this.selectedClipId = null;
    this.selectedTrackId = null;
    this.insertTrackId = null;
  }

  getSelectedClip() {
    if (!this.selectedClipId) return null;
    const found = this._findClip(this.selectedClipId);
    return found ? { ...found.clip, track: found.track } : null;
  }

  /** @param {number} v */
  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, Number(v) || 0));
    this._refreshAllVolumes();
  }

  /** @param {string} trackId @param {number} v */
  setTrackVolume(trackId, v) {
    const track = this.engine.getTrack(trackId);
    if (!track || track.kind !== 'audio') return false;
    track.audioVolume = Math.max(0, Math.min(1, Number(v) || 0));
    this._refreshTrackVolumes(track);
    return true;
  }

  getTrackVolume(trackId) {
    const track = this.engine.getTrack(trackId);
    if (!track || track.kind !== 'audio') return 1;
    return track.audioVolume ?? 1;
  }

  /** @param {import('./types.js').AudioClip} clip @param {import('../timeline/Track.js').Track} track */
  _effectiveVolume(clip, track) {
    return Math.max(0, Math.min(1, (clip.volume ?? 1) * (track.audioVolume ?? 1) * this.masterVolume));
  }

  _refreshTrackVolumes(track) {
    if (!track?.clips) return;
    for (const clip of track.clips.list()) {
      const el = this._elements.get(clip.id);
      if (el) el.volume = this._effectiveVolume(clip, track);
    }
  }

  _refreshAllVolumes() {
    for (const track of this.listAudioTracks()) {
      this._refreshTrackVolumes(track);
    }
  }

  /** @param {string} clipId @param {number} v */
  setClipVolume(clipId, v) {
    return this._patchClip(
      clipId,
      { volume: Math.max(0, Math.min(1, Number(v) || 0)) },
      'Clip volume',
    );
  }

  /** @param {string} clipId @param {number} v 0–1 — live (no undo step) */
  setClipVolumeLive(clipId, v) {
    const found = this._findClip(clipId);
    if (!found) return false;
    found.track.clips.update(clipId, { volume: Math.max(0, Math.min(1, Number(v) || 0)) });
    const vol = found.track.clips.get(clipId)?.volume ?? 1;
    const el = this._elements.get(clipId);
    if (el) el.volume = this._effectiveVolume(found.clip, found.track);
    return true;
  }

  /** @param {string} clipId @param {number} beforeVol */
  commitClipVolume(clipId, beforeVol) {
    const found = this._findClip(clipId);
    if (!found) return;
    const afterVol = found.clip.volume;
    if (Math.abs(beforeVol - afterVol) < 0.001) return;
    const before = { ...found.clip };
    this.engine.commands.push({
      label: 'Clip volume',
      undo: () => {
        found.track.clips.update(clipId, { volume: beforeVol });
        this._emitClips();
      },
      redo: () => {
        found.track.clips.update(clipId, { volume: afterVol });
        this._emitClips();
      },
    });
  }

  /** @param {number} playheadSec */
  apply(playheadSec) {
    const playing = this.engine.playing;

    if (!playing) {
      setWaveformSuspended(false);
      for (const el of this._elements.values()) {
        if (!el.paused) el.pause();
      }
      this._playState.clear();
      this._lastPlayheadSec = playheadSec;
      return;
    }

    setWaveformSuspended(true);
    const jumped = Math.abs(playheadSec - this._lastPlayheadSec) > 0.1;
    this._lastPlayheadSec = playheadSec;

    /** @type {Set<string>} */
    const active = new Set();

    for (const track of this.listAudioTracks()) {
      if (track.hidden) continue;
      for (const clip of track.clips.list()) {
        const clipEnd = clip.timelineStartSec + clip.durationSec;
        const state = this._playState.get(clip.id) || { active: false };
        const inRange = state.active
          ? playheadSec >= clip.timelineStartSec - 0.05 && playheadSec < clipEnd + 0.03
          : playheadSec >= clip.timelineStartSec - 0.01 && playheadSec < clipEnd - 0.02;

        if (!inRange || track.locked || clip.muted) continue;

        const el = this._getElement(clip);
        active.add(clip.id);
        el.volume = this._effectiveVolume(clip, track);
        el.muted = false;
        el.playbackRate = 1;

        const offset = clip.sourceInSec + (playheadSec - clip.timelineStartSec);
        const maxOffset = Math.max(clip.sourceInSec, clip.sourceOutSec - 0.02);
        const safeOffset = Math.max(clip.sourceInSec, Math.min(offset, maxOffset));
        const forceSeek = this._clipSeekDirty.delete(clip.id) || jumped || !state.active;

        if (forceSeek) {
          this._syncPlay(el, clip, safeOffset, true);
        } else {
          this._ensurePlaying(el);
        }
        state.active = true;
        this._playState.set(clip.id, state);
      }
    }

    for (const [id, el] of this._elements) {
      if (!active.has(id)) {
        if (!el.paused) el.pause();
        const state = this._playState.get(id);
        if (state) state.active = false;
      }
    }
  }

  /** Buffer clips before playback (reduces late start after heavy scene load). */
  preloadAllClips() {
    for (const track of this.listAudioTracks()) {
      for (const clip of track.clips.list()) {
        const el = this._getElement(clip);
        if (el.networkState === HTMLMediaElement.NETWORK_EMPTY || el.readyState < HTMLMediaElement.HAVE_METADATA) {
          el.load();
        }
      }
    }
  }

  /**
   * @param {HTMLAudioElement} el
   * @param {import('./types.js').AudioClip} clip
   * @param {number} offsetSec
   * @param {boolean} [seek]
   */
  _syncPlay(el, clip, offsetSec, seek = false) {
    this._ensureElementReadyHandler(el, clip.id);

    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      this._startElement(el, offsetSec, seek);
      return;
    }

    if (el.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      el.load();
    }
  }

  /** @param {HTMLAudioElement} el @param {string} clipId */
  _ensureElementReadyHandler(el, clipId) {
    el._sbClipId = clipId;
    if (el._sbReadyBound) return;
    el._sbReadyBound = true;

    const onReady = () => {
      if (!this.engine.playing || !el.paused) return;
      if (el._sbReadyRaf) return;
      el._sbReadyRaf = requestAnimationFrame(() => {
        el._sbReadyRaf = 0;
        if (!this.engine.playing || !el.paused) return;
        const cid = el._sbClipId;
        if (!cid) return;
        const found = this._findClip(cid);
        if (!found) return;
        const { clip: c, track } = found;
        if (track.hidden || track.locked || c.muted) return;
        const ph = this.engine.playheadSec;
        const clipEnd = c.timelineStartSec + c.durationSec;
        if (ph < c.timelineStartSec - 0.01 || ph >= clipEnd - 0.001) return;
        const offset = c.sourceInSec + (ph - c.timelineStartSec);
        const maxOffset = Math.max(c.sourceInSec, c.sourceOutSec - 0.02);
        const safeOffset = Math.max(c.sourceInSec, Math.min(offset, maxOffset));
        this._startElement(el, safeOffset, true);
      });
    };

    el.addEventListener('canplay', onReady);
    el.addEventListener('loadeddata', onReady);
  }

  /** @param {HTMLAudioElement} el */
  _ensurePlaying(el) {
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && el.paused) {
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          console.warn('[audio] play blocked:', err?.message || err);
        });
      }
    }
  }

  /** @param {HTMLAudioElement} el @param {number} offsetSec @param {boolean} [seek] */
  _startElement(el, offsetSec, seek = false) {
    try {
      if (seek) {
        el.currentTime = offsetSec;
      }
    } catch { /* ignore seek errors */ }
    if (el.paused) {
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          console.warn('[audio] play blocked:', err?.message || err);
        });
      }
    }
  }

  /** @param {import('./types.js').AudioClip} clip */
  _primeElement(clip) {
    const el = this._getElement(clip);
    el.load();
  }

  dispose() {
    for (const el of this._elements.values()) {
      el.pause();
      el.src = '';
    }
    this._elements.clear();
  }

  /** @param {string} clipId */
  _findClip(clipId) {
    for (const track of this.listAudioTracks()) {
      const clip = track.clips.get(clipId);
      if (clip) return { track, clip };
    }
    return null;
  }

  /** @param {import('./types.js').AudioClip} clip */
  _getElement(clip) {
    const url = resolveAudioUrl(clip.sourcePath);
    let el = this._elements.get(clip.id);
    if (!el) {
      el = new Audio();
      el.preload = 'auto';
      el._sbUrl = url;
      el._sbClipId = clip.id;
      el.src = url;
      this._elements.set(clip.id, el);
      return el;
    }
    el._sbClipId = clip.id;
    if (el._sbUrl !== url) {
      el._sbUrl = url;
      el.src = url;
      el.load();
    }
    return el;
  }

  /** @param {string} clipId */
  _disposeElement(clipId) {
    const el = this._elements.get(clipId);
    if (el) {
      el.pause();
      el.src = '';
      this._elements.delete(clipId);
    }
  }

  /** @param {string} clipId */
  syncClipElement(clipId) {
    const found = this._findClip(clipId);
    if (!found) return;
    this._clipSeekDirty.add(clipId);
    const el = this._elements.get(clipId);
    if (el && !this.engine.playing) {
      this._seekElementToClip(el, found.clip);
    }
  }

  /** @param {HTMLAudioElement} el @param {import('./types.js').AudioClip} clip */
  _seekElementToClip(el, clip) {
    try {
      const t = Math.max(0, clip.sourceInSec);
      if (Number.isFinite(el.duration) && el.duration > 0) {
        el.currentTime = Math.min(t, Math.max(0, el.duration - 0.02));
      } else {
        el.currentTime = t;
      }
    } catch { /* ignore */ }
  }

  /** Live edit without history (gesture). */
  patchClipLive(clipId, patch) {
    const found = this._findClip(clipId);
    if (!found || found.track.locked) return false;
    found.track.clips.update(clipId, patch);
    return true;
  }

  /**
   * Commit gesture to undo stack.
   * @param {string} clipId
   * @param {import('./types.js').AudioClip} before
   * @param {string} label
   */
  commitClipChange(clipId, before, label) {
    const found = this._findClip(clipId);
    if (!found) return;
    const after = { ...found.clip };
    if (
      before.timelineStartSec === after.timelineStartSec
      && before.durationSec === after.durationSec
      && before.sourceInSec === after.sourceInSec
      && before.sourceOutSec === after.sourceOutSec
    ) return;

    const ph = this.engine.playheadSec;
    const wasInside = ph >= before.timelineStartSec - 1e-6
      && ph < before.timelineStartSec + before.durationSec - 1e-6;
    const nowInside = ph >= after.timelineStartSec - 1e-6
      && ph < after.timelineStartSec + after.durationSec - 1e-6;
    if (wasInside && !nowInside) {
      this.engine.setPlayhead(after.timelineStartSec);
    }
    this.syncClipElement(clipId);

    this.engine.commands.push({
      label,
      undo: () => {
        found.track.clips.update(clipId, before);
        this.syncClipElement(clipId);
        this._emitClips();
      },
      redo: () => {
        found.track.clips.update(clipId, after);
        this.syncClipElement(clipId);
        this._emitClips();
      },
    });
  }

  /** @param {string} clipId @param {Partial<import('./types.js').AudioClip>} patch @param {string} label */
  _patchClip(clipId, patch, label) {
    const found = this._findClip(clipId);
    if (!found || found.track.locked) return false;
    const before = { ...found.clip };
    this._runEdit(label, () => {
      found.track.clips.update(clipId, patch);
    }, () => {
      found.track.clips.update(clipId, before);
    });
    return true;
  }

  /** @param {string} label @param {() => void} applyFn @param {() => void} revertFn */
  _runEdit(label, applyFn, revertFn) {
    const beforeTracks = this._snapshotAudioTracks();
    applyFn();
    const afterTracks = this._snapshotAudioTracks();
    this.engine.commands.push({
      label,
      undo: () => this._restoreAudioTracks(beforeTracks),
      redo: () => this._restoreAudioTracks(afterTracks),
    });
    this._emitClips();
  }

  _snapshotAudioTracks() {
    return this.listAudioTracks().map((t) => ({
      track: t.snapshot(),
      clips: t.clips.snapshot(),
    }));
  }

  /** @param {ReturnType<AudioDirector['_snapshotAudioTracks']>} snaps */
  _restoreAudioTracks(snaps) {
    const ids = new Set(snaps.map((s) => s.track.id));
    for (const t of this.listAudioTracks()) {
      if (!ids.has(t.id)) {
        for (const c of t.clips.list()) this._disposeElement(c.id);
        this.engine.tracks.delete(t.id);
      }
    }
    for (const row of snaps) {
      let track = this.engine.getTrack(row.track.id);
      if (!track) {
        track = Track.fromSnapshot(row.track);
        this.engine.tracks.set(track.id, track);
      } else {
        track.name = row.track.name;
        track.hidden = row.track.hidden;
        track.locked = row.track.locked;
        track.color = row.track.color;
        track.audioVolume = row.track.audioVolume ?? 1;
      }
      track.clips.restore(row.clips);
    }
    if (this.selectedClipId && !this._findClip(this.selectedClipId)) {
      this.clearSelection();
    }
    this._emitClips();
  }

  _emitClips() {
    this.engine.emit('clips');
    this.engine.emit('tracks');
  }
}
