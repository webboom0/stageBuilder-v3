import { API, apiUrl } from '../../config/app-config.js';

/**
 * Simple modal to pick an FBX from the server library.
 * @returns {Promise<{ url: string, name: string } | null>}
 */
export function pickMotionFbx() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sb-motion-pick-overlay';
    overlay.innerHTML = `
      <div class="sb-motion-pick" role="dialog" aria-label="모션 FBX 선택">
        <div class="sb-motion-pick-head">
          <strong>모션 추가 (FBX)</strong>
          <button type="button" class="sb-motion-pick-x" data-act="cancel" aria-label="닫기">×</button>
        </div>
        <p class="sb-motion-pick-hint">서버 <code>files/fbx</code> · 등장/퇴장은 그룹 구간·opacity 키</p>
        <div class="sb-motion-pick-list" data-role="list">불러오는 중…</div>
        <div class="sb-motion-pick-foot">
          <button type="button" data-act="cancel">취소</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const finish = (value) => {
      overlay.remove();
      resolve(value);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(null);
    });
    overlay.querySelectorAll('[data-act="cancel"]').forEach((btn) => {
      btn.addEventListener('click', () => finish(null));
    });

    loadList(overlay.querySelector('[data-role="list"]'), finish);
  });
}

/**
 * @param {HTMLElement} listEl
 * @param {(v: { url: string, name: string } | null) => void} finish
 */
async function loadList(listEl, finish) {
  try {
    const res = await fetch(apiUrl(API.fbxFiles), { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    /** @type {Array<{ name?: string, filename?: string, path?: string }>} */
    const files = await res.json();
    if (!files.length) {
      listEl.innerHTML = '<p class="sb-motion-pick-empty">FBX 없음 — <code>server/files/fbx</code>에 파일을 넣으세요.</p>';
      return;
    }
    listEl.innerHTML = files.map((f) => {
      const filename = f.filename || f.name || '';
      const label = (f.name || filename).replace(/\.fbx$/i, '');
      const path = f.path || `/files/fbx/${filename}`;
      const href = path.startsWith('http') ? path : apiUrl(path);
      return `<button type="button" class="sb-motion-pick-item" data-url="${escapeAttr(href)}" data-name="${escapeAttr(label)}">${escapeHtml(label)}</button>`;
    }).join('');

    listEl.querySelectorAll('.sb-motion-pick-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        finish({
          url: btn.getAttribute('data-url') || '',
          name: btn.getAttribute('data-name') || 'Motion',
        });
      });
    });
  } catch (err) {
    listEl.innerHTML = `<p class="sb-motion-pick-empty">목록 실패: ${escapeHtml(err.message)}. 서버를 켜 주세요.</p>`;
  }
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
