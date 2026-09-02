import {
  presenceEndSec,
  presenceInSec,
  presenceOutSec,
  resizePresenceClipEnd,
  shiftPresenceClip,
  supportsPresenceClip,
  syncPresenceClipFromKeys,
} from '../../domain/timeline/presenceClip.js';

/** Exit handle sticks out past clip end so it does not overlap the last key diamond. */
export const PRESENCE_EXIT_HANDLE_OUTSET_PX = 14;

/** @param {PointerEvent} e */
export function pointerHitsTimelineKey(e) {
  if (e.target instanceof Element && e.target.closest?.('.sb-tl-key')) return true;
  const stack = document.elementsFromPoint(e.clientX, e.clientY);
  return stack.some((node) => node instanceof Element && node.closest?.('.sb-tl-key'));
}

/**
 * @param {import('../../domain/timeline/Track.js').Track} tr
 * @param {(sec: number) => number} secToX
 * @param {'clip' | 'keys'} editMode
 * @param {boolean} [isTrackSelected]
 */
export function presenceTrackRowExtras(tr, secToX, editMode, isTrackSelected = false) {
  if (!tr.presenceClip || !supportsPresenceClip(tr)) return '';
  const clip = tr.presenceClip;
  const start = clip.startSec;
  const end = presenceEndSec(clip);
  const inSec = presenceInSec(clip);
  const outSec = presenceOutSec(clip);
  const left = secToX(start);
  const w = Math.max(12, secToX(end) - left);
  const inX = secToX(inSec) - left;
  const outX = secToX(outSec) - left;
  const thin = editMode === 'keys' ? ' is-thin' : '';
  const sel = isTrackSelected ? ' is-selected' : '';
  return `<div class="sb-presence-clip${thin}${sel}" data-track="${tr.id}" data-role="presence-clip"
    style="left:${left}px;width:${w}px;--presence-in:${Math.max(0, inX)}px;--presence-out:${Math.max(0, outX)}px">
    <span class="sb-presence-body" data-handle="move" title="시작 시간 이동 (드래그)"></span>
    <span class="sb-presence-handle sb-presence-handle-r" data-handle="end" title="퇴장 시간"></span>
  </div>`;
}

/**
 * @param {import('../../domain/timeline/Track.js').Track} tr
 * @param {number} keyTimeSec
 */
export function isKeyInPresenceBody(tr, keyTimeSec) {
  if (!tr.presenceClip) return true;
  const inSec = presenceInSec(tr.presenceClip);
  const outSec = presenceOutSec(tr.presenceClip);
  return keyTimeSec >= inSec - 1e-6 && keyTimeSec <= outSec + 1e-6;
}

/**
 * @param {HTMLElement} viewport
 * @param {import('../../domain/timeline/Track.js').Track} tr
 * @param {(sec: number) => number} secToX
 */
export function syncPresenceClipDom(viewport, tr, secToX) {
  const el = viewport.querySelector(`.sb-presence-clip[data-track="${tr.id}"]`);
  if (!el || !tr.presenceClip) return;
  const clip = tr.presenceClip;
  const left = secToX(clip.startSec);
  const w = Math.max(12, secToX(presenceEndSec(clip)) - left);
  const inX = secToX(presenceInSec(clip)) - left;
  const outX = secToX(presenceOutSec(clip)) - left;
  el.style.left = `${left}px`;
  el.style.width = `${w}px`;
  el.style.setProperty('--presence-in', `${Math.max(0, inX)}px`);
  el.style.setProperty('--presence-out', `${Math.max(0, outX)}px`);
}

/**
 * @param {HTMLElement} viewport
 * @param {import('../../domain/timeline/Track.js').Track} tr
 * @param {(sec: number) => number} secToX
 */
export function syncPresenceKeysDom(viewport, tr, secToX) {
  viewport.querySelectorAll(`.sb-tl-key[data-track="${tr.id}"]`).forEach((node) => {
    const btn = /** @type {HTMLElement} */ (node);
    const kf = tr.keys.get(btn.dataset.key || '');
    if (kf) btn.style.left = `${secToX(kf.timeSec)}px`;
  });
}

/**
 * After key drag — keep clip envelope aligned with first/last keys.
 * @param {import('../../domain/timeline/Track.js').Track} tr
 * @param {import('../../domain/timeline/TimelineEngine.js').TimelineEngine} engine
 * @param {HTMLElement} viewport
 * @param {(sec: number) => number} secToX
 */
export function syncPresenceAfterKeyEdit(tr, engine, viewport, secToX) {
  if (!tr.presenceClip || !supportsPresenceClip(tr)) return;
  syncPresenceClipFromKeys(tr, engine.fps);
  syncPresenceClipDom(viewport, tr, secToX);
  syncPresenceKeysDom(viewport, tr, secToX);
}

/**
 * Clip body = move start; right handle = adjust exit (last key).
 * @param {HTMLElement} viewport
 * @param {() => {
 *   engine: import('../../domain/timeline/TimelineEngine.js').TimelineEngine,
 *   secToX: (sec: number) => number,
 *   onSelectTrack?: (trackId: string) => void,
 *   onDragStart?: () => void,
 *   onDragEnd?: () => void,
 *   onCommit?: () => void,
 * }} getCtx
 */
export function mountPresenceClipInteractions(viewport, getCtx) {
  if (viewport.dataset.presenceClipBound === '1') return;
  viewport.dataset.presenceClipBound = '1';

  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (pointerHitsTimelineKey(e)) return;

    const clipEl = e.target.closest?.('.sb-presence-clip:not(.is-thin)');
    if (!clipEl) return;

    const { engine, secToX, onSelectTrack, onDragStart, onDragEnd, onCommit } = getCtx();
    const trackId = /** @type {HTMLElement} */ (clipEl).dataset.track;
    if (!trackId) return;

    const track = engine.getTrack(trackId);
    if (!track?.presenceClip) return;

    e.stopPropagation();

    const handle = e.target.closest?.('[data-handle]');
    const onHandle = !!(handle && clipEl.contains(handle));

    // Select before drag flag — subscribe skips full render while presenceClipDragging
    onDragStart?.();
    onSelectTrack?.(trackId);

    if (!onHandle || track.locked) {
      e.preventDefault();
      onDragEnd?.();
      onCommit?.();
      return;
    }

    e.preventDefault();

    const handleKind = handle.dataset?.handle === 'end' ? 'end' : 'move';
    engine.pause();
    const startX = e.clientX;
    const snap = snapshotPresenceState(track);
    let moved = false;

    /** @param {PointerEvent} ev */
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 2) moved = true;
      const dSec = dx / Math.max(1e-6, engine.pxPerSec);
      restorePresenceState(track, snap);
      if (handleKind === 'end') {
        resizePresenceClipEnd(track, dSec, engine);
      } else {
        shiftPresenceClip(track, dSec, engine);
      }
      syncPresenceClipDom(viewport, track, secToX);
      syncPresenceKeysDom(viewport, track, secToX);
      engine.emit('keys');
    };

    const finish = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      onDragEnd?.();
      try {
        clipEl.releasePointerCapture?.(e.pointerId);
      } catch { /* ignore */ }
      if (moved) {
        const endSnap = snapshotPresenceState(track);
        engine.emit('keys');
        engine.emit('tracks');
        engine.commands.push({
          label: handleKind === 'end' ? 'Resize presence clip' : 'Move presence clip',
          undo: () => {
            restorePresenceState(track, snap);
            engine.emit('keys');
            engine.emit('tracks');
          },
          redo: () => {
            restorePresenceState(track, endSnap);
            engine.emit('keys');
            engine.emit('tracks');
          },
        });
      }
      // Re-render after interaction so selection highlight + clip DOM stay in sync
      onCommit?.();
    };

    clipEl.setPointerCapture?.(e.pointerId);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
  }, true);
}

/** @deprecated use mountPresenceClipInteractions once at shell mount */
export function bindPresenceClipInteractions(viewport, ctx) {
  mountPresenceClipInteractions(viewport, () => ctx);
}

/** @param {import('../../domain/timeline/Track.js').Track} track */
function snapshotPresenceState(track) {
  return {
    presenceClip: track.presenceClip ? { ...track.presenceClip } : null,
    keys: track.keys.snapshot(),
  };
}

/** @param {import('../../domain/timeline/Track.js').Track} track @param {ReturnType<typeof snapshotPresenceState>} snap */
function restorePresenceState(track, snap) {
  track.presenceClip = snap.presenceClip ? { ...snap.presenceClip } : null;
  track.keys.restore(snap.keys);
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { escapeAttr };
