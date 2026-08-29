/**
 * @param {{
 *   mode: 'scene' | 'all',
 *   sceneName?: string,
 *   sceneCount?: number,
 *   durationSec?: number,
 *   fps?: number,
 *   defaultCamera?: string,
 * }} opts
 * @returns {Promise<{ cameraPresetId: string } | null>}
 */
export function showRenderDialog(opts) {
  const mode = opts.mode || 'scene';
  const title = mode === 'all' ? '전체 씬 렌더' : '현재 씬 렌더';
  const dur = Number.isFinite(opts.durationSec) ? opts.durationSec : 0;
  const fps = Number.isFinite(opts.fps) ? opts.fps : 30;
  const durLine = dur > 0
    ? `타임라인 <strong>${dur.toFixed(0)}초</strong> · ${fps} fps`
    : '';
  const subtitle = mode === 'all'
    ? `프로젝트 씬 ${opts.sceneCount ?? 0}개를 순서대로 WebM으로 내보냅니다.${durLine ? `<br>${durLine}` : ''}`
    : `「${escapeHtml(opts.sceneName || '현재 씬')}」을 WebM으로 녹화합니다.${durLine ? `<br>${durLine}` : ''}`;

  return new Promise((resolve) => {
    document.querySelector('.sb-render-dialog-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'sb-project-setup-overlay sb-render-dialog-overlay';

    const popup = document.createElement('div');
    popup.className = 'sb-project-setup-popup sb-render-dialog';
    popup.innerHTML = `
      <h2 class="sb-project-setup__title">${title}</h2>
      <p class="sb-project-setup__subtitle">${subtitle}</p>
      <form class="sb-project-setup__form" novalidate>
        <div class="sb-project-field">
          <label class="sb-project-label" for="sb-render-camera">카메라</label>
          <select class="sb-project-input" id="sb-render-camera" name="camera">
            <option value="active">현재 시점 (자유)</option>
            <option value="audience">객석</option>
            <option value="front">정면</option>
            <option value="left">좌측</option>
            <option value="right">우측</option>
            <option value="top">상단</option>
            <option value="perspective">원근</option>
          </select>
        </div>
        <p class="sb-render-note">처음부터 끝까지 재생하며 메인 뷰포트를 녹화합니다. 상단·좌/우 시점은 구조물이 자동 처리됩니다. 오디오는 영상에 포함되지 않습니다.</p>
        <div class="sb-project-setup__actions">
          <button type="button" class="sb-project-btn sb-project-btn--cancel">취소</button>
          <button type="submit" class="sb-project-btn sb-project-btn--submit">렌더 시작</button>
        </div>
      </form>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    const cameraEl = /** @type {HTMLSelectElement} */ (popup.querySelector('#sb-render-camera'));
    if (opts.defaultCamera) cameraEl.value = opts.defaultCamera;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    popup.querySelector('.sb-project-btn--cancel')?.addEventListener('click', () => close(null));
    popup.addEventListener('click', (e) => e.stopPropagation());

    popup.querySelector('form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      close({ cameraPresetId: cameraEl.value || 'active' });
    });
  });
}

/**
 * @param {{
 *   title?: string,
 *   onCancel?: () => void,
 * }} [opts]
 */
export function createRenderProgressOverlay(opts = {}) {
  document.querySelector('.sb-render-progress-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'sb-render-progress-overlay';
  overlay.innerHTML = `
    <div class="sb-render-progress">
      <h2 class="sb-render-progress__title">${escapeHtml(opts.title || '렌더 중…')}</h2>
      <p class="sb-render-progress-status" aria-live="polite">준비 중…</p>
      <div class="sb-render-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100">
        <div class="sb-render-progress-fill"></div>
      </div>
      <p class="sb-render-progress-hint">뷰포트에서 녹화 미리보기를 확인할 수 있습니다.</p>
      <div class="sb-render-progress__actions">
        <button type="button" class="sb-project-btn sb-project-btn--cancel">취소</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const statusEl = /** @type {HTMLElement} */ (overlay.querySelector('.sb-render-progress-status'));
  const fillEl = /** @type {HTMLElement} */ (overlay.querySelector('.sb-render-progress-fill'));
  const cancelBtn = /** @type {HTMLButtonElement | null} */ (overlay.querySelector('.sb-project-btn--cancel'));
  let cancelled = false;
  /** @type {Set<() => void>} */
  const abortListeners = new Set();

  const requestCancel = () => {
    if (cancelled) return;
    cancelled = true;
    if (cancelBtn) {
      cancelBtn.disabled = true;
      cancelBtn.textContent = '취소 중…';
    }
    statusEl.textContent = '취소 중…';
    opts.onCancel?.();
    for (const fn of abortListeners) {
      try { fn(); } catch (err) { console.error(err); }
    }
  };

  cancelBtn?.addEventListener('click', requestCancel);

  return {
    isCancelled: () => cancelled,
    onAbort(fn) {
      abortListeners.add(fn);
      if (cancelled) fn();
      return () => abortListeners.delete(fn);
    },
    setStatus(msg) {
      statusEl.textContent = msg;
    },
    setProgress(pct, detail = '') {
      const p = Math.max(0, Math.min(100, pct));
      fillEl.style.width = `${p}%`;
      overlay.querySelector('.sb-render-progress-bar')?.setAttribute('aria-valuenow', String(Math.round(p)));
      if (detail) statusEl.textContent = detail;
    },
    close() {
      overlay.remove();
    },
  };
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
