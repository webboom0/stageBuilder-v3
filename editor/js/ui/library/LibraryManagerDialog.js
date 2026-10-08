import { loadGlobalLibrary, libraryFolderHint } from '../../domain/assets/globalLibrary.js';
import {
  LIBRARY_UPLOAD_RULES,
  validateLibraryUpload,
  uploadGlobalLibraryAsset,
  deleteGlobalLibraryAsset,
} from '../../domain/assets/globalLibraryApi.js';
import { probePropApiAvailable } from '../../domain/motion/propCatalog.js';
import { formatUploadFailureAlert } from '../../domain/assets/uploadError.js';
import { getPropThumbnailDataUrl, getCharacterThumbnailDataUrl } from '../../domain/assets/propThumbnail.js';
import { getVideoThumbnailDataUrl } from '../../domain/assets/mediaThumbnail.js';
import { appConfirm } from '../AppDialog.js';

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
    const supportsViews = tab === 'character' || tab === 'stage' || tab === 'video';
    /** @type {'list' | 'grid'} */
    let libView = supportsViews
      ? (localStorage.getItem('sb-assets-lib-view') === 'grid' ? 'grid' : 'list')
      : 'list';
    let thumbGen = 0;
    /** @type {'list' | 'grid' | null} */
    let renderedView = null;

    const libTitle = `${rules.label} 공용 라이브러리`;
    const viewToggleHtml = supportsViews ? `
      <div class="sb-assets-lib-views" role="group" aria-label="보기 방식">
        <button type="button" class="sb-assets-lib-view-btn${libView === 'list' ? ' is-on' : ''}"
          data-act="lib-view" data-view="list" title="리스트형" aria-pressed="${libView === 'list' ? 'true' : 'false'}">
          <i class="fas fa-list" aria-hidden="true"></i>
        </button>
        <button type="button" class="sb-assets-lib-view-btn${libView === 'grid' ? ' is-on' : ''}"
          data-act="lib-view" data-view="grid" title="카드형" aria-pressed="${libView === 'grid' ? 'true' : 'false'}">
          <i class="fas fa-th" aria-hidden="true"></i>
        </button>
      </div>` : '';

    const overlay = document.createElement('div');
    overlay.className = 'sb-library-overlay';
    overlay.innerHTML = `
      <div class="sb-library-dlg sb-library-dlg--${libView}" role="dialog" aria-modal="true" aria-label="${escapeAttr(libTitle)}">
        <div class="sb-library-head">
          <div class="sb-library-head-text">
            <strong class="sb-library-title">${escapeHtml(libTitle)}</strong>
            <p class="sb-library-sub">서버 <code>${escapeHtml(libraryFolderHint(tab))}</code> · ${escapeHtml(rules.extHint)} · 최대 ${escapeHtml(rules.maxLabel)}</p>
          </div>
          <div class="sb-library-head-right">
            ${viewToggleHtml}
            <button type="button" class="sb-tl-help-close" data-act="close" aria-label="닫기">×</button>
          </div>
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
        <div class="sb-library-list" data-role="list" data-view="${libView}"></div>
        <div class="sb-library-foot">
          <button type="button" class="sb-tl-btn" data-act="close">닫기</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const dlg = /** @type {HTMLElement} */ (overlay.querySelector('.sb-library-dlg'));
    const listEl = /** @type {HTMLElement} */ (overlay.querySelector('[data-role="list"]'));
    const statusEl = overlay.querySelector('[data-role="status"]');
    const deleteBtn = /** @type {HTMLButtonElement} */ (overlay.querySelector('[data-act="delete"]'));
    const fileInput = /** @type {HTMLInputElement} */ (overlay.querySelector('[data-role="file"]'));
    /** @type {Array<{ filename: string, displayName?: string, name?: string, url?: string }>} */
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

    function libTypeIcon() {
      if (tab === 'video') return 'fa-video';
      if (tab === 'audio') return 'fa-music';
      return 'fa-cube';
    }

    function syncChrome() {
      deleteBtn.disabled = !selectedFilename;
      listEl.dataset.view = libView;
      dlg.classList.toggle('sb-library-dlg--list', libView === 'list');
      dlg.classList.toggle('sb-library-dlg--grid', libView === 'grid');
      overlay.querySelectorAll('[data-act="lib-view"]').forEach((btn) => {
        const on = btn.getAttribute('data-view') === libView;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function syncSelection() {
      listEl.querySelectorAll('.sb-library-item, .sb-library-card').forEach((el) => {
        el.classList.toggle('is-selected', el.dataset.fn === selectedFilename);
      });
      deleteBtn.disabled = !selectedFilename;
    }

    function hydrateThumbnails() {
      const gen = ++thumbGen;
      listEl.querySelectorAll('.sb-library-card-img').forEach((img) => {
        const fn = String(img.dataset.fn || '');
        const entry = items.find((it) => it.filename === fn);
        if (!entry) return;
        img.removeAttribute('src');
        img.classList.remove('is-loaded', 'is-failed');
        const load = tab === 'video'
          ? getVideoThumbnailDataUrl(entry.url)
          : tab === 'stage'
            ? getPropThumbnailDataUrl(entry)
            : getCharacterThumbnailDataUrl(entry);
        void load.then((dataUrl) => {
          if (gen !== thumbGen || !img.isConnected) return;
          if (dataUrl) {
            img.src = dataUrl;
            img.classList.add('is-loaded');
          } else {
            img.classList.add('is-failed');
          }
        });
      });
    }

    function renderList({ force = false } = {}) {
      syncChrome();
      if (!force && renderedView === libView && listEl.childElementCount) {
        syncSelection();
        return;
      }
      renderedView = libView;

      if (!items.length) {
        listEl.innerHTML = '<div class="sb-library-empty">파일이 없습니다. 업로드로 추가하세요.</div>';
        return;
      }

      if (libView === 'grid' && supportsViews) {
        listEl.innerHTML = items.map((it) => {
          const fn = it.filename || '';
          const label = it.displayName || it.name || fn;
          const sel = selectedFilename === fn ? ' is-selected' : '';
          return `
            <div class="sb-library-card${sel}" data-fn="${escapeAttr(fn)}" role="button" tabindex="0">
              <div class="sb-library-card-thumb">
                <img class="sb-library-card-img" data-fn="${escapeAttr(fn)}" alt="" />
              </div>
              <div class="sb-library-card-name" title="${escapeAttr(label)}">${escapeHtml(label)}</div>
            </div>`;
        }).join('');
        hydrateThumbnails();
        return;
      }

      const icon = libTypeIcon();
      listEl.innerHTML = items.map((it) => {
        const fn = it.filename || '';
        const label = it.displayName || it.name || fn;
        const sel = selectedFilename === fn ? ' is-selected' : '';
        return `
          <div class="sb-library-item${sel}" data-fn="${escapeAttr(fn)}" role="button" tabindex="0">
            <span class="sb-library-item-icon" aria-hidden="true"><i class="fas ${icon}"></i></span>
            <span class="sb-library-item-name">${escapeHtml(label)}</span>
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
        renderList({ force: true });
      } catch (err) {
        if (gen !== loadGen) return;
        setStatus('실패');
        renderedView = null;
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

    overlay.querySelectorAll('[data-act="lib-view"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.getAttribute('data-view') === 'grid' ? 'grid' : 'list';
        if (next === libView) return;
        libView = next;
        try { localStorage.setItem('sb-assets-lib-view', libView); } catch { /* ignore */ }
        renderList({ force: true });
      });
    });

    listEl.addEventListener('click', (e) => {
      const row = e.target.closest?.('.sb-library-item, .sb-library-card');
      if (!row?.dataset.fn) return;
      selectedFilename = row.dataset.fn;
      renderList();
    });

    listEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest?.('.sb-library-item, .sb-library-card');
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
        window.alert(formatUploadFailureAlert(err));
      }
    });

    deleteBtn.addEventListener('click', async () => {
      if (!selectedFilename) {
        window.alert('삭제할 파일을 선택하세요.');
        return;
      }
      if (!(await appConfirm({
        title: '라이브러리 삭제',
        message: `라이브러리에서 삭제할까요?\n\n${selectedFilename}\n\n(프로젝트에 이미 복사된 파일은 유지됩니다.)`,
        danger: true,
      }))) {
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
