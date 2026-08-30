import { ASSETS_TOOLBAR_ICONS } from '../assetsToolbarIcons.js';
import { assetsTabForWarning } from './sceneLoadReportAssets.js';

/**
 * @typedef {{
 *   kind: string,
 *   label: string,
 *   detail?: string,
 *   inLibrary?: boolean,
 *   libraryFilename?: string | null,
 *   assetsTab?: string,
 * }} SceneLoadWarning
 */

/**
 * @param {{
 *   sceneName?: string,
 *   warnings: SceneLoadWarning[],
 *   assetsActions?: {
 *     openAssetsPanel?: () => void,
 *     pickUpload?: (tab: string, opts?: { hintFilename?: string, elevated?: boolean }) => Promise<{ ok?: boolean, filename?: string } | void>,
 *     pickLibrary?: (tab: string, opts?: { hintFilename?: string, elevated?: boolean }) => Promise<{ ok?: boolean, filename?: string } | void>,
 *   },
 *   onReloadScene?: () => void | Promise<void>,
 * }} report
 */
export function showSceneLoadReportDialog(report) {
  /** @type {SceneLoadWarning[]} */
  let warnings = [...(report.warnings || [])];
  if (!warnings.length) return;

  const hasAssetsActions = !!(report.assetsActions?.pickUpload || report.assetsActions?.pickLibrary);
  const hasLibraryHits = warnings.some((w) => w.inLibrary);

  const overlay = document.createElement('div');
  overlay.className = 'sb-project-hub-overlay sb-scene-load-report-overlay';

  const panel = document.createElement('div');
  panel.className = 'sb-project-hub sb-scene-load-report';
  const title = report.sceneName ? `씬 로드 경고 — ${report.sceneName}` : '씬 로드 경고';
  const hint = hasAssetsActions
    ? (hasLibraryHits
      ? '일부 파일은 <strong>공용 라이브러리</strong>에 있습니다 — 보라색 <strong>라이브러리</strong> 버튼으로 가져온 뒤 <strong>씬 다시 불러오기</strong>를 누르세요. 업로드·닫기 후 나중에 넣어도 됩니다.'
      : '아래에서 업로드·라이브러리로 파일을 추가한 뒤 <strong>씬 다시 불러오기</strong>를 누르세요. 지금 닫고 나중에 Assets 탭에서 넣어도 됩니다.')
    : 'Assets 탭에서 파일을 다시 업로드하거나, 타임라인에서 해당 트랙을 삭제하세요.';

  panel.innerHTML = `
    <div class="sb-project-hub__header">
      <h2 class="sb-project-picker__title">${escapeHtml(title)}</h2>
      <p class="sb-project-hub__subtitle">일부 항목을 복원하지 못했거나 파일이 없습니다. 씬은 열렸습니다.<br>
        <span class="sb-scene-load-report__hint">${hint}</span></p>
    </div>
    <div class="sb-project-hub__body sb-scene-load-report__body">
      <ul class="sb-scene-load-report__list" data-role="list"></ul>
      <p class="sb-scene-load-report__status" data-role="status" hidden></p>
    </div>
    <div class="sb-project-picker__foot sb-scene-load-report__foot">
      ${report.onReloadScene ? '<button type="button" class="sb-project-hub__btn" data-act="reload">씬 다시 불러오기</button>' : ''}
      <button type="button" class="sb-project-hub__btn sb-project-hub__btn--primary" data-act="ok">닫기</button>
    </div>
  `;

  const listEl = panel.querySelector('[data-role="list"]');
  const statusEl = panel.querySelector('[data-role="status"]');
  const reloadBtn = /** @type {HTMLButtonElement | null} */ (panel.querySelector('[data-act="reload"]'));

  function renderList() {
    if (!warnings.length) {
      listEl.innerHTML = '<li class="sb-scene-load-report__empty">누락 항목이 모두 해결되었습니다.</li>';
      return;
    }
    listEl.innerHTML = warnings.map((w, i) => {
      const tab = w.assetsTab || assetsTabForWarning(w);
      const libClass = w.inLibrary ? ' is-prominent' : '';
      const libHint = w.inLibrary
        ? `<span class="sb-scene-load-report__lib-note">공용 라이브러리에 있음${w.libraryFilename ? ` — ${escapeHtml(w.libraryFilename)}` : ''} · <strong>라이브러리</strong>로 가져오세요</span>`
        : '';
      const actionBtns = hasAssetsActions ? `
        <div class="sb-scene-load-report__actions">
          ${report.assetsActions?.pickUpload ? `
            <button type="button" class="sb-scene-load-report__tool${w.inLibrary ? ' is-muted' : ''}" data-act="upload" data-i="${i}" title="업로드 (${tabLabel(tab)})" aria-label="업로드">
              <span class="sb-scene-load-report__tool-icon" aria-hidden="true">${ASSETS_TOOLBAR_ICONS.upload}</span>
              <span class="sb-scene-load-report__tool-txt">업로드</span>
            </button>` : ''}
          ${report.assetsActions?.pickLibrary ? `
            <button type="button" class="sb-scene-load-report__tool${libClass}" data-act="library" data-i="${i}" title="라이브러리에서 가져오기 (${tabLabel(tab)})" aria-label="라이브러리">
              <span class="sb-scene-load-report__tool-icon" aria-hidden="true">${ASSETS_TOOLBAR_ICONS.library}</span>
              <span class="sb-scene-load-report__tool-txt">라이브러리</span>
            </button>` : ''}
        </div>` : '';
      return `
        <li class="sb-scene-load-report__item${w.inLibrary ? ' is-in-library' : ''}" data-i="${i}">
          <div class="sb-scene-load-report__main">
            <div class="sb-scene-load-report__lead">
              <span class="sb-scene-load-report__kind">${escapeHtml(kindLabel(w.kind))}</span>
              <span class="sb-scene-load-report__label">${escapeHtml(w.label)}</span>
            </div>
            ${w.detail ? `<span class="sb-scene-load-report__detail">${escapeHtml(w.detail)}</span>` : ''}
            ${libHint}
          </div>
          ${actionBtns}
        </li>`;
    }).join('');
  }

  function setStatus(msg) {
    if (!statusEl) return;
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
  }

  function notifyAssetAdded(msg) {
    assetsAdded = true;
    if (msg) setStatus(msg);
  }

  let assetsAdded = false;
  let dismissConfirmEl = null;

  function removeDismissConfirm() {
    dismissConfirmEl?.remove();
    dismissConfirmEl = null;
  }

  /** @param {() => void} onContinue */
  function showDismissConfirm(onContinue) {
    removeDismissConfirm();
    const count = warnings.length;
    const itemsHtml = warnings.slice(0, 6).map((w) => `
      <li><span class="sb-scene-load-dismiss__kind">${escapeHtml(kindLabel(w.kind))}</span> ${escapeHtml(w.label)}</li>
    `).join('');
    const more = count > 6 ? `<li class="sb-scene-load-dismiss__more">외 ${count - 6}개</li>` : '';

    let extraNote = '';
    if (assetsAdded) {
      extraNote = '<p class="sb-scene-load-dismiss__note sb-scene-load-dismiss__note--warn">파일을 추가했지만 <strong>씬 다시 불러오기</strong>를 하지 않았습니다. 지금 닫으면 무대에 아직 반영되지 않을 수 있습니다.</p>';
    } else if (hasLibraryHits) {
      extraNote = '<p class="sb-scene-load-dismiss__note">일부 파일은 공용 라이브러리에 있습니다. 나중에 Assets 탭에서 가져올 수 있습니다.</p>';
    }

    const confirm = document.createElement('div');
    confirm.className = 'sb-project-hub-overlay sb-scene-load-dismiss-overlay';
    confirm.innerHTML = `
      <div class="sb-project-hub sb-scene-load-dismiss" role="dialog" aria-modal="true" aria-labelledby="sb-scene-load-dismiss-title">
        <div class="sb-project-hub__header">
          <h2 id="sb-scene-load-dismiss-title" class="sb-project-picker__title">파일 없이 계속할까요?</h2>
          <p class="sb-project-hub__subtitle">누락된 파일 ${count}개 때문에 일부가 제대로 보이지 않을 수 있습니다.</p>
        </div>
        <div class="sb-project-hub__body sb-scene-load-dismiss__body">
          <p class="sb-scene-load-dismiss__lead">아래 항목은 프로젝트 에셋 폴더에 파일이 없습니다.</p>
          <ul class="sb-scene-load-dismiss__list">${itemsHtml}${more}</ul>
          <ul class="sb-scene-load-dismiss__bullets">
            <li>타임라인 트랙·클립은 <strong>그대로 남습니다</strong>.</li>
            <li>캐릭터·영상·오디오 등은 <strong>무대(3D)에 표시·재생되지 않을 수 있습니다</strong>.</li>
            <li>나중에 Assets 탭에서 추가한 뒤 <strong>씬 다시 불러오기</strong>로 복원할 수 있습니다.</li>
          </ul>
          ${extraNote}
        </div>
        <div class="sb-project-picker__foot sb-scene-load-dismiss__foot">
          <button type="button" class="sb-project-hub__btn" data-act="back">돌아가기</button>
          <button type="button" class="sb-project-hub__btn sb-project-hub__btn--primary" data-act="continue">계속 편집</button>
        </div>
      </div>
    `;
    confirm.querySelector('[data-act="back"]')?.addEventListener('click', removeDismissConfirm);
    confirm.querySelector('[data-act="continue"]')?.addEventListener('click', () => {
      removeDismissConfirm();
      onContinue();
    });
    confirm.addEventListener('click', (e) => {
      if (e.target === confirm) removeDismissConfirm();
    });
    document.body.appendChild(confirm);
    dismissConfirmEl = confirm;
  }

  function requestClose() {
    if (!warnings.length) {
      close();
      return;
    }
    showDismissConfirm(close);
  }

  renderList();

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-act="upload"], [data-act="library"]');
    if (!btn || btn.disabled) return;
    const i = Number(btn.dataset.i);
    const w = warnings[i];
    if (!w) return;
    const tab = assetsTabForWarning(w);
    const act = btn.dataset.act;
    btn.disabled = true;
    report.assetsActions?.openAssetsPanel?.();
    const hintName = w.libraryFilename || w.label;
    const run = act === 'upload'
      ? report.assetsActions?.pickUpload?.(tab, { hintFilename: hintName, elevated: true })
      : report.assetsActions?.pickLibrary?.(tab, { hintFilename: hintName, elevated: true });
    void Promise.resolve(run).then((result) => {
      if (result?.ok) {
        notifyAssetAdded(`「${result.filename || w.label}」 추가됨 — 씬 다시 불러오기를 눌러 반영하세요.`);
      }
    }).catch((err) => {
      console.error(err);
      setStatus(`추가 실패: ${err?.message || err}`);
    }).finally(() => {
      btn.disabled = false;
    });
  });

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const close = () => {
    removeDismissConfirm();
    overlay.remove();
  };
  panel.querySelector('[data-act="ok"]')?.addEventListener('click', requestClose);
  reloadBtn?.addEventListener('click', () => {
    reloadBtn.disabled = true;
    setStatus('씬 다시 불러오는 중…');
    void Promise.resolve(report.onReloadScene?.()).then(() => {
      close();
    }).catch((err) => {
      console.error(err);
      reloadBtn.disabled = false;
      setStatus(`씬 불러오기 실패: ${err?.message || err}`);
    });
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  window.addEventListener('keydown', function onKey(e) {
    if (e.key !== 'Escape') return;
    if (dismissConfirmEl) {
      removeDismissConfirm();
      return;
    }
    window.removeEventListener('keydown', onKey);
    requestClose();
  });
}

/** @param {string} kind */
function kindLabel(kind) {
  if (kind === 'motion' || kind === 'character') return '캐릭터';
  if (kind === 'stage') return '스테이지';
  if (kind === 'audio') return '오디오';
  if (kind === 'video') return '비디오';
  if (kind === 'asset') return '에셋';
  return kind;
}

/** @param {string} tab */
function tabLabel(tab) {
  if (tab === 'character') return 'Characters';
  if (tab === 'stage') return 'Stage';
  if (tab === 'video') return 'Video';
  if (tab === 'audio') return 'Audio';
  return tab;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
