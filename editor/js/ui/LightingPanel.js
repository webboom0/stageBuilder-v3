import { asLightKeyValue } from '../domain/lighting/lightKeyValue.js';
import { asFixtureKeyValue } from '../domain/lighting/fixtureKeyValue.js';
import {
  rgb01ToHex,
  hexToRgb01,
  isWorkLightActive,
  setWorkLightActive,
  setWorkLightSlider,
  readWorkLightLevel,
} from '../domain/lighting/houseStageLights.js';
import { buildDefaultFixtureGroups } from '../domain/lighting/fixtureGroups.js';
import {
  beginLightingGesture,
  createLightingHistoryContext,
  endLightingGesture,
  runLightingEdit,
} from '../domain/lighting/lightingHistory.js';

const HOUSE_UI = Object.freeze([
  { channel: 'fill', label: 'Stage Fill', hasSize: false },
  { channel: 'L', label: 'FOH Left', hasSize: true },
  { channel: 'C', label: 'FOH Center', hasSize: true },
  { channel: 'R', label: 'FOH Right', hasSize: true },
]);

/** v3 MA color swatches */
const FX_COLOR_SWATCHES = [
  { r: 1, g: 0.12, b: 0.1 },
  { r: 1, g: 0.28, b: 0.12 },
  { r: 1, g: 0.48, b: 0.1 },
  { r: 1, g: 0.72, b: 0.2 },
  { r: 1, g: 0.92, b: 0.35 },
  { r: 0.55, g: 1, b: 0.28 },
  { r: 0.2, g: 0.85, b: 0.45 },
  { r: 0.15, g: 0.72, b: 0.95 },
  { r: 0.22, g: 0.42, b: 1 },
  { r: 0.45, g: 0.22, b: 1 },
  { r: 0.75, g: 0.28, b: 1 },
  { r: 1, g: 0.35, b: 0.82 },
  { r: 0.95, g: 0.95, b: 0.95 },
  { r: 0.72, g: 0.72, b: 0.78 },
  { r: 0.42, g: 0.42, b: 0.48 },
  { r: 0.18, g: 0.18, b: 0.22 },
  { r: 1, g: 0.55, b: 0.65 },
  { r: 0.62, g: 0.38, b: 0.22 },
  { r: 0.35, g: 0.55, b: 0.28 },
  { r: 0.05, g: 0.35, b: 0.55 },
];

const ATTR_TABS = Object.freeze([
  {
    id: 'Dimmer',
    fields: [
      { key: 'dim', label: 'Dim', min: 0, max: 100, unit: '%' },
      { key: 'focus', label: 'Focus', min: 0, max: 100, unit: '%' },
    ],
  },
  {
    id: 'Position',
    fields: [
      { key: 'pan', label: 'Pan', min: -270, max: 270, unit: '°' },
      { key: 'tilt', label: 'Tilt', min: -120, max: 120, unit: '°' },
    ],
  },
  {
    id: 'Beam',
    fields: [
      { key: 'zoom', label: 'Zoom', min: 5, max: 50, unit: '°' },
      { key: 'focus', label: 'Focus', min: 0, max: 100, unit: '%' },
    ],
  },
  { id: 'Color', fields: [] },
]);

/**
 * v3-style lighting panel — HOUSE + Fixture sheet / groups / attrs / +key.
 *
 * @param {{
 *   engine: import('../domain/timeline/TimelineEngine.js').TimelineEngine,
 *   light: import('../domain/lighting/LightDirector.js').LightDirector,
 *   fixtures: import('../domain/lighting/FixtureDirector.js').FixtureDirector,
 *   scene: import('three').Scene,
 *   onChange?: () => void,
 * }} opts
 */
export function createLightingPanelBody(opts) {
  const { engine, light, fixtures, scene } = opts;
  /** @type {{ sync: () => void }} */
  const panelHooks = { sync: () => {} };
  const historyCtx = createLightingHistoryContext({
    engine,
    light,
    fixtures,
    scene,
    onAfterApply: () => {
      opts.onChange?.();
      panelHooks.sync();
    },
  });
  const root = document.createElement('div');
  root.className = 'sb-panel-body sb-light-panel';

  root.innerHTML = `
    <div class="sb-light-master">
      <div class="sb-light-master-row">
        <button type="button" class="sb-chip" data-act="work" title="작업등 ON/OFF">☀ WORK</button>
        <input type="range" class="sb-light-work-slider" data-role="work-level" min="0" max="100" step="1" value="62" title="작업등 밝기" />
        <span class="sb-light-dim-val" data-role="work-val">62%</span>
      </div>
    </div>

    <div class="sb-light-mode-tabs" role="tablist" aria-label="조명 종류">
      <button type="button" class="sb-light-mode-tab is-on" data-light-tab="house" role="tab" aria-selected="true">HOUSE</button>
      <button type="button" class="sb-light-mode-tab" data-light-tab="fixture" role="tab" aria-selected="false">Fixture</button>
    </div>

    <div class="sb-light-pane" data-pane="house" role="tabpanel">
      <div class="sb-light-sec-head">핀조명 <span class="sb-light-sec-hint">Fill · FOH</span></div>
      <div class="sb-light-house" data-role="house"></div>
      <div class="sb-light-kf-bar">
        <button type="button" class="sb-chip acc sb-light-kf-btn" data-act="house-key" title="HOUSE 키 추가">+ 키</button>
        <button type="button" class="sb-chip sb-light-kf-btn" data-act="house-kf-prev" title="이전 키">◀</button>
        <button type="button" class="sb-chip sb-light-kf-btn" data-act="house-kf-next" title="다음 키">▶</button>
        <button type="button" class="sb-chip del sb-light-kf-btn" data-act="house-kf-del" title="플레이헤드 키 삭제"><i class="fas fa-trash" aria-hidden="true"></i></button>
        <button type="button" class="sb-chip del sb-light-kf-btn sb-light-track-del" data-act="house-track-del" title="선택 HOUSE 트랙 삭제 (키 포함)" disabled>트랙 삭제</button>
      </div>
      <p class="sb-light-hint" data-role="house-hint">채널 선택 · 라이브 · +키로 기록</p>
    </div>

    <div class="sb-light-pane" data-pane="fixture" role="tabpanel" hidden>
      <p class="sb-light-selinfo" data-role="fx-sel">선택 없음</p>
      <div class="sb-light-fx-dim sb-light-fx-bus">
        <label title="키 Dim 값은 그대로 · 화면 전체 세기만 조절">전체 밝기</label>
        <input type="range" data-role="fix-bus" min="0" max="100" step="1" value="100" />
        <span class="sb-light-dim-val" data-role="fix-bus-val">100%</span>
      </div>
      <div class="sb-light-fx-grid" data-role="fx-grid"></div>

      <div class="sb-light-subsec">GROUPS</div>
      <div class="sb-light-groups" data-role="fx-groups"></div>

      <div class="sb-light-attr-tabs" data-role="fx-tabs"></div>
      <div class="sb-light-attr-fields" data-role="fx-fields"></div>
      <div class="sb-light-color-wrap" data-role="fx-color" hidden>
        <div class="sb-light-color-grid" data-role="fx-swatches"></div>
        <div class="ec-row sb-light-rgb"><label>R</label><input type="range" data-role="fx-r" min="0" max="255" value="255" disabled /><span data-role="fx-r-val">255</span></div>
        <div class="ec-row sb-light-rgb"><label>G</label><input type="range" data-role="fx-g" min="0" max="255" value="255" disabled /><span data-role="fx-g-val">255</span></div>
        <div class="ec-row sb-light-rgb"><label>B</label><input type="range" data-role="fx-b" min="0" max="255" value="255" disabled /><span data-role="fx-b-val">255</span></div>
      </div>
      <div class="sb-light-kf-bar sb-light-kf-bar--bottom">
        <button type="button" class="sb-chip acc sb-light-kf-btn" data-act="fx-key" title="Fixture 키 추가">+ 키</button>
        <button type="button" class="sb-chip sb-light-kf-btn" data-act="fx-kf-prev" title="이전 키">◀</button>
        <button type="button" class="sb-chip sb-light-kf-btn" data-act="fx-kf-next" title="다음 키">▶</button>
        <button type="button" class="sb-chip del sb-light-kf-btn" data-act="fx-kf-del" title="플레이헤드 키 삭제"><i class="fas fa-trash" aria-hidden="true"></i></button>
        <button type="button" class="sb-chip del sb-light-kf-btn sb-light-track-del" data-act="fx-track-del" title="선택 Fixture 트랙 삭제 (키 포함)" disabled>트랙 삭제</button>
      </div>
    </div>
  `;

  const houseHost = root.querySelector('[data-role="house"]');
  const houseHint = root.querySelector('[data-role="house-hint"]');
  const housePane = /** @type {HTMLElement} */ (root.querySelector('[data-pane="house"]'));
  const fixturePane = /** @type {HTMLElement} */ (root.querySelector('[data-pane="fixture"]'));
  const fxGrid = root.querySelector('[data-role="fx-grid"]');
  const fxGroups = root.querySelector('[data-role="fx-groups"]');
  const fxTabs = root.querySelector('[data-role="fx-tabs"]');
  const fxFields = root.querySelector('[data-role="fx-fields"]');
  const fxColorWrap = root.querySelector('[data-role="fx-color"]');
  const fxSwatches = root.querySelector('[data-role="fx-swatches"]');
  const fxSelInfo = root.querySelector('[data-role="fx-sel"]');
  const fxR = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="fx-r"]'));
  const fxG = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="fx-g"]'));
  const fxB = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="fx-b"]'));
  const fxRVal = root.querySelector('[data-role="fx-r-val"]');
  const fxGVal = root.querySelector('[data-role="fx-g-val"]');
  const fxBVal = root.querySelector('[data-role="fx-b-val"]');
  const workBtn = root.querySelector('[data-act="work"]');
  const workLevel = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="work-level"]'));
  const workVal = root.querySelector('[data-role="work-val"]');
  const fixBusSlider = /** @type {HTMLInputElement} */ (root.querySelector('[data-role="fix-bus"]'));
  const fixBusVal = root.querySelector('[data-role="fix-bus-val"]');
  const houseTrackDelBtn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-act="house-track-del"]'));
  const fxTrackDelBtn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-act="fx-track-del"]'));

  /** @type {'house' | 'fixture'} */
  let lightTab = 'house';
  /** @type {string | null} */
  let selectedHouseChannel = null;
  /** @type {Set<number>} */
  let selectedFids = new Set();
  /** Panel picked fixtures — don't let timeline sync() shrink to keyed-only subset */
  let panelOwnsSelection = false;
  let attrPage = 'Dimmer';
  let syncing = false;
  /** True while user is dragging a panel slider — skip engine-driven full sync */
  let scrubbingUi = false;
  let ready = false;
  let ensuring = false;
  /** @type {ReturnType<typeof buildDefaultFixtureGroups>} */
  let groups = {};

  function setLightTab(tab) {
    lightTab = tab === 'fixture' ? 'fixture' : 'house';
    root.querySelectorAll('[data-light-tab]').forEach((btn) => {
      const on = btn.getAttribute('data-light-tab') === lightTab;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (housePane) housePane.hidden = lightTab !== 'house';
    if (fixturePane) fixturePane.hidden = lightTab !== 'fixture';
  }

  function ensureReady() {
    if (ready || ensuring) return;
    ensuring = true;
    try {
      light.ensureHouseLights();
      fixtures.ensureRig();
      ready = true;
      buildHouseRows();
      buildSwatches();
      buildTabs();
      refreshSheet();
      refreshGroups();
      refreshAttrFields();
    } finally {
      ensuring = false;
    }
  }

  function selectTimelineTrack(trackId) {
    if (!trackId) return;
    if (typeof engine.selectTracks === 'function') {
      engine.selectTracks([trackId]);
    } else {
      engine.selectedTrackId = trackId;
      engine.selectedKeyframeId = null;
      engine.emit('selection');
    }
    opts.onChange?.();
  }

  /** Highlight fixture tracks + select keys @ playhead for panel selection. */
  function syncTimelineFromFixtureSelection() {
    const fids = [...selectedFids];
    if (!fids.length) {
      engine.selectTracks?.([]);
      return;
    }
    const tracked = fids.filter((fid) => fixtures.findByFid(fid));
    if (!tracked.length) {
      engine.selectTracks?.([]);
      opts.onChange?.();
      return;
    }
    fixtures.selectKeysAtPlayheadForFids(tracked);
    opts.onChange?.();
  }

  /**
   * Panel-driven fixture selection (grid / groups). Keeps full fid set even when
   * only some fixtures have timeline tracks.
   * @param {Iterable<number>} fids
   * @param {{ mode?: 'replace' | 'toggle' | 'add' }} [opt]
   */
  function applyFixturePanelSelection(fids, opt = {}) {
    const ids = [...fids].map(Number).filter(Number.isFinite);
    const mode = opt.mode || 'replace';
    if (mode === 'toggle' && ids.length === 1) {
      const fid = ids[0];
      if (selectedFids.has(fid)) selectedFids.delete(fid);
      else selectedFids.add(fid);
    } else if (mode === 'add') {
      for (const fid of ids) selectedFids.add(fid);
    } else {
      selectedFids = new Set(ids);
    }
    setLightTab('fixture');
    selectedHouseChannel = null;
    panelOwnsSelection = true;
    syncFxEngineSelection();
    highlightHouse();
    refreshSheet();
    refreshGroups();
    updateFxSelInfo();
    refreshAttrFields();
    syncRgbSliders();
    syncTimelineFromFixtureSelection();
    queueMicrotask(() => { panelOwnsSelection = false; });
  }

  function syncFxEngineSelection() {
    fixtures.fxEngine?.setSelection?.([...selectedFids]);
  }

  function refreshMasterUi() {
    if (!scene) return;
    const lv = readWorkLightLevel(scene);
    const pct = Math.round(lv * 100);
    workBtn?.classList.toggle('on', isWorkLightActive(scene));
    if (workLevel && !scrubbingUi) workLevel.value = String(pct);
    if (workVal) workVal.textContent = `${pct}%`;
    const bus = Math.round((fixtures.fxEngine?.fixtureBus ?? 1) * 100);
    if (fixBusSlider) fixBusSlider.value = String(bus);
    if (fixBusVal) fixBusVal.textContent = `${bus}%`;
  }

  function displayHouseBag(channel) {
    const ch = findHouseChannel(channel);
    if (ch) {
      const track = engine.getTrack(ch.trackId);
      if (engine.selectedTrackId === ch.trackId && engine.selectedKeyframeId && track) {
        const kf = track.keys.get(engine.selectedKeyframeId);
        if (kf?.value && Math.abs(kf.timeSec - engine.playheadSec) <= 1e-4) {
          return asLightKeyValue(kf.value);
        }
      }
      return light.liveBagForTrack(ch.trackId) || asLightKeyValue({});
    }
    return light.liveBagForChannel?.(channel) || asLightKeyValue({});
  }

  function displayFixtureBag(fid, trackId = null) {
    if (trackId) {
      const track = engine.getTrack(trackId);
      if (engine.selectedTrackId === trackId && engine.selectedKeyframeId && track) {
        const kf = track.keys.get(engine.selectedKeyframeId);
        if (kf?.value && Math.abs(kf.timeSec - engine.playheadSec) <= 1e-4) {
          return asFixtureKeyValue(kf.value);
        }
      }
      return fixtures.liveBagForTrack(trackId) || asFixtureKeyValue({});
    }
    return fixtures.liveBagForFid?.(fid) || asFixtureKeyValue({});
  }

  function findHouseChannel(channel) {
    return light.findByChannel?.(channel)
      || light.list().find((c) => c.channel === channel)
      || null;
  }

  function buildHouseRows() {
    houseHost.innerHTML = '';
    for (const def of HOUSE_UI) {
      const row = document.createElement('div');
      row.className = 'sb-house-channel';
      row.dataset.houseChannel = def.channel;
      row.tabIndex = 0;
      row.innerHTML = `
        <div class="ec-row">
          <label>${def.label}</label>
          <input type="range" class="acc" data-k="dim" min="0" max="100" step="1" />
          <span class="sb-light-dim-val" data-k="dim-val">0%</span>
        </div>
        <div class="ec-row sb-house-color-row">
          <label>색상</label>
          <input type="color" data-k="color" value="#ffffff" />
        </div>
        ${def.hasSize ? `
        <div class="ec-row">
          <label>Size</label>
          <input type="range" class="acc" data-k="size" min="0" max="100" step="1" />
          <span class="sb-light-dim-val" data-k="size-val">50%</span>
        </div>` : ''}
      `;
      row.addEventListener('click', (e) => {
        if (e.target.closest('input')) return;
        selectHouseChannel(def.channel);
      });
      houseHost.appendChild(row);
    }
    houseHost.querySelectorAll('.sb-house-channel').forEach((row) => {
      const channel = row.dataset.houseChannel;
      row.querySelectorAll('input').forEach((input) => {
        const ev = input.type === 'color' ? 'input' : 'input';
        input.addEventListener(ev, () => {
          if (syncing) return;
          selectHouseChannel(channel, { syncTimeline: false });
          pushHouseFromRow(/** @type {HTMLElement} */ (row), channel);
        });
      });
    });
    refreshAllHouseRows();
  }

  function pushHouseFromRow(row, channel) {
    const dimEl = /** @type {HTMLInputElement} */ (row.querySelector('[data-k="dim"]'));
    const colorEl = /** @type {HTMLInputElement} */ (row.querySelector('[data-k="color"]'));
    const sizeEl = /** @type {HTMLInputElement} */ (row.querySelector('[data-k="size"]'));
    const patch = {
      dim: Number(dimEl?.value || 0) / 100,
      color: colorEl?.value || '#ffffff',
    };
    if (sizeEl) patch.size = Number(sizeEl.value || 0) / 100;
    const ch = findHouseChannel(channel);
    if (ch) {
      engine.selectedTrackId = ch.trackId;
      light.writeBagOnSelectedKey(ch.trackId, patch);
    } else {
      light.writeLiveForChannel(channel, patch);
    }
    opts.onChange?.();
    refreshSheet();
  }

  function selectHouseChannel(channel, { syncTimeline = true } = {}) {
    setLightTab('house');
    selectedHouseChannel = channel;
    selectedFids.clear();
    syncFxEngineSelection();
    highlightHouse();
    refreshSheet();
    refreshGroups();
    updateFxSelInfo();
    refreshAttrFields();
    if (syncTimeline) {
      const ch = findHouseChannel(channel);
      if (ch) selectTimelineTrack(ch.trackId);
    }
    const def = HOUSE_UI.find((d) => d.channel === channel);
    const hasTrack = !!findHouseChannel(channel);
    if (houseHint && def) {
      houseHint.textContent = hasTrack
        ? `선택: ${def.label} · 트랙 있음 · +키로 기록`
        : `선택: ${def.label} · 라이브 · +키 (트랙 자동)`;
    }
    refreshTrackDeleteButtons();
  }

  function highlightHouse() {
    houseHost.querySelectorAll('.sb-house-channel').forEach((el) => {
      const ch = el.dataset.houseChannel;
      el.classList.toggle('is-selected', ch === selectedHouseChannel);
      el.classList.toggle('has-track', !!findHouseChannel(ch));
    });
  }

  function refreshAllHouseRows() {
    syncing = true;
    for (const def of HOUSE_UI) {
      const bag = displayHouseBag(def.channel);
      const row = houseHost.querySelector(`[data-house-channel="${def.channel}"]`);
      if (!row) continue;
      row.classList.toggle('has-track', !!findHouseChannel(def.channel));
      const dimEl = /** @type {HTMLInputElement} */ (row.querySelector('[data-k="dim"]'));
      const dimVal = row.querySelector('[data-k="dim-val"]');
      const colorEl = /** @type {HTMLInputElement} */ (row.querySelector('[data-k="color"]'));
      const sizeEl = /** @type {HTMLInputElement} */ (row.querySelector('[data-k="size"]'));
      const sizeVal = row.querySelector('[data-k="size-val"]');
      const pct = Math.round(bag.dim * 100);
      if (dimEl) dimEl.value = String(pct);
      if (dimVal) dimVal.textContent = `${pct}%`;
      if (colorEl) {
        colorEl.value = bag.color?.startsWith('#') ? bag.color : '#ffffff';
      }
      if (sizeEl && sizeVal) {
        const sp = Math.round(bag.size * 100);
        sizeEl.value = String(sp);
        sizeVal.textContent = `${sp}%`;
      }
    }
    syncing = false;
  }

  function shortGrp(grp) {
    if (grp === 'mh') return 'MH';
    if (grp === 'foh') return 'FOH';
    if (grp === 'back') return 'BACK';
    return grp || 'FX';
  }

  function refreshSheet() {
    fxGrid.innerHTML = '';
    const list = (fixtures.listRigFixtures?.() || fixtures.list()).sort((a, b) => a.fid - b.fid);
    if (!list.length) {
      fxGrid.innerHTML = '<div class="sb-light-fx-empty">Fixture 리그가 없습니다</div>';
      return;
    }
    for (const ch of list) {
      const hasTrack = !!(ch.hasTrack || ch.trackId);
      const bag = displayFixtureBag(ch.fid, ch.trackId || null);
      const dimPct = Math.round(bag.dim * 100);
      const rgb = hexToRgb01(bag.color || '#ffffff');
      const c = `rgb(${Math.round(rgb.r * 255)},${Math.round(rgb.g * 255)},${Math.round(rgb.b * 255)})`;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'sb-ma-fx'
        + (selectedFids.has(ch.fid) ? ' sel' : '')
        + (hasTrack ? ' has-track' : ' no-track');
      el.dataset.fid = String(ch.fid);
      el.title = hasTrack
        ? `#${ch.fid} ${ch.name} · 트랙`
        : `#${ch.fid} ${ch.name} · 트랙 없음 · 선택 후 +키`;
      el.innerHTML = `
        <span class="sb-ma-fx-id">${ch.fid}</span>
        <span class="sb-ma-fx-sw" style="background:${c}"></span>
        <span class="sb-ma-fx-nm">${shortGrp(ch.grp)}${hasTrack ? ' ·T' : ''}</span>
        <span class="sb-ma-fx-dim">${hasTrack ? (dimPct || '·') : '—'}</span>
        <span class="sb-ma-fx-bar"><i style="width:${hasTrack ? dimPct : 0}%"></i></span>
      `;
      el.addEventListener('click', (ev) => {
        const fid = ch.fid;
        if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
          applyFixturePanelSelection([fid], { mode: 'toggle' });
          return;
        }
        applyFixturePanelSelection([fid]);
      });
      el.addEventListener('dblclick', (ev) => {
        ev.preventDefault();
        applyFixturePanelSelection([ch.fid]);
        const live = hasTrack
          ? fixtures.liveBagForTrack(ch.trackId)
          : fixtures.liveBagForFid?.(ch.fid);
        const cur = Math.round((live?.dim || 0) * 100);
        runLightingEdit(historyCtx, 'Fixture Dim', () => {
          writeFxPatch({ dim: (cur > 0 ? 0 : 50) / 100 });
        });
      });
      el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        const fe = fixtures.fxEngine;
        const f = fe?.getFixture?.(ch.fid);
        if (!f) return;
        runLightingEdit(historyCtx, 'Fixture ON/OFF', () => {
          fe.setFixtureEnabled(ch.fid, !f.enabled);
          refreshSheet();
        });
      });
      fxGrid.appendChild(el);
    }
  }

  function selectionMatchesGroup(ids) {
    if (!selectedFids.size || !ids?.length || selectedFids.size !== ids.length) return false;
    const a = [...selectedFids].sort((x, y) => x - y).join(',');
    const b = [...ids].sort((x, y) => x - y).join(',');
    return a === b;
  }

  function refreshGroups() {
    const rig = fixtures.listRigFixtures?.() || fixtures.list();
    const withGrp = rig.map((c) => ({
      fid: c.fid,
      grp: c.grp || fixtures.fxEngine?.getFixture?.(c.fid)?.grp,
    }));
    groups = buildDefaultFixtureGroups(withGrp);

    fxGroups.innerHTML = '';
    Object.entries(groups).forEach(([n, g]) => {
      const b = document.createElement('button');
      b.type = 'button';
      const active = selectionMatchesGroup(g.ids);
      b.className = 'sb-ma-grp' + (g.ids?.length ? '' : ' empty') + (active ? ' on' : '');
      b.innerHTML = `<span class="gn">G${n}</span><span class="gn-name">${g.name}</span><span class="cnt">${g.ids?.length || 0}</span>`;
      if (g.ids?.length) {
        b.onclick = () => {
          applyFixturePanelSelection(g.ids);
        };
      }
      fxGroups.appendChild(b);
    });
  }

  function buildTabs() {
    fxTabs.innerHTML = '';
    ATTR_TABS.forEach((tab) => {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'sb-ma-tab' + (tab.id === attrPage ? ' on' : '');
      t.textContent = tab.id.toUpperCase();
      t.onclick = () => {
        attrPage = tab.id;
        buildTabs();
        refreshAttrFields();
      };
      fxTabs.appendChild(t);
    });
  }

  function buildSwatches() {
    fxSwatches.innerHTML = '';
    FX_COLOR_SWATCHES.forEach((sw) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sb-ma-swatch';
      b.style.background = `rgb(${Math.round(sw.r * 255)},${Math.round(sw.g * 255)},${Math.round(sw.b * 255)})`;
      b.onclick = () => {
        if (!selectedFids.size) return;
        runLightingEdit(historyCtx, '컬러 팔레트', () => {
          writeFxPatch({ color: rgb01ToHex(sw.r, sw.g, sw.b) });
        });
      };
      fxSwatches.appendChild(b);
    });
  }

  function firstSelectedBag() {
    if (!selectedFids.size) return asFixtureKeyValue({});
    const fid = [...selectedFids][0];
    const fx = fixtures.findByFid(fid);
    return displayFixtureBag(fid, fx?.trackId || null);
  }

  function refreshAttrFields() {
    const tab = ATTR_TABS.find((t) => t.id === attrPage) || ATTR_TABS[0];
    const isColor = attrPage === 'Color';
    fxColorWrap.hidden = !isColor;
    fxFields.hidden = isColor;
    fxFields.innerHTML = '';
    if (isColor) {
      syncRgbSliders();
      return;
    }
    const bag = firstSelectedBag();
    const hasSel = selectedFids.size > 0;
    for (const field of tab.fields) {
      let val = Number(bag[field.key]);
      if (field.key === 'dim') val = Math.round(bag.dim * 100);
      if (!Number.isFinite(val)) val = field.min;
      const row = document.createElement('div');
      row.className = 'ec-row sb-light-attr-row';
      row.innerHTML = `
        <label>${field.label}</label>
        <input type="range" data-attr="${field.key}" min="${field.min}" max="${field.max}" step="1" value="${val}" ${hasSel ? '' : 'disabled'} />
        <span class="sb-light-dim-val" data-attr-val="${field.key}">${Math.round(val)}${field.unit}</span>
      `;
      const range = /** @type {HTMLInputElement} */ (row.querySelector('input'));
      const valEl = row.querySelector(`[data-attr-val="${field.key}"]`);
      range.addEventListener('pointerdown', () => {
        if (!hasSel) return;
        scrubbingUi = true;
        beginLightingGesture(historyCtx);
      });
      const endAttrScrub = () => {
        if (!scrubbingUi) return;
        scrubbingUi = false;
        endLightingGesture(historyCtx, `Fixture ${field.label}`);
        refreshSheet();
        refreshAttrFields();
      };
      range.addEventListener('pointerup', endAttrScrub);
      range.addEventListener('pointercancel', endAttrScrub);
      range.addEventListener('input', () => {
        if (syncing || !selectedFids.size) return;
        const n = Number(range.value);
        if (valEl) valEl.textContent = `${Math.round(n)}${field.unit}`;
        const patch = {};
        if (field.key === 'dim') patch.dim = n / 100;
        else patch[field.key] = n;
        writeFxPatch(patch, { refreshUi: false });
        refreshSheet();
      });
      range.addEventListener('change', endAttrScrub);
      fxFields.appendChild(row);
    }
  }

  function syncRgbSliders() {
    const hasSel = selectedFids.size > 0;
    [fxR, fxG, fxB].forEach((el) => { el.disabled = !hasSel; });
    if (!hasSel) return;
    const bag = firstSelectedBag();
    const rgb = hexToRgb01(bag.color || '#ffffff');
    syncing = true;
    fxR.value = String(Math.round(rgb.r * 255));
    fxG.value = String(Math.round(rgb.g * 255));
    fxB.value = String(Math.round(rgb.b * 255));
    fxRVal.textContent = fxR.value;
    fxGVal.textContent = fxG.value;
    fxBVal.textContent = fxB.value;
    syncing = false;
  }

  function writeFxPatch(patch, { refreshUi = true } = {}) {
    if (!selectedFids.size) return;
    const prevKeys = engine.listSelectedKeys?.() || [];
    for (const fid of selectedFids) {
      const fx = fixtures.findByFid(fid);
      if (fx) {
        fixtures.writeBagOnSelectedKey(fx.trackId, patch);
      } else {
        fixtures.writeLiveForFid(fid, patch);
      }
    }
    if (prevKeys.length > 1) {
      engine.selectKeyframes(prevKeys);
    }
    opts.onChange?.();
    if (refreshUi) {
      refreshSheet();
      refreshAttrFields();
      syncRgbSliders();
    }
  }

  function addFxKeysAtPlayhead() {
    if (!selectedFids.size) {
      window.alert('픽스처를 먼저 선택하세요.');
      return;
    }
    runLightingEdit(historyCtx, 'Fixture +키', () => {
      const fids = [...selectedFids];
      fixtures.addKeysForFids(fids);
      selectedFids = new Set(fids);
      selectedHouseChannel = null;
      syncFxEngineSelection();
      fixtures.selectKeysAtPlayheadForFids(fids);
      refreshSheet();
      updateFxSelInfo();
      refreshTrackDeleteButtons();
    });
  }

  function updateFxSelInfo() {
    if (!selectedFids.size) {
      fxSelInfo.textContent = '선택 없음';
      refreshTrackDeleteButtons();
      return;
    }
    const ids = [...selectedFids].sort((a, b) => a - b);
    const tracked = ids.filter((id) => !!fixtures.findByFid(id)).length;
    fxSelInfo.textContent = ids.length === 1
      ? `1 selected · #${ids[0]}${tracked ? ' · 트랙' : ''}`
      : `${ids.length} selected · 트랙 ${tracked}/${ids.length}`;
    refreshTrackDeleteButtons();
  }

  function sync() {
    if (ensuring || scrubbingUi) return;
    ensureReady();
    refreshMasterUi();
    refreshAllHouseRows();
    highlightHouse();

    const trackId = engine.selectedTrackId;
    if (trackId) {
      const house = light.findByTrackId(trackId);
      if (house) {
        setLightTab('house');
        selectedHouseChannel = house.channel;
        selectedFids.clear();
        syncFxEngineSelection();
        highlightHouse();
        refreshSheet();
        refreshGroups();
        updateFxSelInfo();
        refreshAttrFields();
        refreshTrackDeleteButtons();
        return;
      }
      const trackIds = engine.selectedTrackIds?.size
        ? [...engine.selectedTrackIds]
        : [trackId];
      const fids = trackIds
        .map((id) => fixtures.findByTrackId(id)?.fid)
        .filter((fid) => fid != null);
      if (fids.length) {
        setLightTab('fixture');
        if (!panelOwnsSelection) {
          selectedFids = new Set(fids);
        }
        selectedHouseChannel = null;
        syncFxEngineSelection();
      }
    }
    highlightHouse();
    refreshSheet();
    refreshGroups();
    updateFxSelInfo();
    refreshAttrFields();
    syncRgbSliders();
    refreshTrackDeleteButtons();
  }

  function refreshTrackDeleteButtons() {
    const houseHas = !!(selectedHouseChannel && findHouseChannel(selectedHouseChannel));
    if (houseTrackDelBtn) {
      houseTrackDelBtn.disabled = !houseHas;
      houseTrackDelBtn.title = houseHas
        ? '선택 HOUSE 트랙 삭제 (키 포함)'
        : '트랙 없음';
    }
    let fxTrackCount = 0;
    let fxKeyCount = 0;
    for (const fid of selectedFids) {
      const fx = fixtures.findByFid(fid);
      if (!fx) continue;
      fxTrackCount += 1;
      fxKeyCount += engine.getTrack(fx.trackId)?.keys?.length || 0;
    }
    if (fxTrackDelBtn) {
      fxTrackDelBtn.disabled = fxTrackCount === 0;
      fxTrackDelBtn.title = fxTrackCount
        ? `선택 Fixture 트랙 ${fxTrackCount}개 삭제${fxKeyCount ? ` · 키 ${fxKeyCount}개 포함` : ''}`
        : '트랙 없음 · 선택 후 +키로 생성';
    }
  }

  function removeSelectedHouseTrack() {
    const channel = selectedHouseChannel;
    if (!channel) {
      window.alert('HOUSE 채널을 먼저 선택하세요.');
      return;
    }
    const ch = findHouseChannel(channel);
    if (!ch) return;
    const nKeys = engine.getTrack(ch.trackId)?.keys?.length || 0;
    const msg = nKeys
      ? `HOUSE «${ch.name || channel}» 트랙을 삭제할까요?\n키 ${nKeys}개도 함께 삭제됩니다.`
      : `HOUSE «${ch.name || channel}» 트랙을 삭제할까요?`;
    if (!window.confirm(msg)) return;
    runLightingEdit(historyCtx, 'HOUSE 트랙 삭제', () => {
      light.removeTrackById(ch.trackId, { history: false });
      refreshAllHouseRows();
      highlightHouse();
      refreshTrackDeleteButtons();
    });
  }

  function removeSelectedFixtureTracks() {
    const fids = [...selectedFids];
    const tracks = fids
      .map((fid) => fixtures.findByFid(fid))
      .filter(Boolean);
    if (!tracks.length) {
      window.alert('트랙이 있는 픽스처를 선택하세요.');
      return;
    }
    let nKeys = 0;
    for (const fx of tracks) {
      nKeys += engine.getTrack(fx.trackId)?.keys?.length || 0;
    }
    const msg = nKeys
      ? `Fixture 트랙 ${tracks.length}개를 삭제할까요?\n키 ${nKeys}개도 함께 삭제됩니다.`
      : `Fixture 트랙 ${tracks.length}개를 삭제할까요?`;
    if (!window.confirm(msg)) return;
    runLightingEdit(historyCtx, 'Fixture 트랙 삭제', () => {
      for (const fx of tracks) {
        fixtures.removeTrackById(fx.trackId, { history: false });
      }
      refreshSheet();
      updateFxSelInfo();
      refreshTrackDeleteButtons();
      refreshAttrFields();
    });
  }

  function addHouseKeyAtPlayhead() {
    runLightingEdit(historyCtx, 'HOUSE +키', () => {
      const channel = selectedHouseChannel || 'fill';
      selectHouseChannel(channel, { syncTimeline: false });
      const ch = light.ensureTrackForChannel(channel);
      if (!ch) return;
      engine.selectedTrackId = ch.trackId;
      engine.selectedKeyframeId = null;
      light.addKeyAtPlayhead(ch.trackId);
      refreshAllHouseRows();
      highlightHouse();
      refreshTrackDeleteButtons();
    });
  }

  root.querySelectorAll('[data-light-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setLightTab(btn.getAttribute('data-light-tab') || 'house');
    });
  });

  root.querySelector('[data-act="house-key"]')?.addEventListener('click', () => {
    ensureReady();
    addHouseKeyAtPlayhead();
  });
  root.querySelector('[data-act="house-kf-prev"]')?.addEventListener('click', () => {
    ensureReady();
    if (!selectedHouseChannel) selectedHouseChannel = 'fill';
    light.navigateChannelKeys(selectedHouseChannel, 'prev');
    opts.onChange?.();
    sync();
  });
  root.querySelector('[data-act="house-kf-next"]')?.addEventListener('click', () => {
    ensureReady();
    if (!selectedHouseChannel) selectedHouseChannel = 'fill';
    light.navigateChannelKeys(selectedHouseChannel, 'next');
    opts.onChange?.();
    sync();
  });
  root.querySelector('[data-act="house-kf-del"]')?.addEventListener('click', () => {
    ensureReady();
    if (!selectedHouseChannel) selectedHouseChannel = 'fill';
    runLightingEdit(historyCtx, 'HOUSE 키 삭제', () => {
      light.deleteKeyAtPlayhead(selectedHouseChannel);
    });
    sync();
  });
  root.querySelector('[data-act="house-track-del"]')?.addEventListener('click', () => {
    ensureReady();
    removeSelectedHouseTrack();
  });

  root.querySelector('[data-act="fx-key"]')?.addEventListener('click', () => {
    ensureReady();
    addFxKeysAtPlayhead();
  });
  root.querySelector('[data-act="fx-kf-prev"]')?.addEventListener('click', () => {
    ensureReady();
    if (selectedFids.size) fixtures.navigateSelectionKeys('prev', selectedFids);
    opts.onChange?.();
    sync();
  });
  root.querySelector('[data-act="fx-kf-next"]')?.addEventListener('click', () => {
    ensureReady();
    if (selectedFids.size) fixtures.navigateSelectionKeys('next', selectedFids);
    opts.onChange?.();
    sync();
  });
  root.querySelector('[data-act="fx-kf-del"]')?.addEventListener('click', () => {
    ensureReady();
    if (!selectedFids.size) return;
    runLightingEdit(historyCtx, 'Fixture 키 삭제', () => {
      fixtures.deleteKeysAtPlayhead(selectedFids);
      syncTimelineFromFixtureSelection();
    });
    sync();
  });
  root.querySelector('[data-act="fx-track-del"]')?.addEventListener('click', () => {
    ensureReady();
    removeSelectedFixtureTracks();
  });

  workBtn?.addEventListener('click', () => {
    if (!scene) return;
    runLightingEdit(historyCtx, 'WORK', () => {
      setWorkLightActive(scene, !isWorkLightActive(scene));
      refreshMasterUi();
      refreshAllHouseRows();
    });
  });

  workLevel?.addEventListener('pointerdown', () => {
    if (!scene) return;
    scrubbingUi = true;
    beginLightingGesture(historyCtx);
  });
  workLevel?.addEventListener('input', () => {
    if (!scene || syncing) return;
    const v = Number(workLevel.value) / 100;
    setWorkLightSlider(scene, v);
    if (workVal) workVal.textContent = `${Math.round(v * 100)}%`;
    workBtn?.classList.toggle('on', v > 0.02);
    refreshAllHouseRows();
  });
  const endWorkScrub = () => {
    if (!scrubbingUi) return;
    scrubbingUi = false;
    endLightingGesture(historyCtx, 'WORK 밝기');
    refreshMasterUi();
    refreshAllHouseRows();
  };
  workLevel?.addEventListener('pointerup', endWorkScrub);
  workLevel?.addEventListener('pointercancel', endWorkScrub);
  workLevel?.addEventListener('change', endWorkScrub);

  fixBusSlider?.addEventListener('pointerdown', () => {
    ensureReady();
    scrubbingUi = true;
    beginLightingGesture(historyCtx);
  });
  fixBusSlider?.addEventListener('input', () => {
    ensureReady();
    const v = Number(fixBusSlider.value) / 100;
    fixtures.fxEngine?.setFixtureBus?.(v);
    if (fixBusVal) fixBusVal.textContent = `${Math.round(v * 100)}%`;
  });
  const endBusScrub = () => {
    if (!scrubbingUi) return;
    scrubbingUi = false;
    endLightingGesture(historyCtx, 'Fixture Bus');
    refreshSheet();
  };
  fixBusSlider?.addEventListener('pointerup', endBusScrub);
  fixBusSlider?.addEventListener('pointercancel', endBusScrub);
  fixBusSlider?.addEventListener('change', endBusScrub);

  houseHost.addEventListener('pointerdown', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'range') {
      scrubbingUi = true;
      beginLightingGesture(historyCtx);
    }
  });
  const endHouseScrub = () => {
    if (!scrubbingUi) return;
    scrubbingUi = false;
    endLightingGesture(historyCtx, 'HOUSE 조명');
    refreshAllHouseRows();
  };
  houseHost.addEventListener('pointerup', endHouseScrub);
  houseHost.addEventListener('pointercancel', endHouseScrub);

  function onRgbInput() {
    if (syncing || !selectedFids.size) return;
    fxRVal.textContent = fxR.value;
    fxGVal.textContent = fxG.value;
    fxBVal.textContent = fxB.value;
    writeFxPatch({
      color: rgb01ToHex(Number(fxR.value) / 255, Number(fxG.value) / 255, Number(fxB.value) / 255),
    }, { refreshUi: false });
    refreshSheet();
  }
  [fxR, fxG, fxB].forEach((el) => {
    el?.addEventListener('pointerdown', () => {
      if (!selectedFids.size) return;
      scrubbingUi = true;
      beginLightingGesture(historyCtx);
    });
    const endRgb = () => {
      if (!scrubbingUi) return;
      scrubbingUi = false;
      endLightingGesture(historyCtx, 'Fixture RGB');
      syncRgbSliders();
      refreshSheet();
    };
    el?.addEventListener('pointerup', endRgb);
    el?.addEventListener('pointercancel', endRgb);
    el?.addEventListener('change', endRgb);
  });
  fxR.addEventListener('input', onRgbInput);
  fxG.addEventListener('input', onRgbInput);
  fxB.addEventListener('input', onRgbInput);

  /** Drop key selection when playhead leaves those keys → next edits are live / new +키. */
  function pruneOffPlayheadKeySelection() {
    const refs = engine.listSelectedKeys?.() || [];
    if (!refs.length) return;
    const ph = engine.playheadSec;
    const kept = refs.filter((r) => {
      const kf = engine.getTrack(r.trackId)?.keys.get(r.keyId);
      return kf && Math.abs(kf.timeSec - ph) <= 1e-4;
    });
    if (kept.length === refs.length) return;
    if (kept.length) {
      engine.selectKeyframes(kept);
      return;
    }
    const trackIds = [...new Set(refs.map((r) => r.trackId))];
    if (typeof engine.selectTracks === 'function') {
      engine.selectTracks(trackIds);
    } else {
      engine.selectedKeyframeId = null;
      engine.selectedKeys = [];
      engine.emit('selection');
    }
  }

  engine.subscribe?.((ev) => {
    if (ev.type === 'playhead') {
      pruneOffPlayheadKeySelection();
    }
    if (['selection', 'tracks', 'keys', 'playhead'].includes(ev.type)) {
      sync();
    }
  });

  setLightTab('house');
  ensureReady();
  panelHooks.sync = sync;
  sync();

  return { root, sync, ensureReady };
}
