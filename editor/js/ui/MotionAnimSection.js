import {
  SEGMENT_KIND_LABELS,
  SEGMENT_EASING,
  SEGMENT_EASING_LABELS,
  normalizeRotYDeg,
} from '../domain/motion/groupSegments.js';
import {
  ensureMotionAnim,
  getMotionAnimDuration,
  addMotionAnimSegment,
  updateMotionAnimSegment,
  removeMotionAnimSegment,
  syncMotionAnimStartFromObject,
} from '../domain/motion/motionAnim.js';
import { mountRotYChips } from './rotYChips.js';

/**
 * Solo motion segment editor (group-like, no formation).
 *
 * @param {{
 *   onPickPoint?: (opts: {
 *     mode: 'from' | 'segmentAnchor',
 *     motionId: string,
 *     segmentId?: string | null,
 *     onPicked: (pt: { x: number, z: number }) => void,
 *   }) => void,
 *   onApply?: (motionId: string) => void | Promise<void>,
 *   onChange?: () => void,
 * }} opts
 */
export function createMotionAnimSection(opts = {}) {
  const root = document.createElement('div');
  root.className = 'sb-motion-anim';
  root.innerHTML = `
    <div class="sb-ens-subtitle" data-role="anim-sub">이동·대기·퇴장 · 포메이션 없음</div>
    <div data-role="anim-body"></div>
    <div class="sb-ens-actions" style="margin-top:6px">
      <button type="button" class="sb-chip seg-move" data-act="seg-move">+ 이동</button>
      <button type="button" class="sb-chip seg-hold" data-act="seg-hold">+ 대기</button>
      <button type="button" class="sb-chip seg-exit" data-act="seg-exit">+ 퇴장</button>
    </div>
    <div class="sb-ens-actions">
      <button type="button" class="sb-chip" data-act="sync-start" title="기즈모 위치를 시작으로">현재 위치 → 시작</button>
      <button type="button" class="sb-chip acc go" data-act="apply">구간 적용 (키프레임)</button>
    </div>
  `;

  const bodyEl = root.querySelector('[data-role="anim-body"]');
  const subEl = root.querySelector('[data-role="anim-sub"]');

  /** @type {import('../domain/motion/MotionDirector.js').MotionItem | null} */
  let motion = null;

  function bind(item) {
    motion = item;
    render();
  }

  function clear() {
    motion = null;
    bodyEl.innerHTML = '';
  }

  function render() {
    if (!motion) {
      bodyEl.innerHTML = '';
      return;
    }
    const anim = ensureMotionAnim(motion);
    const total = getMotionAnimDuration(anim);
    subEl.textContent = `시작 ${Number(anim.startTime || 0).toFixed(1)}s · 총 ${total.toFixed(1)}s · 포메이션 없음`;

    const segs = anim.segments;
    const selId = anim.selectedSegmentId || segs[0]?.id;

    let html = `
      <div class="sb-ens-seg-card sb-ens-seg-start">
        <div class="sb-ens-seg-hd"><strong>시작 위치</strong></div>
        <div class="sb-ens-seg-body">
          <div class="sb-ens-seg-fields">
            <label>시작 시각<input type="number" data-anim="startTime" step="0.1" min="0" value="${fmtCoord(anim.startTime || 0)}" /></label>
            <label>From X<input type="number" data-anim="fromX" step="0.1" value="${fmtCoord(anim.fromX || 0)}" /></label>
            <label>From Z<input type="number" data-anim="fromZ" step="0.1" value="${fmtCoord(anim.fromZ || 0)}" /></label>
            <label>Opacity<input type="number" data-anim="opacity" min="0" max="1" step="0.01" value="${clamp01(anim.opacity ?? 1)}" /></label>
          </div>
          <button type="button" class="sb-stage-pick-btn sb-ens-pick" data-act="pick-from">
            <span class="sb-stage-pick-ico">◎</span>
            <span><strong>시작 위치 (무대 클릭)</strong><small>버튼을 누른 뒤 무대 클릭</small></span>
          </button>
          <div class="sb-ens-seg-row">
            <div class="sb-ens-subtitle">Y 회전</div>
            <div data-role="from-rot"></div>
          </div>
        </div>
      </div>
    `;

    segs.forEach((seg, idx) => {
      const kind = seg.kind || 'move';
      const isHold = kind === 'hold';
      const isExit = kind === 'exit';
      const isSel = seg.id === selId;
      const selected = isSel ? ' is-selected' : ' is-collapsed';
      const axLbl = isExit ? '퇴장 X' : '끝 X';
      const azLbl = isExit ? '퇴장 Z' : '끝 Z';
      const pickLbl = isExit ? '퇴장 위치' : '끝 위치';
      const summary = isHold
        ? `${fmtCoord(seg.duration || 0)}s · 대기`
        : `${fmtCoord(seg.duration || 0)}s · X ${fmtCoord(seg.anchorX || 0)} · Z ${fmtCoord(seg.anchorZ || 0)}`;

      html += `
        <div class="sb-ens-seg-card sb-ens-seg--${escapeAttr(kind)}${selected}" data-seg-card="${escapeAttr(seg.id)}">
          <div class="sb-ens-seg-hd">
            <strong>${idx + 1}. ${SEGMENT_KIND_LABELS[kind] || kind}</strong>
            <span class="sb-chip sb-seg-kind ${escapeAttr(kind)}">${SEGMENT_KIND_LABELS[kind] || kind}</span>
            ${segs.length > 1 ? `<button type="button" class="sb-chip del" data-act="seg-rm" data-id="${escapeAttr(seg.id)}">삭제</button>` : ''}
          </div>
          <div class="sb-ens-seg-summary">${summary}</div>
          <div class="sb-ens-seg-body">
            <div class="sb-ens-seg-fields">
              <label>Duration<input type="number" data-seg="duration" data-id="${escapeAttr(seg.id)}" step="0.1" min="0.1" value="${fmtCoord(seg.duration || 3)}" /></label>
              ${isHold ? '' : `
                <label>${axLbl}<input type="number" data-seg="anchorX" data-id="${escapeAttr(seg.id)}" step="0.1" value="${fmtCoord(seg.anchorX || 0)}" /></label>
                <label>${azLbl}<input type="number" data-seg="anchorZ" data-id="${escapeAttr(seg.id)}" step="0.1" value="${fmtCoord(seg.anchorZ || 0)}" /></label>
              `}
            </div>
            ${isHold ? '<div class="sb-ens-empty">자세 유지 (직전 위치)</div>' : `
              <button type="button" class="sb-stage-pick-btn sb-ens-pick" data-act="pick-seg" data-id="${escapeAttr(seg.id)}">
                <span class="sb-stage-pick-ico">◎</span>
                <span><strong>${pickLbl} (무대 클릭)</strong><small>버튼을 누른 뒤 무대 클릭</small></span>
              </button>
              <div class="sb-ens-seg-row">
                <div class="sb-ens-subtitle">Y 회전</div>
                <div data-rot="${escapeAttr(seg.id)}"></div>
              </div>
              <div class="sb-ens-seg-row">
                <div class="sb-ens-subtitle">Easing</div>
                <div data-ease="${escapeAttr(seg.id)}"></div>
              </div>
            `}
          </div>
        </div>`;
    });

    bodyEl.innerHTML = html;

    mountRotYChips(
      bodyEl.querySelector('[data-role="from-rot"]'),
      anim.fromRotY || 0,
      (deg) => {
        anim.fromRotY = normalizeRotYDeg(deg);
        opts.onChange?.();
        render();
      },
    );

    segs.forEach((seg) => {
      if (seg.kind === 'hold') return;
      mountRotYChips(
        bodyEl.querySelector(`[data-rot="${CSS.escape(seg.id)}"]`),
        seg.toRotY || 0,
        (deg) => {
          updateMotionAnimSegment(anim, seg.id, { toRotY: deg });
          opts.onChange?.();
          render();
        },
      );
      mountEaseChips(
        bodyEl.querySelector(`[data-ease="${CSS.escape(seg.id)}"]`),
        seg.easing || 'smooth',
        (ease) => {
          updateMotionAnimSegment(anim, seg.id, { easing: ease });
          opts.onChange?.();
          render();
        },
      );
    });
  }

  bodyEl.addEventListener('change', (e) => {
    if (!motion) return;
    const anim = ensureMotionAnim(motion);
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.matches?.('[data-anim]')) {
      const key = t.getAttribute('data-anim');
      let val = Number(/** @type {HTMLInputElement} */ (t).value);
      if (!key || !Number.isFinite(val)) return;
      if (key === 'opacity') val = clamp01(val);
      else if (key === 'fromX' || key === 'fromZ' || key === 'startTime') val = roundCoord(val);
      anim[key] = val;
      opts.onChange?.();
      if (key === 'startTime') {
        subEl.textContent = `시작 ${Number(anim.startTime || 0).toFixed(1)}s · 총 ${getMotionAnimDuration(anim).toFixed(1)}s · 포메이션 없음`;
      }
      return;
    }
    if (t.matches?.('[data-seg]')) {
      const key = t.getAttribute('data-seg');
      const id = t.getAttribute('data-id');
      let val = Number(/** @type {HTMLInputElement} */ (t).value);
      if (!key || !id || !Number.isFinite(val)) return;
      if (key === 'anchorX' || key === 'anchorZ' || key === 'duration') val = roundCoord(val);
      updateMotionAnimSegment(anim, id, { [key]: val });
      opts.onChange?.();
      subEl.textContent = `시작 ${Number(anim.startTime || 0).toFixed(1)}s · 총 ${getMotionAnimDuration(anim).toFixed(1)}s · 포메이션 없음`;
    }
  });

  bodyEl.addEventListener('click', (e) => {
    if (!motion) return;
    const card = e.target.closest?.('[data-seg-card]');
    if (card && !e.target.closest?.('[data-act], input, button')) {
      ensureMotionAnim(motion).selectedSegmentId = card.getAttribute('data-seg-card');
      render();
    }
  });

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest?.('[data-act]');
    if (!btn || !motion) return;
    const act = btn.dataset.act;
    const anim = ensureMotionAnim(motion);

    if (act === 'seg-move' || act === 'seg-hold' || act === 'seg-exit') {
      const kind = act === 'seg-move' ? 'move' : act === 'seg-hold' ? 'hold' : 'exit';
      addMotionAnimSegment(anim, kind);
      opts.onChange?.();
      render();
      return;
    }
    if (act === 'seg-rm') {
      removeMotionAnimSegment(anim, btn.dataset.id);
      opts.onChange?.();
      render();
      return;
    }
    if (act === 'sync-start') {
      syncMotionAnimStartFromObject(motion);
      opts.onChange?.();
      render();
      return;
    }
    if (act === 'pick-from') {
      opts.onPickPoint?.({
        mode: 'from',
        motionId: motion.id,
        onPicked: (pt) => {
          anim.fromX = roundCoord(pt.x);
          anim.fromZ = roundCoord(pt.z);
          opts.onChange?.();
          render();
        },
      });
      return;
    }
    if (act === 'pick-seg') {
      const segId = btn.dataset.id;
      if (!segId) return;
      anim.selectedSegmentId = segId;
      opts.onPickPoint?.({
        mode: 'segmentAnchor',
        motionId: motion.id,
        segmentId: segId,
        onPicked: (pt) => {
          updateMotionAnimSegment(anim, segId, { anchorX: roundCoord(pt.x), anchorZ: roundCoord(pt.z) });
          opts.onChange?.();
          render();
        },
      });
      return;
    }
    if (act === 'apply') {
      btn.disabled = true;
      try {
        await opts.onApply?.(motion.id);
      } finally {
        btn.disabled = false;
      }
    }
  });

  return { root, bind, clear, render };
}

function mountEaseChips(host, current, onPick) {
  if (!host) return;
  const kinds = [SEGMENT_EASING.smooth, SEGMENT_EASING.linear];
  host.innerHTML = kinds.map((k) => `
    <button type="button" class="sb-chip${k === current ? ' on' : ''}" data-ease-pick="${k}">${SEGMENT_EASING_LABELS[k]}</button>
  `).join('');
  host.querySelectorAll('[data-ease-pick]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onPick(b.getAttribute('data-ease-pick'));
    });
  });
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.min(1, Math.max(0, v));
}

function roundCoord(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function fmtCoord(n) {
  return String(roundCoord(n));
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
