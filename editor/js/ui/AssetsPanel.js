import { API, apiUrl } from '../config/app-config.js';
import { loadMotionCatalog } from '../domain/motion/motionCatalog.js';

/**
 * Assets panel — Motion / Video / Audio (v3 SidebarAssets).
 * Upload/delete only refresh the asset list (never full page reload).
 *
 * @param {{
 *   onAddMotion?: (entry: {
 *     url: string,
 *     name: string,
 *     procedural?: string,
 *     color?: number,
 *   }) => void | Promise<void>,
 *   onCatalogChanged?: () => void | Promise<void>,
 * }} [opts]
 */
export function createAssetsPanelBody(opts = {}) {
  const root = document.createElement('div');
  root.className = 'sb-panel-body sb-assets';
  root.innerHTML = `
    <div class="sb-assets-tabs" role="tablist">
      <button type="button" class="sb-assets-tab is-on" data-tab="motion" role="tab">Motion</button>
      <button type="button" class="sb-assets-tab" data-tab="video" role="tab">Video</button>
      <button type="button" class="sb-assets-tab" data-tab="audio" role="tab">Audio</button>
    </div>
    <div class="sb-assets-toolbar">
      <button type="button" class="sb-assets-refresh" data-act="refresh" title="목록 새로고침">↻</button>
      <label class="sb-assets-upload" title="업로드">
        ⬆
        <input type="file" data-role="file" hidden />
      </label>
      <button type="button" class="sb-assets-del" data-act="delete" title="선택 삭제">🗑</button>
      <span class="sb-assets-status" data-role="status">…</span>
    </div>
    <div class="sb-assets-list" data-role="list"></div>
    <p class="sb-assets-hint" data-role="hint">WalkLite 샘플 · FBX 업로드 · + 로 추가 · 색은 속성</p>
  `;

  const listEl = root.querySelector('[data-role="list"]');
  const statusEl = root.querySelector('[data-role="status"]');
  const hintEl = root.querySelector('[data-role="hint"]');
  const fileInput = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="file"]'));

  /** @type {'motion' | 'video' | 'audio'} */
  let tab = 'motion';
  /** @type {string | null} */
  let selectedKey = null;
  /** @type {any[]} */
  let items = [];
  /** @type {number} */
  let loadGen = 0;

  function acceptForTab() {
    if (tab === 'motion') return '.fbx';
    if (tab === 'video') return 'video/*,.mp4,.webm,.mov';
    return 'audio/*,.mp3,.wav,.ogg,.m4a';
  }

  function setTab(next) {
    tab = next;
    root.querySelectorAll('.sb-assets-tab').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.tab === tab);
    });
    fileInput.accept = acceptForTab();
    selectedKey = null;
    if (tab === 'motion') hintEl.textContent = 'WalkLite 샘플 · FBX 업로드 · + 로 추가 · 색은 속성';
    else if (tab === 'video') hintEl.textContent = 'Video 목록 · 업로드/삭제 (타임라인 Phase 5+)';
    else hintEl.textContent = 'Audio 목록 · 업로드/삭제 (타임라인 Phase 5)';
    refresh({ quiet: false });
  }

  function renderList() {
    if (!items.length) {
      listEl.innerHTML = `<div class="sb-assets-empty">${tab} 파일이 없습니다.</div>`;
      return;
    }
    listEl.innerHTML = items.map((it, i) => {
      const key = it.filename || it.url || String(i);
      const label = it.displayName || it.name || key;
      const badge = it.procedural ? '<span class="sb-assets-badge">샘플</span>' : '';
      const addBtn = tab === 'motion'
        ? `<button type="button" class="sb-assets-add" data-act="add" data-i="${i}" title="씬·타임라인에 추가">+</button>`
        : '';
      return `
        <div class="sb-assets-item ${selectedKey === key ? 'is-selected' : ''}"
          data-key="${escapeAttr(key)}" data-i="${i}">
          <span class="sb-assets-item-name">${escapeHtml(label)}${badge}</span>
          ${addBtn}
        </div>`;
    }).join('');
  }

  /**
   * Reload asset list only — does not navigate or remount the editor.
   * @param {{ quiet?: boolean, notifyCatalog?: boolean }} [opt]
   */
  async function refresh(opt = {}) {
    const quiet = !!opt.quiet;
    const notifyCatalog = opt.notifyCatalog !== false;
    const gen = ++loadGen;
    if (!quiet) statusEl.textContent = '불러오는 중…';
    try {
      let next = [];
      if (tab === 'motion') {
        next = await loadMotionCatalog();
      } else if (tab === 'video') {
        next = await loadMediaList(API.videoFiles, 'video');
      } else {
        next = await loadMediaList(API.audioFiles, 'audio');
      }
      if (gen !== loadGen) return; // stale
      items = next;
      if (selectedKey && !items.some((it) => (it.filename || it.url) === selectedKey)) {
        selectedKey = null;
      }
      if (!items.length) {
        statusEl.textContent = '없음';
      } else {
        statusEl.textContent = `${items.length}개`;
      }
      renderList();
      if (notifyCatalog && tab === 'motion') {
        await opts.onCatalogChanged?.();
      }
    } catch (err) {
      if (gen !== loadGen) return;
      statusEl.textContent = '실패';
      listEl.innerHTML = `<div class="sb-assets-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  listEl.addEventListener('click', async (e) => {
    e.preventDefault();
    const item = e.target.closest?.('.sb-assets-item');
    if (!item) return;
    const i = Number(item.dataset.i);
    const entry = items[i];
    if (!entry) return;

    listEl.querySelectorAll('.sb-assets-item').forEach((el) => el.classList.remove('is-selected'));
    item.classList.add('is-selected');
    selectedKey = item.dataset.key || null;

    const addBtn = e.target.closest?.('[data-act="add"]');
    if (addBtn && tab === 'motion') {
      e.stopPropagation();
      addBtn.disabled = true;
      try {
        await opts.onAddMotion?.({
          url: entry.url,
          name: entry.displayName || entry.name,
          procedural: entry.procedural,
          color: entry.color,
        });
      } finally {
        addBtn.disabled = false;
      }
    }
  });

  root.querySelector('[data-act="refresh"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    refresh({ quiet: false });
  });

  root.querySelectorAll('.sb-assets-tab').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setTab(/** @type {any} */ (btn.dataset.tab));
    });
  });

  fileInput.addEventListener('click', (e) => e.stopPropagation());

  fileInput.addEventListener('change', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    statusEl.textContent = '업로드 중…';
    try {
      const fd = new FormData();
      let endpoint = API.uploadFbx;
      let field = 'fbxFile';
      if (tab === 'video') {
        endpoint = API.uploadVideo;
        field = 'video';
      } else if (tab === 'audio') {
        endpoint = API.uploadAudio;
        field = 'audioFile';
      }
      fd.append(field, file);
      const res = await fetch(apiUrl(endpoint), {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${errBody ? `: ${errBody.slice(0, 120)}` : ''}`);
      }
      // List-only refresh — editor scene/timeline stay intact
      await refresh({ quiet: true, notifyCatalog: true });
      statusEl.textContent = '업로드 OK';
    } catch (err) {
      statusEl.textContent = '업로드 실패';
      console.error(err);
    }
  });

  root.querySelector('[data-act="delete"]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!selectedKey) {
      window.alert('삭제할 항목을 선택하세요.');
      return;
    }
    const entry = items.find((it) => (it.filename || it.url) === selectedKey);
    if (!entry?.deletable || entry.procedural) {
      window.alert('샘플/로컬 항목은 삭제할 수 없습니다.');
      return;
    }
    if (!window.confirm(`삭제할까요?\n${entry.filename}`)) return;
    try {
      let path = API.deleteFbx;
      if (tab === 'video') path = API.deleteVideo;
      else if (tab === 'audio') path = API.deleteAudio;
      const res = await fetch(apiUrl(`${path}/${encodeURIComponent(entry.filename)}`), {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      selectedKey = null;
      await refresh({ quiet: true, notifyCatalog: true });
      statusEl.textContent = '삭제됨';
    } catch (err) {
      console.error(err);
      window.alert(`삭제 실패: ${err.message}`);
    }
  });

  fileInput.accept = acceptForTab();
  refresh({ quiet: false, notifyCatalog: false });

  return {
    root,
    refresh: () => refresh({ quiet: false }),
    getSelected: () => {
      if (!selectedKey) return null;
      const entry = items.find((it) => (it.filename || it.url) === selectedKey);
      if (!entry) return null;
      return {
        url: entry.url,
        name: entry.displayName || entry.name,
        procedural: entry.procedural,
        color: entry.color,
      };
    },
  };
}

async function loadMediaList(listPath, kind) {
  const res = await fetch(apiUrl(listPath), { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const files = await res.json();
  if (!Array.isArray(files)) return [];
  return files.map((f) => {
    const filename = f.filename || f.name || '';
    const path = f.path || `/files/${kind}/${filename}`;
    const url = path.startsWith('http') ? path : apiUrl(path);
    return {
      url,
      name: (f.name || filename).replace(/\.[^.]+$/, ''),
      displayName: f.displayName || f.name || filename,
      filename,
      deletable: true,
    };
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
