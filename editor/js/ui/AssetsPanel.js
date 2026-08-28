import { API, apiUrl, filesUrl } from '../config/app-config.js';
import { loadMotionCatalog } from '../domain/motion/motionCatalog.js';
import { loadPropCatalog, probePropApiAvailable } from '../domain/motion/propCatalog.js';

/** Must match server/server.js MEDIA_EXTS + limits */
const UPLOAD_RULES = Object.freeze({
  character: Object.freeze({
    tabLabel: 'Characters',
    exts: ['.fbx'],
    extHint: '.fbx',
    maxBytes: 100 * 1024 * 1024,
    maxLabel: '100MB',
  }),
  stage: Object.freeze({
    tabLabel: 'Stage',
    exts: ['.fbx', '.obj'],
    extHint: '.fbx, .obj',
    maxBytes: 100 * 1024 * 1024,
    maxLabel: '100MB',
  }),
  video: Object.freeze({
    tabLabel: 'Video',
    exts: ['.mp4', '.webm', '.ogg', '.avi', '.mov'],
    extHint: '.mp4, .webm, .mov, .avi, .ogg',
    maxBytes: 500 * 1024 * 1024,
    maxLabel: '500MB',
  }),
  audio: Object.freeze({
    tabLabel: 'Audio',
    exts: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'],
    extHint: '.mp3, .wav, .ogg, .m4a, .aac, .flac',
    maxBytes: 50 * 1024 * 1024,
    maxLabel: '50MB',
  }),
});

/**
 * Assets panel — Characters / Stage / Video / Audio.
 * Upload/delete only refresh the asset list (never full page reload).
 *
 * @param {{
 *   onAddCharacter?: (entry: {
 *     url: string,
 *     name: string,
 *     procedural?: string,
 *     color?: number,
 *   }) => void | Promise<void>,
 *   onAddProp?: (entry: {
 *     url: string,
 *     name: string,
 *     procedural?: string,
 *     color?: number,
 *   }) => void | Promise<void>,
 *   onAddVideo?: (entry: { url: string, name: string, filename?: string }) => void | Promise<void>,
 *   onAddAudio?: (entry: { url: string, path: string, name: string, filename?: string }) => void | Promise<void>,
 *   onRemoveVideo?: () => void | Promise<void>,
 *   onCatalogChanged?: () => void | Promise<void>,
 * }} [opts]
 */
export function createAssetsPanelBody(opts = {}) {
  const root = document.createElement('div');
  root.className = 'sb-panel-body sb-assets';
  root.innerHTML = `
    <div class="sb-assets-tabs" role="tablist">
      <button type="button" class="sb-assets-tab is-on" data-tab="character" role="tab">Characters</button>
      <button type="button" class="sb-assets-tab" data-tab="stage" role="tab">Stage</button>
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
    <p class="sb-assets-hint" data-role="hint">WalkLite 기본 · FBX 업로드 · + 로 추가 · 색은 속성</p>
  `;

  const listEl = root.querySelector('[data-role="list"]');
  const statusEl = root.querySelector('[data-role="status"]');
  const hintEl = root.querySelector('[data-role="hint"]');
  const fileInput = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="file"]'));

  /** @type {'character' | 'stage' | 'video' | 'audio'} */
  let tab = 'character';
  /** @type {string | null} */
  let selectedKey = null;
  /** Filename/url of video currently on stage */
  /** @type {string | null} */
  let activeVideoKey = null;
  /** @type {any[]} */
  let items = [];
  /** @type {number} */
  let loadGen = 0;
  /** @type {boolean | null} */
  let propApiAvailable = null;

  function acceptForTab() {
    if (tab === 'character') return '.fbx';
    if (tab === 'stage') return '.fbx,.obj';
    if (tab === 'video') return 'video/*,.mp4,.webm,.mov';
    return 'audio/*,.mp3,.wav,.ogg,.m4a';
  }

  function tabLabel() {
    return UPLOAD_RULES[tab]?.tabLabel || tab;
  }

  /** @param {any} entry */
  function videoItemKey(entry) {
    return entry?.filename || entry?.url || null;
  }

  /** @param {any} entry */
  function isActiveVideo(entry) {
    if (!activeVideoKey || tab !== 'video') return false;
    const key = videoItemKey(entry);
    if (!key) return false;
    if (key === activeVideoKey) return true;
    // URL may differ by origin; compare filename tail
    if (entry.filename && (activeVideoKey === entry.filename || String(activeVideoKey).endsWith(`/${entry.filename}`))) {
      return true;
    }
    return false;
  }

  function setTab(next) {
    tab = next;
    root.querySelectorAll('.sb-assets-tab').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.tab === tab);
    });
    fileInput.accept = acceptForTab();
    selectedKey = null;
    if (tab === 'character') {
      hintEl.textContent = 'WalkLite 기본 · FBX 업로드 · + 로 추가 · 색은 속성';
    } else if (tab === 'stage') {
      if (propApiAvailable === false) {
        hintEl.textContent = '직육면체·원통 기본 · FBX 업로드 · + 로 추가 · 색은 속성 (PIVOT: FBX만)';
      } else {
        hintEl.textContent = '직육면체·원통 기본 · FBX/OBJ · + 로 추가 · 색은 속성';
      }
    } else if (tab === 'video') {
      hintEl.textContent = 'Video · + 재생 · 재생 중 − 로 제거 · 🗑 는 파일 삭제';
    } else {
      hintEl.textContent = 'Audio · + 클릭마다 새 트랙 · 트랙 헤더 볼륨 · 🗑 파일 삭제';
    }
    refresh({ quiet: false });
  }

  function renderList() {
    if (!items.length) {
      listEl.innerHTML = `<div class="sb-assets-empty">${tabLabel()} 파일이 없습니다.</div>`;
      return;
    }
    listEl.innerHTML = items.map((it, i) => {
      const key = it.filename || it.url || String(i);
      const label = it.displayName || it.name || key;
      const badge = it.procedural ? '<span class="sb-assets-badge">기본</span>' : '';
      let addBtn = '';
      if (tab === 'character' || tab === 'stage') {
        addBtn = `<button type="button" class="sb-assets-add" data-act="add" data-i="${i}" title="씬·타임라인에 추가">+</button>`;
      } else if (tab === 'video') {
        const on = isActiveVideo(it);
        addBtn = on
          ? `<button type="button" class="sb-assets-add is-remove" data-act="remove-video" data-i="${i}" title="무대에서 비디오 제거">−</button>`
          : `<button type="button" class="sb-assets-add" data-act="add" data-i="${i}" title="무대 배경 재생">+</button>`;
      } else if (tab === 'audio') {
        addBtn = `<button type="button" class="sb-assets-add" data-act="add" data-i="${i}" title="오디오 타임라인에 추가">+</button>`;
      }
      return `
        <div class="sb-assets-item ${selectedKey === key ? 'is-selected' : ''}${tab === 'video' && isActiveVideo(it) ? ' is-active-video' : ''}"
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
      if (tab === 'character') {
        next = await loadMotionCatalog();
      } else if (tab === 'stage') {
        if (propApiAvailable === null) {
          propApiAvailable = await probePropApiAvailable();
        }
        next = await loadPropCatalog();
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
      if (notifyCatalog && tab === 'character') {
        await opts.onCatalogChanged?.();
      }
    } catch (err) {
      if (gen !== loadGen) return;
      statusEl.textContent = '실패';
      listEl.innerHTML = `<div class="sb-assets-empty">${escapeHtml(err.message)}</div>`;
      window.alert(`목록을 불러오지 못했습니다.\n\n${err.message || err}`);
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
    const removeBtn = e.target.closest?.('[data-act="remove-video"]');
    if (removeBtn && tab === 'video') {
      e.stopPropagation();
      removeBtn.disabled = true;
      try {
        await opts.onRemoveVideo?.();
        activeVideoKey = null;
        renderList();
      } finally {
        removeBtn.disabled = false;
      }
      return;
    }
    if (addBtn && (tab === 'character' || tab === 'stage' || tab === 'video' || tab === 'audio')) {
      e.stopPropagation();
      addBtn.disabled = true;
      try {
        if (tab === 'character') {
          await opts.onAddCharacter?.({
            url: entry.url,
            name: entry.displayName || entry.name,
            procedural: entry.procedural,
            color: entry.color,
          });
        } else if (tab === 'stage') {
          await opts.onAddProp?.({
            url: entry.url,
            name: entry.displayName || entry.name,
            procedural: entry.procedural,
            color: entry.color,
          });
        } else if (tab === 'video') {
          await opts.onAddVideo?.({
            url: entry.url,
            name: entry.displayName || entry.name,
            filename: entry.filename,
          });
          activeVideoKey = videoItemKey(entry);
          renderList();
        } else {
          await opts.onAddAudio?.({
            url: entry.url,
            path: entry.path || `/files/music/${entry.filename}`,
            name: entry.displayName || entry.name,
            filename: entry.filename,
          });
        }
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

    const clientErr = validateUploadFile(file, tab, { propApiAvailable });
    if (clientErr) {
      statusEl.textContent = '업로드 취소';
      window.alert(clientErr);
      return;
    }

    statusEl.textContent = '업로드 중…';
    try {
      if (tab === 'stage' && propApiAvailable === null) {
        propApiAvailable = await probePropApiAvailable();
      }
      const fd = new FormData();
      let endpoint = API.uploadFbx;
      let field = 'fbxFile';
      if (tab === 'stage') {
        endpoint = propApiAvailable === false ? API.uploadFbx : API.uploadProp;
        field = propApiAvailable === false ? 'fbxFile' : 'propFile';
      } else if (tab === 'video') {
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
        if (tab === 'stage' && endpoint === API.uploadProp) {
          propApiAvailable = false;
          endpoint = API.uploadFbx;
          field = 'fbxFile';
          const fd2 = new FormData();
          fd2.append(field, file);
          const res2 = await fetch(apiUrl(endpoint), {
            method: 'POST',
            body: fd2,
            credentials: 'include',
          });
          if (!res2.ok) throw new Error(await readUploadError(res2));
        } else {
          throw new Error(await readUploadError(res));
        }
      } else if (tab === 'stage' && endpoint === API.uploadProp) {
        propApiAvailable = true;
      }
      await refresh({ quiet: true, notifyCatalog: true });
      statusEl.textContent = '업로드 OK';
    } catch (err) {
      statusEl.textContent = '업로드 실패';
      console.error(err);
      window.alert(`업로드 실패\n\n${err?.message || err}`);
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
      window.alert('기본 항목은 삭제할 수 없습니다.');
      return;
    }
    if (!window.confirm(`삭제할까요?\n${entry.filename}`)) return;
    try {
      let path = API.deleteFbx;
      if (tab === 'stage') path = propApiAvailable === false ? API.deleteFbx : API.deleteProp;
      else if (tab === 'video') path = API.deleteVideo;
      else if (tab === 'audio') path = API.deleteAudio;
      const res = await fetch(apiUrl(`${path}/${encodeURIComponent(entry.filename)}`), {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (tab === 'video' && entry.filename && isActiveVideo(entry)) {
        await opts.onRemoveVideo?.();
        activeVideoKey = null;
      }
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
    /** @param {string | null} key filename or url */
    setActiveVideo(key) {
      activeVideoKey = key;
      if (tab === 'video') renderList();
    },
    getActiveVideo: () => activeVideoKey,
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
    const url = path.startsWith('http') ? path : filesUrl(path);
    return {
      url,
      path,
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

/** @param {string} name */
function fileExt(name) {
  const i = String(name).lastIndexOf('.');
  if (i < 0) return '';
  return String(name).slice(i).toLowerCase();
}

/**
 * @param {File} file
 * @param {'character' | 'stage' | 'video' | 'audio'} kind
 * @param {{ propApiAvailable?: boolean | null }} [opts]
 * @returns {string | null} alert message
 */
function validateUploadFile(file, kind, opts = {}) {
  const rules = UPLOAD_RULES[kind];
  const ext = fileExt(file.name);
  if (kind === 'stage' && ext === '.obj' && opts.propApiAvailable === false) {
    return [
      'PIVOT 서버에는 Stage(OBJ) API가 없습니다.',
      '',
      'FBX 소품만 업로드할 수 있습니다.',
      'OBJ는 v4 개발 서버 또는 PIVOT server.js 업데이트 후 사용하세요.',
    ].join('\n');
  }
  if (!rules.exts.includes(ext)) {
    return [
      '지원하지 않는 파일 형식입니다.',
      '',
      `${rules.tabLabel} 탭 — 허용: ${rules.extHint}`,
      `선택한 파일: ${file.name}`,
    ].join('\n');
  }
  if (file.size > rules.maxBytes) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return [
      '파일 크기가 제한을 초과했습니다.',
      '',
      `${rules.tabLabel} 탭 — 최대 ${rules.maxLabel}`,
      `선택한 파일: ${file.name} (${mb}MB)`,
    ].join('\n');
  }
  return null;
}

/** @param {Response} res */
async function readUploadError(res) {
  const raw = await res.text().catch(() => '');
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data?.error) return String(data.error);
    } catch {
      /* plain text */
    }
    if (raw.length <= 240) return raw;
    return raw.slice(0, 240);
  }
  if (res.status === 413) return '파일 크기가 제한을 초과했습니다.';
  return `서버 오류 (HTTP ${res.status})`;
}
