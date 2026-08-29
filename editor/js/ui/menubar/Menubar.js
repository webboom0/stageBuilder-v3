import {
  createMenu,
  addOption,
  addSeparator,
  createSubmenu,
  setToggleOn,
} from './menuKit.js';
import {
  GRID_MODE_ADAPTIVE,
  GRID_MODE_FIXED,
  GRID_MODE_GRID_HELPER,
} from '../../domain/stage/stageGridAdaptive.js';

/**
 * @typedef {{
 *   onCameraPreset: (id: string) => void,
 *   onMenuAction: (action: string, payload?: any) => void,
 *   onStageFocusToggle?: () => void,
 *   helpers: import('../../domain/stage/StageViewportHelpers.js').StageViewportHelpers,
 *   onHelpersChanged?: () => void,
 * }} MenubarContext
 */

/**
 * v4 menubar — v3 look, roadmap-oriented menu tree.
 * Unimplemented items call onMenuAction with a stub notice.
 *
 * @param {HTMLElement} host — #menubar
 * @param {MenubarContext} ctx
 */
export function mountMenubar(host, ctx) {
  host.innerHTML = '';
  host.id = 'menubar';
  host.className = 'menubar';

  mountFileMenu(host, ctx);
  mountEditMenu(host, ctx);
  mountSceneMenu(host, ctx);
  mountViewMenu(host, ctx);
  mountShowMenu(host, ctx);
  mountHelpMenu(host, ctx);

  return {
    syncViewToggles: () => syncViewToggleRows(host, ctx),
  };
}

/** @param {MenubarContext} ctx @param {string} action */
function stub(ctx, action) {
  ctx.onMenuAction(action);
}

function mountFileMenu(host, ctx) {
  const { root, options } = createMenu('파일');
  addOption(options, {
    label: '새 프로젝트',
    shortcut: 'Ctrl+N',
    onClick: () => stub(ctx, 'file:new'),
  });
  addOption(options, {
    label: '열기…',
    shortcut: 'Ctrl+O',
    onClick: () => stub(ctx, 'file:open'),
  });
  addOption(options, {
    label: '프로젝트 편집…',
    onClick: () => stub(ctx, 'file:manageProjects'),
  });
  addSeparator(options);
  addOption(options, {
    label: '저장',
    shortcut: 'Ctrl+S',
    onClick: () => stub(ctx, 'file:save'),
  });
  addOption(options, {
    label: '스냅샷 저장…',
    onClick: () => stub(ctx, 'file:export:snapshot'),
  });
  addOption(options, {
    label: '스냅샷에서 복원…',
    onClick: () => stub(ctx, 'file:import:snapshot'),
  });
  addSeparator(options);
  addOption(options, {
    label: 'ZIP 가져오기 (에셋 포함)…',
    onClick: () => stub(ctx, 'file:import:zip'),
  });
  addSeparator(options);

  const exportTitle = addOption(options, { label: '내보내기', submenu: true });
  const exportSub = createSubmenu(exportTitle, root);
  addOption(exportSub, { label: '프로젝트 ZIP (에셋 포함)…', onClick: () => stub(ctx, 'file:export:zip') });
  addOption(exportSub, { label: '현재 씬 렌더…', onClick: () => stub(ctx, 'file:export:renderScene') });
  addOption(exportSub, { label: '전체 렌더…', onClick: () => stub(ctx, 'file:export:renderAll') });

  host.appendChild(root);
}

function mountEditMenu(host, ctx) {
  const { root, options } = createMenu('편집');
  addOption(options, {
    label: '실행 취소',
    shortcut: 'Ctrl+Z',
    onClick: () => stub(ctx, 'edit:undo'),
  });
  addOption(options, {
    label: '다시 실행',
    shortcut: 'Ctrl+Y',
    onClick: () => stub(ctx, 'edit:redo'),
  });
  addSeparator(options);
  addOption(options, { label: '복제', shortcut: 'Ctrl+D', onClick: () => stub(ctx, 'edit:clone') });
  addOption(options, { label: '삭제', shortcut: 'Del', onClick: () => stub(ctx, 'edit:delete') });
  addOption(options, { label: '중앙으로', onClick: () => stub(ctx, 'edit:center') });
  host.appendChild(root);
}

function mountSceneMenu(host, ctx) {
  const { root, options } = createMenu('씬');
  addOption(options, { label: '씬 추가', onClick: () => stub(ctx, 'scene:add') });
  addOption(options, { label: '씬 복제', onClick: () => stub(ctx, 'scene:duplicate') });
  addOption(options, { label: '씬 삭제', onClick: () => stub(ctx, 'scene:delete') });
  addOption(options, { label: '이름 바꾸기…', onClick: () => stub(ctx, 'scene:rename') });
  addSeparator(options);
  addOption(options, { label: '이전 씬', shortcut: 'Ctrl+[', onClick: () => stub(ctx, 'scene:prev') });
  addOption(options, { label: '다음 씬', shortcut: 'Ctrl+]', onClick: () => stub(ctx, 'scene:next') });
  addOption(options, { label: '씬 목록…', onClick: () => stub(ctx, 'scene:list') });
  host.appendChild(root);
}

function mountViewMenu(host, ctx) {
  const { root, options } = createMenu('보기');
  const helpers = ctx.helpers;
  const states = helpers.getHelperStates();

  const helperTitle = addOption(options, { label: '도우미', submenu: true });
  const helperSub = createSubmenu(helperTitle, root);

  const gridRow = addOption(helperSub, {
    label: '그리드 도우미',
    toggle: true,
    toggleOn: states.gridHelper,
    onClick: () => {
      helpers.toggleGrid();
      setToggleOn(gridRow, helpers.getHelperStates().gridHelper);
      ctx.onHelpersChanged?.();
    },
  });
  gridRow.dataset.toggleId = 'gridHelper';

  const adaptiveRow = addOption(helperSub, {
    label: '격자 단위: 자동',
    toggle: true,
    toggleOn: helpers.getGridMode() === GRID_MODE_ADAPTIVE,
    onClick: () => {
      helpers.setGridMode(GRID_MODE_ADAPTIVE);
      syncGridModeToggles(ctx, host, GRID_MODE_ADAPTIVE);
    },
  });
  adaptiveRow.dataset.toggleId = 'gridAdaptive';

  const fixedRow = addOption(helperSub, {
    label: '격자 단위: 1m 고정',
    toggle: true,
    toggleOn: helpers.getGridMode() === GRID_MODE_FIXED,
    onClick: () => {
      helpers.setGridMode(GRID_MODE_FIXED);
      syncGridModeToggles(ctx, host, GRID_MODE_FIXED);
    },
  });
  fixedRow.dataset.toggleId = 'gridFixed';

  const gridHelperRow = addOption(helperSub, {
    label: '격자: GridHelper',
    toggle: true,
    toggleOn: helpers.getGridMode() === GRID_MODE_GRID_HELPER,
    onClick: () => {
      helpers.setGridMode(GRID_MODE_GRID_HELPER);
      syncGridModeToggles(ctx, host, GRID_MODE_GRID_HELPER);
    },
  });
  gridHelperRow.dataset.toggleId = 'gridGridHelper';

  const guideRow = addOption(helperSub, {
    label: '가이드 도우미',
    toggle: true,
    toggleOn: states.guideHelper,
    onClick: () => {
      helpers.toggleGuide();
      setToggleOn(guideRow, helpers.getHelperStates().guideHelper);
      ctx.onHelpersChanged?.();
    },
  });
  guideRow.dataset.toggleId = 'guideHelper';

  addOption(helperSub, {
    label: '골격 도우미',
    toggle: true,
    toggleOn: false,
    onClick: () => stub(ctx, 'view:skeleton'),
  });

  addSeparator(options);

  const camTitle = addOption(options, { label: '카메라', submenu: true });
  const camSub = createSubmenu(camTitle, root);
  const cams = [
    ['perspective', '원근 시점'],
    ['audience', '객석 시점'],
    ['front', '정면 시점'],
    ['right', '우측 시점'],
    ['left', '좌측 시점'],
    ['top', '상단 시점'],
  ];
  for (const [id, label] of cams) {
    addOption(camSub, {
      label,
      onClick: () => ctx.onCameraPreset(id),
    });
  }

  addSeparator(options);
  addOption(options, {
    label: '무대 전체 보기',
    shortcut: 'DblClick',
    onClick: () => ctx.onStageFocusToggle?.(),
  });
  addOption(options, {
    label: '브라우저 전체 화면',
    shortcut: 'F11',
    onClick: () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    },
  });

  host.appendChild(root);
}

function mountShowMenu(host, ctx) {
  const { root, options } = createMenu('연출');
  addOption(options, {
    label: 'Show Control…',
    onClick: () => stub(ctx, 'show:panel'),
  });
  addOption(options, { label: 'GO', shortcut: 'Space', onClick: () => stub(ctx, 'show:go') });
  addOption(options, { label: 'Standby', onClick: () => stub(ctx, 'show:standby') });
  addSeparator(options);
  addOption(options, {
    label: '무대연출 프리셋…',
    onClick: () => stub(ctx, 'show:presets'),
  });
  host.appendChild(root);
}

function mountHelpMenu(host, ctx) {
  const { root, options } = createMenu('도움말');
  addOption(options, {
    label: '사용자 튜토리얼…',
    onClick: () => stub(ctx, 'help:tutorial'),
  });
  addOption(options, {
    label: '작업 단위 테스트…',
    onClick: () => stub(ctx, 'help:qa'),
  });
  addSeparator(options);
  addOption(options, {
    label: 'StageBuilder v4 정보',
    onClick: () => stub(ctx, 'help:about'),
  });
  host.appendChild(root);
}

/** @param {MenubarContext} ctx @param {HTMLElement} host @param {string} mode */
function syncGridModeToggles(ctx, host, mode) {
  host.querySelectorAll('[data-toggle-id]').forEach((el) => {
    const id = el.getAttribute('data-toggle-id');
    if (id === 'gridAdaptive') {
      setToggleOn(/** @type {HTMLElement} */ (el), mode === GRID_MODE_ADAPTIVE);
    }
    if (id === 'gridFixed') {
      setToggleOn(/** @type {HTMLElement} */ (el), mode === GRID_MODE_FIXED);
    }
    if (id === 'gridGridHelper') {
      setToggleOn(/** @type {HTMLElement} */ (el), mode === GRID_MODE_GRID_HELPER);
    }
  });
  ctx.onHelpersChanged?.();
}

/** @param {HTMLElement} host @param {MenubarContext} ctx */
function syncViewToggleRows(host, ctx) {
  const states = ctx.helpers.getHelperStates();
  const mode = ctx.helpers.getGridMode();
  host.querySelectorAll('[data-toggle-id]').forEach((el) => {
    const id = el.getAttribute('data-toggle-id');
    if (id === 'gridHelper') setToggleOn(/** @type {HTMLElement} */ (el), !!states.gridHelper);
    if (id === 'guideHelper') setToggleOn(/** @type {HTMLElement} */ (el), !!states.guideHelper);
    if (id === 'gridFixed') setToggleOn(/** @type {HTMLElement} */ (el), mode === GRID_MODE_FIXED);
    if (id === 'gridAdaptive') setToggleOn(/** @type {HTMLElement} */ (el), mode === GRID_MODE_ADAPTIVE);
    if (id === 'gridGridHelper') {
      setToggleOn(/** @type {HTMLElement} */ (el), mode === GRID_MODE_GRID_HELPER);
    }
  });
}
