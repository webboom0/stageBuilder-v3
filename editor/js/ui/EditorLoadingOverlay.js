/**
 * Full-screen boot overlay — blocks interaction until stage/scene ready.
 */
export function createEditorLoadingOverlay() {
  const root = document.createElement('div');
  root.className = 'sb-editor-loading';
  root.hidden = true;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = `
    <div class="sb-editor-loading__box">
      <div class="sb-editor-loading__spinner" aria-hidden="true"></div>
      <p class="sb-editor-loading__msg" data-role="msg">불러오는 중…</p>
    </div>
  `;
  document.body.appendChild(root);

  const msgEl = root.querySelector('[data-role="msg"]');

  return {
    show(message = '불러오는 중…') {
      if (msgEl) msgEl.textContent = message;
      root.hidden = false;
      document.body.classList.add('sb-editor--booting');
    },
    setMessage(message) {
      if (msgEl) msgEl.textContent = message;
    },
    hide() {
      root.hidden = true;
      document.body.classList.remove('sb-editor--booting');
    },
  };
}
