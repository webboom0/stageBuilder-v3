import { MIN_CLIP_SEC } from '../../domain/audio/types.js';
import { drawAudioWaveform } from '../../domain/audio/audioPaths.js';

/** @param {number} volume01 0–1 @param {boolean} [hidden] */
export function audioVolumeIconClass(volume01, hidden = false) {
  const pct = Math.round((Number(volume01) || 0) * 100);
  return hidden || pct <= 0 ? 'fas fa-volume-mute' : 'fas fa-volume-up';
}

/**
 * @param {import('../../domain/timeline/Track.js').Track} tr
 * @param {import('../../domain/timeline/TimelineEngine.js').TimelineEngine} engine
 * @param {boolean} nested
 * @param {string | null} selectedClipId
 * @param {string | null} insertTrackId
 */
export function audioTrackLabelHtml(tr, engine, nested, selectedClipId, insertTrackId) {
  const nest = nested ? ' sb-tl-label-nested' : '';
  const accent = tr.color || '#4a7ab5';
  const sel = engine.isTrackSelected?.(tr.id) || engine.selectedTrackId === tr.id ? ' is-selected' : '';
  const target = insertTrackId === tr.id ? ' is-target' : '';
  const muted = tr.hidden ? ' is-muted' : '';
  const loc = tr.locked ? ' is-locked' : '';
  const lockIcon = tr.locked ? 'fas fa-lock' : 'fas fa-lock-open';
  const clipSel = tr.clips?.list().some((c) => c.id === selectedClipId);
  const clipMark = clipSel ? ' ·clip' : '';
  const volPct = Math.round((tr.audioVolume ?? 1) * 100);
  const muteIcon = audioVolumeIconClass(tr.audioVolume ?? 1, tr.hidden);
  const muteTitle = tr.hidden ? 'Unmute track' : 'Mute track';
  return `<div class="sb-tl-label sb-tl-label-audio${nest}${sel}${target}${muted}${loc}"
    data-track="${tr.id}" data-section="audio"
    style="--track-accent:${escapeAttr(accent)}">
    <i class="sb-tl-swatch" style="background:${escapeAttr(accent)}"></i>
    <span class="sb-tl-label-name">${escapeHtml(tr.name)}${clipMark}</span>
    <label class="sb-tl-audio-vol-inline" title="Track volume">
      <input type="range" data-tl-act="track-vol" min="0" max="100" value="${volPct}" aria-label="Track volume" />
    </label>
    <span class="sb-tl-label-ctrls" role="group" aria-label="Audio track">
      <button type="button" class="sb-tl-hbtn sb-tl-hbtn-mute${tr.hidden || volPct <= 0 ? ' is-on' : ''}" data-tl-act="mute"
        title="${muteTitle}" aria-label="${muteTitle}"><i class="${muteIcon}" data-role="track-vol-icon"></i></button>
      <button type="button" class="sb-tl-hbtn${tr.locked ? ' is-on' : ''}" data-tl-act="lock"
        title="잠금"><i class="${lockIcon}"></i></button>
    </span>
  </div>`;
}

/**
 * @param {import('../../domain/timeline/Track.js').Track} tr
 * @param {(sec: number) => number} secToX
 * @param {string | null} selectedClipId
 */
export function audioTrackRowHtml(tr, secToX, selectedClipId) {
  const accent = tr.color || '#4a7ab5';
  const clips = tr.clips?.list() || [];
  const clipHtml = clips.map((clip) => {
    const sel = clip.id === selectedClipId ? ' is-selected' : '';
    const left = secToX(clip.timelineStartSec);
    const w = Math.max(8, secToX(clip.timelineStartSec + clip.durationSec) - left);
    return `<div class="sb-audio-clip${sel}" data-clip="${clip.id}" data-track="${tr.id}"
      style="left:${left}px;width:${w}px;--clip-accent:${escapeAttr(accent)}"
      title="${escapeHtml(clip.label)} · ${clip.durationSec.toFixed(1)}s">
      <span class="sb-audio-clip-handle sb-audio-clip-handle-l" data-handle="l" title="앞 trim"></span>
      <canvas class="sb-audio-clip-wave" width="120" height="28" aria-hidden="true"></canvas>
      <span class="sb-audio-clip-name">${escapeHtml(clip.label)}</span>
      <span class="sb-audio-clip-handle sb-audio-clip-handle-r" data-handle="r" title="뒤 trim"></span>
    </div>`;
  }).join('');
  const emptyHint = clips.length
    ? ''
    : '<span class="sb-audio-track-empty">Assets Audio + 로 클립 추가</span>';
  return `<div class="sb-tl-track sb-tl-track-audio${clips.length ? '' : ' is-empty'}" data-track="${tr.id}" data-section="audio"
    style="--track-accent:${escapeAttr(accent)}">${emptyHint}${clipHtml}</div>`;
}

/**
 * Paint waveforms after layout (deferred — avoids width=0 and playhead flicker).
 * @param {HTMLElement} tracksRoot
 * @param {import('../../domain/timeline/TimelineEngine.js').TimelineEngine} engine
 * @param {(sec: number) => number} [secToX]
 */
export function scheduleAudioWaveforms(tracksRoot, engine, secToX) {
  if (!engine || engine.playing) return;
  requestAnimationFrame(() => {
    paintAudioWaveforms(tracksRoot, engine, secToX);
  });
}

/**
 * @param {HTMLElement} tracksRoot
 * @param {import('../../domain/timeline/TimelineEngine.js').TimelineEngine} engine
 * @param {(sec: number) => number} [secToX]
 */
export function paintAudioWaveforms(tracksRoot, engine, secToX) {
  if (!engine || engine.playing) return;
  tracksRoot.querySelectorAll('.sb-audio-clip').forEach((node) => {
    const el = /** @type {HTMLElement} */ (node);
    const trackId = el.dataset.track;
    const clipId = el.dataset.clip;
    const canvas = el.querySelector('.sb-audio-clip-wave');
    if (!trackId || !clipId || !(canvas instanceof HTMLCanvasElement)) return;

    const track = engine.getTrack(trackId);
    const clip = track?.clips?.get(clipId);
    if (!clip) return;

    const w = secToX
      ? Math.max(8, Math.round(secToX(clip.durationSec)))
      : Math.max(8, Math.round(el.clientWidth || 120));
    const key = `${clip.sourcePath}|${clip.sourceInSec.toFixed(3)}|${clip.sourceOutSec.toFixed(3)}|${w}`;
    if (canvas.dataset.waveKey === key && canvas.width > 0) return;
    canvas.dataset.waveKey = key;
    canvas.dataset.wavePixelW = String(w);
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    drawAudioWaveform(canvas, clip.sourcePath, {
      sourceInSec: clip.sourceInSec,
      sourceOutSec: clip.sourceOutSec,
    });
  });
}

/**
 * @param {HTMLElement} viewport
 * @param {string | null} selectedClipId
 */
export function syncAudioClipSelection(viewport, selectedClipId) {
  viewport.querySelectorAll('.sb-audio-clip').forEach((node) => {
    node.classList.toggle('is-selected', node.dataset.clip === selectedClipId);
  });
}

/**
 * Update clip bar position/size without full timeline re-render (during drag).
 * @param {HTMLElement} viewport
 * @param {string} clipId
 * @param {import('../../domain/timeline/TimelineEngine.js').TimelineEngine} engine
 * @param {(sec: number) => number} secToX
 */
export function syncAudioClipDom(viewport, clipId, engine, secToX) {
  const el = viewport.querySelector(`[data-clip="${clipId}"]`);
  if (!el) return;
  const trackId = el.dataset.track;
  const track = trackId ? engine.getTrack(trackId) : null;
  const clip = track?.clips?.get(clipId);
  if (!clip) return;
  const left = secToX(clip.timelineStartSec);
  const w = Math.max(8, secToX(clip.timelineStartSec + clip.durationSec) - left);
  el.style.left = `${left}px`;
  el.style.width = `${w}px`;
}

/**
 * @param {HTMLElement} viewport
 * @param {{
 *   engine: import('../../domain/timeline/TimelineEngine.js').TimelineEngine,
 *   audio: import('../../domain/audio/AudioDirector.js').AudioDirector,
 *   secToX: (sec: number) => number,
 *   onLiveUpdate?: (clipId: string) => void,
 *   onDragStart?: (clipId: string) => void,
 *   onDragEnd?: () => void,
 *   onCommit?: () => void,
 *   onSelect?: () => void,
 * }} ctx
 */
export function bindAudioClipInteractions(viewport, ctx) {
  const { engine, audio, onLiveUpdate, onDragStart, onDragEnd, onCommit, onSelect } = ctx;
  if (!audio) return;

  const pxPerSec = () => Math.max(1e-6, engine.pxPerSec);

  viewport.querySelectorAll('.sb-audio-clip').forEach((node) => {
    const el = /** @type {HTMLElement} */ (node);
    const clipId = el.dataset.clip;
    const trackId = el.dataset.track;
    if (!clipId || !trackId) return;

    const track = engine.getTrack(trackId);
    if (!track) return;

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const handle = e.target.closest?.('[data-handle]');
      const handleSide = handle?.dataset?.handle;

      e.stopPropagation();
      e.preventDefault();

      const clip = track.clips.get(clipId);
      if (!clip || track.locked) return;

      onDragStart?.(clipId);
      audio.selectClip(clipId, trackId);
      onSelect?.();
      engine.pause();

      const startX = e.clientX;
      const sourceTotal = clip.sourceDurationSec ?? clip.sourceOutSec;
      const orig = {
        timelineStartSec: clip.timelineStartSec,
        durationSec: clip.durationSec,
        sourceInSec: clip.sourceInSec,
        sourceOutSec: clip.sourceOutSec,
        sourceDurationSec: sourceTotal,
      };

      const live = () => onLiveUpdate?.(clipId);
      const commitLabel = handleSide === 'l' || handleSide === 'r'
        ? 'Trim audio clip'
        : 'Move audio clip';

      let moved = false;

      /** @param {PointerEvent} ev */
      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        if (Math.abs(dx) > 2) moved = true;
        const dSec = dx / pxPerSec();

        if (handleSide === 'l') {
          const maxTrim = orig.durationSec - MIN_CLIP_SEC;
          const maxSourceTrim = orig.sourceDurationSec - orig.sourceInSec - MIN_CLIP_SEC;
          const delta = Math.max(
            -orig.timelineStartSec,
            Math.min(dSec, maxTrim, maxSourceTrim),
          );
          audio.patchClipLive(clipId, {
            timelineStartSec: orig.timelineStartSec + delta,
            durationSec: orig.durationSec - delta,
            sourceInSec: orig.sourceInSec + delta,
            sourceOutSec: orig.sourceOutSec,
          });
        } else if (handleSide === 'r') {
          const maxSourceEnd = Math.max(orig.sourceOutSec, orig.sourceDurationSec ?? orig.sourceOutSec);
          const maxDur = Math.min(
            engine.durationSec - orig.timelineStartSec,
            maxSourceEnd - orig.sourceInSec,
          );
          const delta = Math.max(
            -(orig.durationSec - MIN_CLIP_SEC),
            Math.min(dSec, maxDur - orig.durationSec),
          );
          audio.patchClipLive(clipId, {
            durationSec: orig.durationSec + delta,
            sourceOutSec: orig.sourceOutSec + delta,
          });
        } else {
          audio.patchClipLive(clipId, {
            timelineStartSec: Math.max(
              0,
              Math.min(orig.timelineStartSec + dSec, engine.durationSec - orig.durationSec),
            ),
          });
        }
        live();
      };

      const finish = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', finish);
        document.removeEventListener('pointercancel', finish);
        try {
          el.releasePointerCapture?.(e.pointerId);
        } catch { /* ignore */ }
        if (moved) {
          audio.commitClipChange(clipId, orig, commitLabel);
        }
        onDragEnd?.();
        onCommit?.();
      };

      el.setPointerCapture?.(e.pointerId);
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', finish);
      document.addEventListener('pointercancel', finish);
    });

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.selectClip(clipId, trackId);
      onSelect?.();
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      audio.selectClip(clipId, trackId);
      onSelect?.();
      const ph = engine.playheadSec;
      ctx.onContextMenu?.(e.clientX, e.clientY, clipId, ph);
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
