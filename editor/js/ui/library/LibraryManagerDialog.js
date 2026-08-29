import { loadGlobalLibrary, libraryFolderHint } from '../../domain/assets/globalLibrary.js';
import {
  LIBRARY_UPLOAD_RULES,
  validateLibraryUpload,
  uploadGlobalLibraryAsset,
  deleteGlobalLibraryAsset,
} from '../../domain/assets/globalLibraryApi.js';
import { probePropApiAvailable } from '../../domain/motion/propCatalog.js';

/**
 * 공용 assets 라이브러리(`files/`) — 목록 · 업로드 · 삭제.
 *
 * @param {'character' | 'stage' | 'video' | 'audio'} tab
 * @param {{ onChanged?: () => void | Promise<void> }} [opts]
 * @returns {Promise<void>}
 */
export function showLibraryManagerDialog(tab, opts = {}) {
  return new Promise((resolve) => {
    const rules = LIBRARY_UPLOAD_RULES[tab];
    const overlay = document.createElement('div');
    overlay.className = 'sb-library-overlay';
    overlay.innerHTML = `
      <div class="sb-library-dlg" role="dialog" aria-modal="true" aria-label="${escapeAttr(rules.label)} 라이브러리">
        <div class="sb-library-head">
          <div>
            <strong class="sb-library-title">${escapeHtml(rules.label)} 라이브러리</strong>
            <p class="sb-library-sub">서버 <code>${escapeHtml(libraryFolderHint(tab))}</code> · ${escapeHtml(rules.extHint)} · 최대 ${escapeHtml(rules.maxLabel)}</p>
          </div>
          <button type="button" class="sb-tl-help-close" data-act="close" aria-label="닫기">×</button>
        </div>
        <div class="sb-library-toolbar">
          <button type="button" class="sb-library-btn" data-act="refresh" title="목록 새로고침">↻ 새로고침</button>
          <label class="sb-library-btn sb-library-btn-primary" title="파일 업로드">
            ⬆ 업로드
            <input type="file" data-role="file" hidden />
          </label>
          <button type="button" class="sb-library-btn sb-library-btn-danger" data-act="delete" disabled title="선택 파일 삭제">🗑 삭제</button>
          <span class="sb-library-status" data-role="status">불러오는 중…</span>
        </div>
        <div class="sb-library-list" data-role="list"></div>
        <div class="sb-library-foot">
          <button type="button" class="sb-tl-btn" data-act="close">닫기</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const listEl = overlay.querySelector('[data-role="list"]');
    const statusEl = overlay.querySelector('[data-role="status"]');
    const deleteBtn = /** @type {HTMLButtonElement} */ (overlay.querySelector('[data-act="delete"]'));
    const fileInput = /** @type {HTMLInputElement} */ (overlay.querySelector('[data-role="file"]'));
    /** @type {Array<{ filename: string, displayName?: string, name?: string }>} */
    let items = [];
    /** @type {string | null} */
    let selectedFilename = null;
    /** @type {boolean | null} */
    let propApiAvailable = tab === 'stage' ? null : true;
    let settled = false;
    let loadGen = 0;

    fileInput.accept = acceptForTab(tab);

    function finish() {
      if (settled) return;
      settled = true;
      overlay.remove();
      resolve();
    }

    function setStatus(text) {
      statusEl.textContent = text;
    }

    function renderList() {
      deleteBtn.disabled = !selectedFilename;
      if (!items.length) {
        listEl.innerHTML = '<div class="sb-library-empty">파일이 없습니다. 업로드로 추가하세요.</div>';
        return;
      }
      listEl.innerHTML = items.map((it) => {
        const fn = it.filename || '';
        const label = it.displayName || it.name || fn;
        const sel = selectedFilename === fn ? ' is-selected' : '';
        return `
          <div class="sb-library-item${sel}" data-fn="${escapeAttr(fn)}" role="button" tabindex="0">
            <span class="sb-library-item-name">${escapeHtml(label)}</span>
            <span class="sb-library-item-fn">${escapeHtml(fn)}</span>
          </div>`;
      }).join('');
    }

    async function reloadList() {
      const gen = ++loadGen;
      setStatus('불러오는 중…');
      try {
        if (tab === 'stage' && propApiAvailable === null) {
          propApiAvailable = await probePropApiAvailable();
        }
        const next = await loadGlobalLibrary(tab);
        if (gen !== loadGen) return;
        items = next;
        if (selectedFilename && !items.some((it) => it.filename === selectedFilename)) {
          selectedFilename = null;
        }
        setStatus(items.length ? `${items.length}개` : '없음');
        renderList();
      } catch (err) {
        if (gen !== loadGen) return;
        setStatus('실패');
        listEl.innerHTML = `<div class="sb-library-empty">${escapeHtml(err.message || '목록 실패')}</div>`;
      }
    }

    async function notifyChanged() {
      try {
        await opts.onChanged?.();
      } catch (err) {
        console.error(err);
      }
    }

    listEl.addEventListener('click', (e) => {
      const row = e.target.closest?.('.sb-library-item');
      if (!row?.dataset.fn) return;
      selectedFilename = row.dataset.fn;
      renderList();
    });

    listEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest?.('.sb-library-item');
      if (!row?.dataset.fn) return;
      e.preventDefault();
      selectedFilename = row.dataset.fn;
      renderList();
    });

    overlay.querySelector('[data-act="refresh"]')?.addEventListener('click', () => {
      void reloadList();
    });

    overlay.querySelectorAll('[data-act="close"]').forEach((btn) => {
      btn.addEventListener('click', finish);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish();
    });

    window.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', onKey);
        finish();
      }
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;

      if (tab === 'stage' && propApiAvailable === null) {
        propApiAvailable = await probePropApiAvailable();
      }

      const clientErr = validateLibraryUpload(file, tab, { propApiAvailable });
      if (clientErr) {
        window.alert(clientErr);
        return;
      }

      setStatus('업로드 중…');
      try {
        await uploadGlobalLibraryAsset(tab, file, { propApiAvailable });
        await reloadList();
        await notifyChanged();
        setStatus('업로드 OK');
      } catch (err) {
        console.error(err);
        setStatus('업로드 실패');
        window.alert(`업로드 실패\n\n${err?.message || err}`);
      }
    });

    deleteBtn.addEventListener('click', async () => {
      if (!selectedFilename) {
        window.alert('삭제할 파일을 선택하세요.');
        return;
      }
      if (!window.confirm(`라이브러리에서 삭제할까요?\n\n${selectedFilename}\n\n(프로젝트에 이미 복사된 파일은 유지됩니다.)`)) {
        return;
      }
      deleteBtn.disabled = true;
      setStatus('삭제 중…');
      try {
        await deleteGlobalLibraryAsset(tab, selectedFilename, { propApiAvailable });
        selectedFilename = null;
        await reloadList();
        await notifyChanged();
        setStatus('삭제됨');
      } catch (err) {
        console.error(err);
        setStatus('삭제 실패');
        window.alert(`삭제 실패\n\n${err?.message || err}`);
        deleteBtn.disabled = !selectedFilename;
      }
    });

    void reloadList();
  });
}

/** @param {'character' | 'stage' | 'video' | 'audio'} tab */
function acceptForTab(tab) {
  if (tab === 'character') return '.fbx';
  if (tab === 'stage') return '.fbx,.obj';
  if (tab === 'video') return 'video/*,.mp4,.webm,.mov';
  return 'audio/*,.mp3,.wav,.ogg,.m4a';
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
