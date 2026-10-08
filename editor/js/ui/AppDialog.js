/**
 * StageBuilder common modal — confirm / prompt / alert (replaces window.*).
 *
 * @typedef {{
 *   mode?: 'confirm' | 'prompt' | 'alert',
 *   title?: string,
 *   message?: string,
 *   defaultValue?: string,
 *   placeholder?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   danger?: boolean,
 * }} AppDialogOptions
 */

/**
 * @param {AppDialogOptions} [opts]
 * @returns {Promise<boolean | string | null>}
 *   confirm → boolean · prompt → string|null · alert → true
 */
export function showAppDialog(opts = {}) {
  const mode = opts.mode || 'confirm';
  const title = opts.title || (mode === 'prompt' ? '입력' : mode === 'alert' ? '알림' : '확인');
  const message = opts.message || '';
  const confirmLabel = opts.confirmLabel || '확인';
  const cancelLabel = opts.cancelLabel || '취소';
  const defaultValue = opts.defaultValue ?? '';
  const placeholder = opts.placeholder || '';

  return new Promise((resolve) => {
    document.querySelector('.sb-app-dialog-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'sb-app-dialog-overlay';
    overlay.setAttribute('role', 'presentation');

    const panel = document.createElement('div');
    panel.className = 'sb-app-dialog'
      + (opts.danger ? ' is-danger' : '')
      + (mode === 'alert' ? ' is-alert' : '');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'sb-app-dialog-title');

    const inputHtml = mode === 'prompt'
      ? `<input class="sb-app-dialog__input" type="text" data-role="input"
           value="${escapeAttr(defaultValue)}" placeholder="${escapeAttr(placeholder)}" autocomplete="off" />`
      : '';

    const cancelHtml = mode === 'alert'
      ? ''
      : `<button type="button" class="sb-app-dialog__btn sb-app-dialog__btn--cancel" data-act="cancel">${escapeHtml(cancelLabel)}</button>`;

    panel.innerHTML = `
      <h2 id="sb-app-dialog-title" class="sb-app-dialog__title">${escapeHtml(title)}</h2>
      ${message ? `<p class="sb-app-dialog__message">${escapeHtml(message).replace(/\n/g, '<br>')}</p>` : ''}
      ${inputHtml}
      <div class="sb-app-dialog__actions">
        ${cancelHtml}
        <button type="button" class="sb-app-dialog__btn sb-app-dialog__btn--confirm" data-act="confirm">${escapeHtml(confirmLabel)}</button>
      </div>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const input = /** @type {HTMLInputElement | null} */ (panel.querySelector('[data-role="input"]'));
    const confirmBtn = /** @type {HTMLButtonElement | null} */ (panel.querySelector('[data-act="confirm"]'));

    let settled = false;
    const close = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(result);
    };

    const onConfirm = () => {
      if (mode === 'prompt') {
        const v = (input?.value ?? '').trim();
        if (!v) {
          input?.focus();
          input?.select();
          return;
        }
        close(v);
        return;
      }
      close(true);
    };

    const onCancel = () => {
      close(mode === 'prompt' ? null : false);
    };

    panel.querySelector('[data-act="confirm"]')?.addEventListener('click', onConfirm);
    panel.querySelector('[data-act="cancel"]')?.addEventListener('click', onCancel);
    panel.addEventListener('click', (e) => e.stopPropagation());
    // click outside does not dismiss — matches deliberate confirm/prompt usage

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (mode === 'alert') onConfirm();
        else onCancel();
        return;
      }
      if (e.key === 'Enter' && !e.isComposing) {
        if (mode === 'prompt' && document.activeElement === input) {
          e.preventDefault();
          onConfirm();
        } else if (mode !== 'prompt' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          onConfirm();
        }
      }
    }
    document.addEventListener('keydown', onKey, true);

    requestAnimationFrame(() => {
      if (input) {
        input.focus();
        input.select();
      } else {
        confirmBtn?.focus();
      }
    });
  });
}

/**
 * @param {string | AppDialogOptions} titleOrOpts
 * @param {string} [message]
 * @returns {Promise<boolean>}
 */
export function appConfirm(titleOrOpts, message) {
  const opts = typeof titleOrOpts === 'string'
    ? { title: titleOrOpts, message: message || '' }
    : { ...titleOrOpts };
  return showAppDialog({ ...opts, mode: 'confirm' }).then((v) => v === true);
}

/**
 * @param {string | AppDialogOptions} titleOrOpts
 * @param {string} [defaultValue]
 * @param {string} [message]
 * @returns {Promise<string | null>}
 */
export function appPrompt(titleOrOpts, defaultValue = '', message = '') {
  const opts = typeof titleOrOpts === 'string'
    ? { title: titleOrOpts, defaultValue, message }
    : { ...titleOrOpts };
  return showAppDialog({ ...opts, mode: 'prompt' }).then((v) => (
    typeof v === 'string' ? v : null
  ));
}

/**
 * @param {string | AppDialogOptions} titleOrOpts
 * @param {string} [message]
 * @returns {Promise<void>}
 */
export function appAlert(titleOrOpts, message) {
  const opts = typeof titleOrOpts === 'string'
    ? { title: titleOrOpts, message: message || '' }
    : { ...titleOrOpts };
  return showAppDialog({ ...opts, mode: 'alert' }).then(() => undefined);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}
