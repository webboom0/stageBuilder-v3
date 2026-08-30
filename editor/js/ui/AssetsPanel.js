import { API, apiUrl, filesUrl } from '../config/app-config.js';
import { loadMotionCatalog } from '../domain/motion/motionCatalog.js';
import { loadPropCatalog, probePropApiAvailable } from '../domain/motion/propCatalog.js';
import { loadGlobalLibrary, libraryFolderHint } from '../domain/assets/globalLibrary.js';
import {
  loadProjectAssets,
  uploadProjectAsset,
  deleteProjectAsset,
  importProjectAssetFromLibrary,
} from '../domain/project/projectAssets.js';
import { getPropThumbnailDataUrl, getCharacterThumbnailDataUrl } from '../domain/assets/propThumbnail.js';
import { getVideoThumbnailDataUrl } from '../domain/assets/mediaThumbnail.js';
import { drawAudioWaveform } from '../domain/audio/audioPaths.js';
import {
  ASSET_DRAG_MIME,
  ASSET_DELETE_DRAG_MIME,
  hasAssetDeleteDrag,
  parseAssetDeleteDrag,
  serializeAssetDrag,
  serializeAssetDeleteDrag,
} from '../domain/assets/stageAssetDrag.js';
import { ASSETS_TOOLBAR_ICONS } from './assetsToolbarIcons.js';

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
 *   getProjectId?: () => string | null,
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
      <span class="sb-assets-status" data-role="status">…</span>
      <div class="sb-assets-toolbar-actions">
        <button type="button" class="sb-assets-tool" data-act="refresh" title="목록 새로고침" aria-label="목록 새로고침">
          <span class="sb-assets-tool-icon" aria-hidden="true">${ASSETS_TOOLBAR_ICONS.refresh}</span>
        </button>
        <button type="button" class="sb-assets-tool" data-act="library" title="공용 라이브러리에서 가져오기" aria-label="공용 라이브러리">
          <span class="sb-assets-tool-icon" aria-hidden="true">${ASSETS_TOOLBAR_ICONS.library}</span>
        </button>
        <label class="sb-assets-tool sb-assets-upload" title="업로드" aria-label="업로드">
          <span class="sb-assets-tool-icon" aria-hidden="true">${ASSETS_TOOLBAR_ICONS.upload}</span>
          <input type="file" data-role="file" hidden />
        </label>
        <button type="button" class="sb-assets-tool sb-assets-del" data-act="delete" title="선택 삭제 · 항목을 여기로 드래그" aria-label="선택 삭제">
          <span class="sb-assets-tool-icon" aria-hidden="true">${ASSETS_TOOLBAR_ICONS.delete}</span>
        </button>
      </div>
    </div>
    <div class="sb-assets-list" data-role="list"></div>
    <p class="sb-assets-hint" data-role="hint">WalkLite 기본 · Lib · 업로드 · + 또는 드래그로 추가 · 색은 속성</p>
  `;

  const listEl = root.querySelector('[data-role="list"]');
  const statusEl = root.querySelector('[data-role="status"]');
  const hintEl = root.querySelector('[data-role="hint"]');
  const fileInput = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="file"]'));
  const delBtn = /** @type {HTMLButtonElement | null} */ (root.querySelector('[data-act="delete"]'));

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
  /** @type {number} */
  let thumbGen = 0;
  /** @type {boolean | null} */
  let propApiAvailable = null;
  /** @type {HTMLElement | null} */
  let libraryOverlay = null;
  /** @type {{ resolve: (v: { ok: boolean, filename?: string }) => void } | null} */
  let libraryPickWaiter = null;
  /** @type {{ resolve: (v: { ok: boolean, filename?: string }) => void } | null} */
  let uploadPickWaiter = null;
  /** @type {HTMLAudioElement | null} */
  let previewAudio = null;
  /** @type {string | null} */
  let previewAudioKey = null;

  function stopPreviewAudio() {
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.removeAttribute('src');
      previewAudio.load();
      previewAudio = null;
    }
    previewAudioKey = null;
    listEl.querySelectorAll('.sb-assets-preview-btn.is-playing').forEach((el) => {
      el.classList.remove('is-playing');
      el.setAttribute('aria-label', '듣기');
      el.title = '듣기';
    });
  }

  /** @param {HTMLElement} wrap */
  function startVideoHoverPreview(wrap) {
    const thumb = wrap.querySelector('.sb-assets-media-thumb.is-video');
    const video = wrap.querySelector('.sb-assets-video-preview');
    if (!thumb || !video) return;
    thumb.classList.add('is-hover-preview');
    video.currentTime = 0;
    void video.play().catch(() => {});
  }

  /** @param {HTMLElement} wrap */
  function stopVideoHoverPreview(wrap) {
    const thumb = wrap.querySelector('.sb-assets-media-thumb.is-video');
    const video = wrap.querySelector('.sb-assets-video-preview');
    if (!thumb || !video) return;
    thumb.classList.remove('is-hover-preview');
    video.pause();
    video.currentTime = 0;
  }

  function stopAllVideoPreviews() {
    listEl.querySelectorAll('.sb-assets-media-card .sb-assets-thumb-wrap').forEach((wrap) => {
      stopVideoHoverPreview(wrap);
    });
  }

  function stopMediaPreview() {
    stopPreviewAudio();
    stopAllVideoPreviews();
  }

  /** @param {number} i */
  function setPreviewAudioPlaying(i, playing) {
    listEl.querySelectorAll('.sb-assets-preview-btn').forEach((el) => {
      el.classList.remove('is-playing');
      el.setAttribute('aria-label', '듣기');
      el.title = '듣기';
    });
    if (!playing) return;
    const btn = listEl.querySelector(`.sb-assets-preview-btn[data-i="${i}"]`);
    btn?.classList.add('is-playing');
    btn?.setAttribute('aria-label', '일시정지');
    if (btn instanceof HTMLButtonElement) btn.title = '일시정지';
  }

  /** @param {number} i @param {any} entry */
  async function togglePreviewAudio(i, entry) {
    const key = entry.filename || entry.url || String(i);
    if (previewAudioKey === key && previewAudio && !previewAudio.paused) {
      previewAudio.pause();
      setPreviewAudioPlaying(i, false);
      return;
    }
    stopPreviewAudio();
    const audio = new Audio(entry.url);
    previewAudio = audio;
    previewAudioKey = key;
    audio.addEventListener('ended', () => {
      stopPreviewAudio();
    });
    audio.addEventListener('pause', () => {
      if (previewAudio === audio && audio.paused && audio.currentTime > 0 && audio.currentTime < (audio.duration || Infinity)) {
        setPreviewAudioPlaying(i, false);
      }
    });
    try {
      await audio.play();
      setPreviewAudioPlaying(i, true);
    } catch (err) {
      console.error(err);
      stopPreviewAudio();
      window.alert('오디오를 재생할 수 없습니다.');
    }
  }

  function projectFilenames() {
    return new Set(
      items
        .filter((it) => it.deletable !== false && it.filename)
        .map((it) => String(it.filename).toLowerCase()),
    );
  }

  /** @param {any} entry */
  function isEntryDeletable(entry) {
    return !!entry && entry.deletable !== false && !entry.procedural;
  }

  /** @param {any} entry */
  function entryDragAttr(entry) {
    return isEntryDeletable(entry) ? 'true' : 'false';
  }

  /** @param {any} entry @param {{ confirm?: boolean }} [opt] */
  async function deleteEntry(entry, opt = {}) {
    const confirmDelete = opt.confirm !== false;
    if (!isEntryDeletable(entry)) {
      window.alert('기본 항목은 삭제할 수 없습니다.');
      return false;
    }
    const label = entry.filename || entry.displayName || entry.name || '항목';
    if (confirmDelete && !window.confirm(`삭제할까요?\n${label}`)) return false;

    try {
      const projectId = opts.getProjectId?.() || null;
      if (projectId) {
        await deleteProjectAsset(projectId, tab, entry.filename);
        if (tab === 'video' && entry.filename && isActiveVideo(entry)) {
          await opts.onRemoveVideo?.();
          activeVideoKey = null;
        }
        if ((entry.filename || entry.url) === selectedKey) selectedKey = null;
        await refresh({ quiet: true, notifyCatalog: true });
        statusEl.textContent = '삭제됨';
        return true;
      }
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
      if ((entry.filename || entry.url) === selectedKey) selectedKey = null;
      await refresh({ quiet: true, notifyCatalog: true });
      statusEl.textContent = '삭제됨';
      return true;
    } catch (err) {
      console.error(err);
      window.alert(`삭제 실패: ${err.message}`);
      return false;
    }
  }

  /**
   * @param {{ ok: boolean, filename?: string }} [result]
   */
  function closeLibraryDialog(result = { ok: false }) {
    libraryOverlay?.remove();
    libraryOverlay = null;
    if (libraryPickWaiter) {
      libraryPickWaiter.resolve(result);
      libraryPickWaiter = null;
    }
  }

  /** @param {{ url: string, path?: string, name: string, displayName?: string, filename?: string, procedural?: string, color?: number }} entry */
  async function addEntryToScene(entry) {
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
      activeVideoKey = entry.filename || entry.url;
      renderList();
    } else {
      await opts.onAddAudio?.({
        url: entry.url,
        path: entry.path || entry.url,
        name: entry.displayName || entry.name,
        filename: entry.filename,
      });
    }
  }

  /**
   * @param {{ elevated?: boolean, hintFilename?: string, awaitResult?: boolean }} [dialogOpts]
   * @returns {Promise<{ ok: boolean, filename?: string }> | void}
   */
  async function openLibraryDialog(dialogOpts = {}) {
    const elevated = !!dialogOpts.elevated;
    const hintFilename = String(dialogOpts.hintFilename || '').toLowerCase();
    const awaitResult = !!dialogOpts.awaitResult;
    const projectId = opts.getProjectId?.() || null;

    if (libraryOverlay) closeLibraryDialog({ ok: false });

    /** @type {Promise<{ ok: boolean, filename?: string }> | null} */
    let pickPromise = null;
    if (awaitResult) {
      pickPromise = new Promise((resolve) => {
        libraryPickWaiter = { resolve };
      });
    }

    statusEl.textContent = '라이브러리…';
    let libItems = [];
    try {
      libItems = await loadGlobalLibrary(tab);
    } catch (err) {
      statusEl.textContent = '실패';
      window.alert(`라이브러리를 불러오지 못했습니다.\n\n${err.message || err}`);
      closeLibraryDialog({ ok: false });
      return pickPromise || { ok: false };
    } finally {
      if (statusEl.textContent === '라이브러리…') {
        statusEl.textContent = items.length ? `${items.length}개` : '없음';
      }
    }

    const inProject = new Set(projectFilenames());
    const overlay = document.createElement('div');
    overlay.className = `sb-assets-lib-overlay${elevated ? ' sb-assets-lib-overlay--elevated' : ''}`;
    overlay.innerHTML = `
      <div class="sb-assets-lib-dlg" role="dialog" aria-modal="true" aria-label="공용 라이브러리">
        <div class="sb-assets-lib-head">
          <strong>${escapeHtml(tabLabel())} — 공용 라이브러리</strong>
          <button type="button" class="sb-tl-help-close" data-act="close-lib" aria-label="닫기">×</button>
        </div>
        <p class="sb-assets-lib-hint">
          서버 <code>${escapeHtml(libraryFolderHint(tab))}</code> 폴더의 파일입니다.
          ${projectId
            ? '선택 후 <strong>프로젝트에 가져오기</strong> — 업로드 없이 프로젝트 에셋으로 복사됩니다.'
            : '선택 후 <strong>씬에 추가</strong> — 프로젝트를 열면 에셋 폴더로 복사할 수 있습니다.'}
        </p>
        <div class="sb-assets-lib-list" data-role="lib-list"></div>
        <div class="sb-assets-lib-actions">
          <button type="button" class="sb-tl-btn" data-act="close-lib">취소</button>
          <button type="button" class="sb-tl-btn sb-tl-btn-primary" data-act="import-lib" disabled>
            ${projectId ? '프로젝트에 가져오기' : '씬에 추가'}
          </button>
        </div>
      </div>
    `;

    const listHost = overlay.querySelector('[data-role="lib-list"]');
    const importBtn = /** @type {HTMLButtonElement} */ (overlay.querySelector('[data-act="import-lib"]'));
    /** @type {number | null} */
    let selectedIdx = null;

    if (hintFilename) {
      const hintBase = hintFilename.replace(/\.[^.]+$/, '');
      const idx = libItems.findIndex((it) => {
        const fn = String(it.filename || '').toLowerCase();
        const dn = String(it.displayName || '').toLowerCase();
        return fn === hintFilename || fn === hintBase || dn === hintBase;
      });
      if (idx >= 0) selectedIdx = idx;
    }

    function renderLibList() {
      if (!libItems.length) {
        listHost.innerHTML = '<div class="sb-assets-empty">라이브러리에 파일이 없습니다.</div>';
        importBtn.disabled = true;
        return;
      }
      listHost.innerHTML = libItems.map((it, i) => {
        const fn = String(it.filename || '');
        const dup = inProject.has(fn.toLowerCase());
        const sel = selectedIdx === i ? ' is-selected' : '';
        const dupMark = dup ? ' <span class="sb-assets-badge">프로젝트에 있음</span>' : '';
        return `
          <div class="sb-assets-lib-item${sel}${dup ? ' is-dup' : ''}" data-i="${i}">
            <span class="sb-assets-item-name">${escapeHtml(it.displayName || fn)}${dupMark}</span>
            <span class="sb-assets-lib-fname">${escapeHtml(fn)}</span>
          </div>`;
      }).join('');
    }

    renderLibList();
    importBtn.disabled = selectedIdx == null;

    listHost?.addEventListener('click', (e) => {
      const row = e.target.closest?.('.sb-assets-lib-item');
      if (!row) return;
      selectedIdx = Number(row.dataset.i);
      renderLibList();
      importBtn.disabled = !Number.isFinite(selectedIdx);
    });

    listHost?.addEventListener('dblclick', async () => {
      if (selectedIdx == null) return;
      importBtn.click();
    });

    overlay.querySelectorAll('[data-act="close-lib"]').forEach((btn) => {
      btn.addEventListener('click', () => closeLibraryDialog({ ok: false }));
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLibraryDialog({ ok: false });
    });

    importBtn.addEventListener('click', async () => {
      if (selectedIdx == null) return;
      const entry = libItems[selectedIdx];
      if (!entry?.filename) return;
      importBtn.disabled = true;
      try {
        if (projectId) {
          if (inProject.has(String(entry.filename).toLowerCase())) {
            window.alert('이미 프로젝트에 있는 파일입니다.');
            return;
          }
          await importProjectAssetFromLibrary(projectId, tab, entry.filename);
          await refresh({ quiet: true, notifyCatalog: true });
          statusEl.textContent = '가져오기 OK';
          closeLibraryDialog({ ok: true, filename: entry.filename });
          return;
        }
        await addEntryToScene(entry);
        closeLibraryDialog({ ok: true, filename: entry.filename });
      } catch (err) {
        console.error(err);
        window.alert(`가져오기 실패\n\n${err?.message || err}`);
      } finally {
        importBtn.disabled = selectedIdx == null;
      }
    });

    document.body.appendChild(overlay);
    libraryOverlay = overlay;
    if (selectedIdx != null) {
      listHost?.querySelector(`[data-i="${selectedIdx}"]`)?.scrollIntoView?.({ block: 'nearest' });
    }
    return pickPromise || undefined;
  }

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
    stopMediaPreview();
    tab = next;
    root.querySelectorAll('.sb-assets-tab').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.tab === tab);
    });
    fileInput.accept = acceptForTab();
    selectedKey = null;
    if (tab === 'character') {
      hintEl.textContent = 'WalkLite 기본 · Lib · 업로드 · + 또는 드래그로 추가 · 색은 속성';
    } else if (tab === 'stage') {
      if (propApiAvailable === false) {
        hintEl.textContent = '직육면체·원통 기본 · Lib · FBX 업로드 · + 또는 드래그로 추가 (PIVOT: FBX만)';
      } else {
        hintEl.textContent = '직육면체·원통 기본 · Lib · FBX/OBJ · + 또는 드래그로 추가 · 색은 속성';
      }
    } else if (tab === 'video') {
      hintEl.textContent = '마우스 오버 미리보기 · + 무대 배경 · 재생 중 − · 🗑 삭제';
    } else {
      hintEl.textContent = '▶ 듣기 · + 타임라인 · 🗑 삭제';
    }
    refresh({ quiet: false });
  }

  function renderList() {
    stopMediaPreview();
    const isMediaTab = tab === 'video' || tab === 'audio';
    const isGridTab = tab === 'stage' || tab === 'character' || isMediaTab;
    listEl.classList.toggle('is-assets-grid', isGridTab);
    listEl.classList.toggle('is-media-grid', isMediaTab);
    listEl.classList.toggle('is-video-grid', tab === 'video');

    if (!items.length) {
      listEl.innerHTML = `<div class="sb-assets-empty">${tabLabel()} 파일이 없습니다.</div>`;
      return;
    }
    listEl.innerHTML = items.map((it, i) => {
      const key = it.filename || it.url || String(i);
      const label = it.displayName || it.name || key;
      const badge = it.procedural ? '<span class="sb-assets-badge">기본</span>' : '';

      if (isMediaTab) {
        const activeOnStage = tab === 'video' && isActiveVideo(it);
        const stageBadge = activeOnStage
          ? '<span class="sb-assets-badge sb-assets-badge-on-thumb">재생 중</span>'
          : '';
        const addOverlay = tab === 'video' && activeOnStage
          ? `<button type="button" class="sb-assets-add-overlay is-remove" data-act="remove-video" data-i="${i}" draggable="false" title="무대에서 비디오 제거">−</button>`
          : `<button type="button" class="sb-assets-add-overlay" data-act="add" data-i="${i}" draggable="false" title="${tab === 'video' ? '무대 배경 재생' : '오디오 타임라인에 추가'}">+</button>`;

        if (tab === 'video') {
          return `
        <div class="sb-assets-item sb-assets-card sb-assets-media-card is-video-card ${selectedKey === key ? 'is-selected' : ''}${activeOnStage ? ' is-active-video' : ''}"
          data-key="${escapeAttr(key)}" data-i="${i}" draggable="${entryDragAttr(it)}">
          <div class="sb-assets-thumb-wrap">
            <div class="sb-assets-thumb sb-assets-media-thumb is-video">
              <img class="sb-assets-thumb-img sb-assets-video-poster" data-thumb-i="${i}" alt="" />
              <video class="sb-assets-video-preview" src="${escapeAttr(it.url)}" muted loop playsinline preload="metadata"></video>
              ${stageBadge}
            </div>
            ${addOverlay}
          </div>
          <div class="sb-assets-card-foot">
            <span class="sb-assets-item-name" title="${escapeAttr(label)}">${escapeHtml(label)}</span>
          </div>
        </div>`;
        }

        return `
        <div class="sb-assets-item sb-assets-card sb-assets-media-card ${selectedKey === key ? 'is-selected' : ''}"
          data-key="${escapeAttr(key)}" data-i="${i}" draggable="${entryDragAttr(it)}">
          <div class="sb-assets-thumb-wrap">
            <div class="sb-assets-thumb sb-assets-media-thumb is-audio">
              <canvas class="sb-assets-audio-wave" data-wave-i="${i}" data-wave-pixel-w="160" aria-hidden="true"></canvas>
            </div>
            <button type="button" class="sb-assets-preview-btn" data-act="preview" data-i="${i}" title="듣기" aria-label="듣기">
              <span class="sb-assets-preview-icon" aria-hidden="true"></span>
            </button>
            ${addOverlay}
          </div>
          <div class="sb-assets-card-foot">
            <span class="sb-assets-item-name" title="${escapeAttr(label)}">${escapeHtml(label)}</span>
          </div>
        </div>`;
      }

      let addBtn = '';
      if (tab === 'character' || tab === 'stage') {
        addBtn = `<button type="button" class="sb-assets-add" data-act="add" data-i="${i}" title="씬·타임라인에 추가">+</button>`;
      }

      if (isGridTab) {
        const thumbKey = escapeAttr(`${key}::${i}`);
        const thumbBadge = it.procedural
          ? '<span class="sb-assets-badge sb-assets-badge-on-thumb">기본</span>'
          : '';
        return `
        <div class="sb-assets-item sb-assets-card ${selectedKey === key ? 'is-selected' : ''}"
          data-key="${escapeAttr(key)}" data-i="${i}" draggable="${entryDragAttr(it)}">
          <div class="sb-assets-thumb-wrap">
            <div class="sb-assets-thumb" aria-hidden="true">
              <img class="sb-assets-thumb-img" data-thumb-i="${i}" data-thumb-key="${thumbKey}" alt="" />
              ${thumbBadge}
            </div>
            <button type="button" class="sb-assets-add-overlay" data-act="add" data-i="${i}" draggable="false" title="씬·타임라인에 추가">+</button>
          </div>
          <div class="sb-assets-card-foot">
            <span class="sb-assets-item-name" title="${escapeAttr(label)}">${escapeHtml(label)}</span>
          </div>
        </div>`;
      }

      return `
        <div class="sb-assets-item ${selectedKey === key ? 'is-selected' : ''}"
          data-key="${escapeAttr(key)}" data-i="${i}">
          <span class="sb-assets-item-name">${escapeHtml(label)}${badge}</span>
          ${addBtn}
        </div>`;
    }).join('');
    if (tab === 'stage' || tab === 'character') hydrateGridThumbnails();
    else if (isMediaTab) hydrateMediaPreviews();
  }

  function hydrateMediaPreviews() {
    const gen = ++thumbGen;
    const activeTab = tab;

    if (activeTab === 'video') {
      const imgs = listEl.querySelectorAll('.sb-assets-thumb-img');
      imgs.forEach((img) => {
        const i = Number(img.dataset.thumbI);
        const entry = items[i];
        if (!entry?.url) return;
        img.removeAttribute('src');
        img.classList.remove('is-loaded', 'is-failed');
        void getVideoThumbnailDataUrl(entry.url).then((dataUrl) => {
          if (gen !== thumbGen || tab !== activeTab) return;
          if (!img.isConnected) return;
          if (dataUrl) {
            img.src = dataUrl;
            img.classList.add('is-loaded');
          } else {
            img.classList.add('is-failed');
          }
        });
      });
      return;
    }

    const canvases = listEl.querySelectorAll('.sb-assets-audio-wave');
    canvases.forEach((canvas) => {
      const i = Number(canvas.dataset.waveI);
      const entry = items[i];
      if (!entry) return;
      const wavePath = entry.path || entry.url;
      if (!wavePath) return;
      requestAnimationFrame(() => {
        if (gen !== thumbGen || tab !== activeTab) return;
        if (!canvas.isConnected) return;
        drawAudioWaveform(/** @type {HTMLCanvasElement} */ (canvas), wavePath);
      });
    });
  }

  function hydrateGridThumbnails() {
    const gen = ++thumbGen;
    const activeTab = tab;
    const getThumb = activeTab === 'stage' ? getPropThumbnailDataUrl : getCharacterThumbnailDataUrl;
    const imgs = listEl.querySelectorAll('.sb-assets-thumb-img');
    imgs.forEach((img) => {
      const i = Number(img.dataset.thumbI);
      const entry = items[i];
      if (!entry) return;
      img.removeAttribute('src');
      img.classList.remove('is-loaded', 'is-failed');
      void getThumb(entry).then((dataUrl) => {
        if (gen !== thumbGen || tab !== activeTab) return;
        if (!img.isConnected) return;
        if (dataUrl) {
          img.src = dataUrl;
          img.classList.add('is-loaded');
        } else {
          img.classList.add('is-failed');
        }
      });
    });
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
      const projectId = opts.getProjectId?.() || null;
      if (projectId) {
        next = await loadProjectAssets(projectId, tab);
      } else if (tab === 'character') {
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

  listEl.addEventListener('dragstart', (e) => {
    if (e.target.closest?.('button, label, input')) {
      e.preventDefault();
      return;
    }
    const card = e.target.closest?.('.sb-assets-item[data-key]');
    if (!card) return;
    const i = Number(card.dataset.i);
    const entry = items[i];
    if (!isEntryDeletable(entry)) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.setData(ASSET_DELETE_DRAG_MIME, serializeAssetDeleteDrag(entry));
    e.dataTransfer.effectAllowed = 'copy';
    card.classList.add('is-dragging');
    document.body.classList.add('sb-asset-dragging-delete');

    if (tab === 'stage' || tab === 'character') {
      e.dataTransfer.setData(ASSET_DRAG_MIME, serializeAssetDrag(tab, entry));
      document.body.classList.add(
        tab === 'stage' ? 'sb-asset-dragging-stage' : 'sb-asset-dragging-character',
      );
    }
  });

  listEl.addEventListener('dragend', () => {
    document.body.classList.remove(
      'sb-asset-dragging-stage',
      'sb-asset-dragging-character',
      'sb-asset-dragging-delete',
    );
    delBtn?.classList.remove('is-drop-target');
    listEl.querySelectorAll('.sb-assets-item.is-dragging').forEach((el) => {
      el.classList.remove('is-dragging');
    });
  });

  delBtn?.addEventListener('dragover', (e) => {
    if (!hasAssetDeleteDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    delBtn.classList.add('is-drop-target');
  });

  delBtn?.addEventListener('dragleave', (e) => {
    const rel = e.relatedTarget;
    if (rel instanceof Node && delBtn.contains(rel)) return;
    delBtn.classList.remove('is-drop-target');
  });

  delBtn?.addEventListener('drop', async (e) => {
    e.preventDefault();
    delBtn.classList.remove('is-drop-target');
    if (!hasAssetDeleteDrag(e.dataTransfer)) return;
    const payload = parseAssetDeleteDrag(e.dataTransfer.getData(ASSET_DELETE_DRAG_MIME));
    if (!payload) return;
    const entry = items.find((it) => {
      const key = it.filename || it.url || '';
      return key === payload.key
        || (payload.filename && it.filename === payload.filename)
        || (payload.url && it.url === payload.url);
    });
    if (!entry) return;
    selectedKey = entry.filename || entry.url || null;
    await deleteEntry(entry);
  });

  listEl.addEventListener('mouseover', (e) => {
    if (tab !== 'video') return;
    const wrap = e.target.closest?.('.sb-assets-media-card .sb-assets-thumb-wrap');
    if (!wrap) return;
    const related = e.relatedTarget;
    if (related instanceof Node && wrap.contains(related)) return;
    startVideoHoverPreview(wrap);
  });

  listEl.addEventListener('mouseout', (e) => {
    if (tab !== 'video') return;
    const wrap = e.target.closest?.('.sb-assets-media-card .sb-assets-thumb-wrap');
    if (!wrap) return;
    const related = e.relatedTarget;
    if (related instanceof Node && wrap.contains(related)) return;
    stopVideoHoverPreview(wrap);
  });

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
    const previewBtn = e.target.closest?.('[data-act="preview"]');

    if (previewBtn && tab === 'audio') {
      e.stopPropagation();
      void togglePreviewAudio(i, entry);
      return;
    }

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
            path: entry.path || entry.url,
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

  root.querySelector('[data-act="library"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    void openLibraryDialog();
  });

  root.querySelectorAll('.sb-assets-tab').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setTab(/** @type {any} */ (btn.dataset.tab));
    });
  });

  fileInput.addEventListener('click', (e) => e.stopPropagation());

  /**
   * @param {File} file
   * @returns {Promise<{ ok: boolean, filename?: string }>}
   */
  async function uploadSelectedFile(file) {
    const clientErr = validateUploadFile(file, tab, { propApiAvailable });
    if (clientErr) {
      statusEl.textContent = '업로드 취소';
      window.alert(clientErr);
      return { ok: false };
    }

    statusEl.textContent = '업로드 중…';
    try {
      const projectId = opts.getProjectId?.() || null;
      if (projectId) {
        await uploadProjectAsset(projectId, tab, file);
        await refresh({ quiet: true, notifyCatalog: true });
        statusEl.textContent = '업로드 OK';
        return { ok: true, filename: file.name };
      }
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
      return { ok: true, filename: file.name };
    } catch (err) {
      statusEl.textContent = '업로드 실패';
      console.error(err);
      window.alert(`업로드 실패\n\n${err?.message || err}`);
      return { ok: false };
    }
  }

  /**
   * @param {'character' | 'stage' | 'video' | 'audio'} nextTab
   * @returns {Promise<{ ok: boolean, filename?: string }>}
   */
  function pickUpload(nextTab) {
    setTab(nextTab);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('focus', onWinFocus);
        uploadPickWaiter = null;
        resolve(result);
      };
      uploadPickWaiter = { resolve: finish };
      const onWinFocus = () => {
        window.setTimeout(() => {
          if (!settled && !fileInput.files?.length) finish({ ok: false });
        }, 400);
      };
      window.addEventListener('focus', onWinFocus, { once: true });
      fileInput.click();
    });
  }

  /**
   * @param {'character' | 'stage' | 'video' | 'audio'} nextTab
   * @param {{ elevated?: boolean, hintFilename?: string }} [dialogOpts]
   * @returns {Promise<{ ok: boolean, filename?: string }>}
   */
  async function pickLibrary(nextTab, dialogOpts = {}) {
    setTab(nextTab);
    const result = await openLibraryDialog({
      ...dialogOpts,
      awaitResult: true,
    });
    return result || { ok: false };
  }

  fileInput.addEventListener('change', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = fileInput.files?.[0];
    fileInput.value = '';
    const waiter = uploadPickWaiter;
    uploadPickWaiter = null;
    if (!file) {
      waiter?.resolve({ ok: false });
      return;
    }
    const result = await uploadSelectedFile(file);
    waiter?.resolve(result);
  });

  root.querySelector('[data-act="delete"]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!selectedKey) {
      window.alert('삭제할 항목을 선택하세요.');
      return;
    }
    const entry = items.find((it) => (it.filename || it.url) === selectedKey);
    if (!entry) return;
    await deleteEntry(entry);
  });

  fileInput.accept = acceptForTab();
  refresh({ quiet: false, notifyCatalog: false });

  return {
    root,
    refresh: () => refresh({ quiet: false }),
    /** 프로젝트 전환 직후 — 이전 목록 즉시 비우기 */
    clearStale() {
      loadGen += 1;
      items = [];
      selectedKey = null;
      activeVideoKey = null;
      stopMediaPreview();
      statusEl.textContent = '불러오는 중…';
      renderList();
    },
    destroy() {
      closeLibraryDialog();
      stopMediaPreview();
    },
    /** @param {string | null} key filename or url */
    setActiveVideo(key) {
      activeVideoKey = key;
      if (tab === 'video') renderList();
    },
    getActiveVideo: () => activeVideoKey,
    /** @param {'character' | 'stage' | 'video' | 'audio'} nextTab */
    focusTab: (nextTab) => setTab(nextTab),
    pickUpload,
    pickLibrary,
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
