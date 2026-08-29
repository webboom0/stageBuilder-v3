import { KeyframeStore } from './KeyframeStore.js';
import { AudioClipStore } from '../audio/AudioClipStore.js';

let _trackSeq = 1;

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   kind: import('./types.js').TrackKind,
 *   group?: string,
 *   section?: import('./types.js').TimelineSection,
 *   folderId?: string | null,
 *   motionId?: string | null,
 * }} TrackMeta
 */

export class Track {
  /**
   * @param {Partial<TrackMeta> & {
   *   name: string,
   *   kind?: import('./types.js').TrackKind,
   *   clipStartSec?: number,
   *   clipDurationSec?: number,
   * }} opts
   */
  constructor(opts) {
    this.id = opts.id ?? `track_${_trackSeq++}`;
    this.name = opts.name;
    this.kind = opts.kind ?? 'scalar';
    this.group = opts.group ?? 'demo';
    this.section = opts.section ?? inferSection(this.group);
    this.keys = new KeyframeStore();
    /** Audio clips when kind === 'audio' */
    this.clips = opts.kind === 'audio' ? new AudioClipStore() : null;
    /** @deprecated clip schedule — not used for visibility; kept for snapshot compat */
    this.clipStartSec = opts.clipStartSec ?? 0;
    this.clipDurationSec = opts.clipDurationSec ?? 10;
    /** Timeline group folder (Show Control / Ensemble MVP) */
    this.folderId = opts.folderId ?? null;
    this.motionId = opts.motionId ?? null;
    /** CSS color for track accent (motion section default applied in UI) */
    this.color = opts.color ?? null;
    /** Track-head eye: hide object on stage (independent of keyframe visible) */
    this.hidden = opts.hidden === true;
    /** Track-head lock: block key/gizmo edits */
    this.locked = opts.locked === true;
    /** Audio track mix level (kind === 'audio') */
    this.audioVolume = Number.isFinite(opts.audioVolume) ? clamp01(opts.audioVolume) : 1;
    /** Persisted motion restore hints (scene save) */
    this.motionMeta = opts.motionMeta ?? null;
  }

  snapshot() {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      group: this.group,
      section: this.section,
      keys: this.keys.snapshot(),
      clips: this.clips ? this.clips.snapshot() : [],
      clipStartSec: this.clipStartSec,
      clipDurationSec: this.clipDurationSec,
      folderId: this.folderId,
      motionId: this.motionId,
      color: this.color,
      hidden: this.hidden,
      locked: this.locked,
      audioVolume: this.audioVolume,
      motionMeta: this.motionMeta ?? undefined,
    };
  }

  /** @param {ReturnType<Track['snapshot']>} data */
  static fromSnapshot(data) {
    const t = new Track({
      id: data.id,
      name: data.name,
      kind: data.kind,
      group: data.group,
      section: data.section,
      clipStartSec: data.clipStartSec,
      clipDurationSec: data.clipDurationSec,
      folderId: data.folderId,
      motionId: data.motionId,
      color: data.color,
      hidden: data.hidden,
      locked: data.locked,
      audioVolume: data.audioVolume,
      motionMeta: data.motionMeta ?? null,
    });
    t.keys.restore(data.keys);
    if (data.kind === 'audio' || (data.clips && data.clips.length)) {
      if (!t.clips) t.clips = new AudioClipStore();
      t.clips.restore(data.clips || []);
    }
    return t;
  }
}

/** @param {string} group */
function inferSection(group) {
  const g = String(group || '');
  if (g.startsWith('light')) return 'light';
  if (g.startsWith('audio')) return 'audio';
  if (g.startsWith('stage:')) return 'stage';
  return 'motion';
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}
