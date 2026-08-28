import { DEFAULT_CLIP_VOLUME, MIN_CLIP_SEC } from './types.js';

let _seq = 1;

export function newAudioClipId() {
  return `acl_${_seq++}`;
}

/**
 * Ordered clip list for one audio track.
 */
export class AudioClipStore {
  constructor() {
    /** @type {import('./types.js').AudioClip[]} */
    this._clips = [];
  }

  get length() {
    return this._clips.length;
  }

  /** @returns {ReadonlyArray<import('./types.js').AudioClip>} */
  list() {
    return this._clips;
  }

  /** @param {string} id */
  get(id) {
    return this._clips.find((c) => c.id === id) ?? null;
  }

  /**
   * @param {Omit<import('./types.js').AudioClip, 'id'> & { id?: string }} input
   */
  add(input) {
    const clip = normalizeClip({
      id: input.id ?? newAudioClipId(),
      trackId: input.trackId,
      label: input.label ?? 'Audio',
      sourcePath: input.sourcePath,
      timelineStartSec: input.timelineStartSec,
      durationSec: input.durationSec,
      sourceInSec: input.sourceInSec,
      sourceOutSec: input.sourceOutSec,
      sourceDurationSec: input.sourceDurationSec,
      volume: input.volume ?? DEFAULT_CLIP_VOLUME,
      muted: !!input.muted,
    });
    this._clips.push(clip);
    this._sort();
    return { ...clip };
  }

  /** @param {string} id */
  remove(id) {
    const i = this._clips.findIndex((c) => c.id === id);
    if (i < 0) return null;
    const [removed] = this._clips.splice(i, 1);
    return removed;
  }

  /**
   * @param {string} id
   * @param {Partial<import('./types.js').AudioClip>} patch
   */
  update(id, patch) {
    const clip = this.get(id);
    if (!clip) return null;
    Object.assign(clip, normalizeClip({ ...clip, ...patch, id: clip.id, trackId: clip.trackId }));
    this._sort();
    return { ...clip };
  }

  clear() {
    this._clips = [];
  }

  snapshot() {
    return this._clips.map((c) => ({ ...c }));
  }

  /** @param {import('./types.js').AudioClip[]} clips */
  restore(clips) {
    this._clips = (clips || []).map((c) => normalizeClip(c));
    this._sort();
  }

  _sort() {
    this._clips.sort(
      (a, b) => a.timelineStartSec - b.timelineStartSec || a.id.localeCompare(b.id),
    );
  }
}

/** @param {Partial<import('./types.js').AudioClip> & { trackId: string, sourcePath: string }} raw */
function normalizeClip(raw) {
  const timelineStartSec = Math.max(0, Number(raw.timelineStartSec) || 0);
  let durationSec = Math.max(MIN_CLIP_SEC, Number(raw.durationSec) || MIN_CLIP_SEC);
  let sourceInSec = Math.max(0, Number(raw.sourceInSec) || 0);
  let sourceOutSec = Number(raw.sourceOutSec);
  if (!Number.isFinite(sourceOutSec) || sourceOutSec <= sourceInSec) {
    sourceOutSec = sourceInSec + durationSec;
  }
  durationSec = Math.min(durationSec, Math.max(MIN_CLIP_SEC, sourceOutSec - sourceInSec));
  sourceOutSec = sourceInSec + durationSec;

  return {
    id: String(raw.id),
    trackId: String(raw.trackId),
    label: String(raw.label || 'Audio'),
    sourcePath: String(raw.sourcePath || ''),
    timelineStartSec,
    durationSec,
    sourceInSec,
    sourceOutSec,
    sourceDurationSec: Number.isFinite(raw.sourceDurationSec) && raw.sourceDurationSec > 0
      ? Number(raw.sourceDurationSec)
      : undefined,
    volume: clamp01(raw.volume ?? DEFAULT_CLIP_VOLUME),
    muted: !!raw.muted,
  };
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_CLIP_VOLUME;
  return Math.max(0, Math.min(1, n));
}
