import { buildDefaultMaGroups } from "./maGroups.js";
import { mountMaKnob } from "./maKnob.js";
import { liveToRgb255, MA_COLOR_SWATCHES } from "./maColorPalette.js";
import { fixtureTrackId } from "./fixtureLightTimeline.js";

const ATTR_TABS = ["Dimmer", "Position", "Color", "Beam"];

const KNOB_LAYOUT = {
  Dimmer: [
    ["Dim", "dim", 0, 100, "%"],
    ["Focus", "focus", 0, 100, "%"],
    null,
    null,
  ],
  Position: [
    ["Pan", "pan", -270, 270, "°"],
    ["Tilt", "tilt", -120, 120, "°"],
    null,
    null,
  ],
  Beam: [
    ["Zoom", "zoom", 5, 50, "°"],
    ["Focus", "focus", 0, 100, "%"],
    null,
    null,
  ],
};

function fmtLive(f, attr) {
  const o = f?.live || f?.prog || f?.attr || f?.home || {};
  const v = o[attr];
  if (v == null) return attr === "pan" || attr === "tilt" ? 0 : 0;
  return Math.round(v);
}

function bumpRender(editor) {
  editor.signals?.rendererUpdated?.dispatch?.();
}

/** 타임라인 키프레임 편집용 Fixture Sheet (선택 · 그룹 · 인코더) */
export function mountMaConsole(host, editor, hooks = {}) {
  host.innerHTML = "";

  let groups = {};
  let attrPage = "Dimmer";
  let lastFixtureCount = 0;
  const knobs = [];

  const sec = document.createElement("div");
  sec.className = "sb-sc-sec sb-sc-sec--ma";
  sec.innerHTML = `FIXTURE SHEET <span style="margin-left:auto;color:rgba(255,204,68,0.75);font-size:10px">선택 · 키프레임</span>`;
  host.appendChild(sec);

  const pane = document.createElement("div");
  pane.className = "sb-sc-pane sb-ma-console";
  pane.innerHTML = `
    <div class="sb-ma-sheet-head">
      <button type="button" class="sb-ma-chip" id="maSelOut">SEL OUT</button>
      <button type="button" class="sb-ma-chip" id="maSelFull">SEL FULL</button>
      <button type="button" class="sb-ma-chip" id="maClear">선택 초기화</button>
      <button type="button" class="sb-ma-chip acc" id="maFxKfAdd" title="선택 픽스처 키프레임 추가 (K)">+ 키</button>
      <span class="sb-ma-selinfo" id="maSelInfo">선택 없음</span>
    </div>
    <div class="sb-ma-sel-dim" id="maSelDimRow">
      <label>선택 Dim</label>
      <input type="range" class="lt" id="maSelDim" min="0" max="100" value="0" disabled />
      <span class="val" id="maSelDimVal">—</span>
    </div>
    <div class="sb-ma-fixgrid" id="maFixGrid"></div>
    <div class="sb-ma-groups-wrap">
      <div class="sb-ma-subsec-row">
        <div class="sb-ma-subsec">GROUPS</div>
        <div class="sb-ma-grp-tools">
          <button type="button" class="sb-ma-chip acc" id="maGrpKfAdd" title="선택 그룹 키프레임 추가 (K)">+ 키</button>
          <button type="button" class="sb-ma-chip" id="maGrpKfPrev" title="이전 키">◀</button>
          <button type="button" class="sb-ma-chip" id="maGrpKfNext" title="다음 키">▶</button>
          <button type="button" class="sb-ma-chip off" id="maGrpKfDel" title="플레이헤드 키 삭제">⌫</button>
        </div>
      </div>
      <div class="sb-ma-groups" id="maGroups"></div>
    </div>
    <div class="sb-ma-enc-wrap">
      <div class="sb-ma-attr-tabs" id="maAttrTabs"></div>
      <div class="sb-ma-knobs" id="maKnobs"></div>
    </div>
    <div class="sb-ma-color-wrap" id="maColorWrap">
      <div class="sb-ma-color-grid" id="maColorGrid"></div>
      <div class="sb-ma-rgb">
        <div class="ec-row sb-sc-ec sb-ma-rgb-row"><label>R</label><input type="range" class="lt" id="maRgbR" min="0" max="255" value="255" disabled /><span class="val" id="maRgbRVal">255</span></div>
        <div class="ec-row sb-sc-ec sb-ma-rgb-row"><label>G</label><input type="range" class="lt" id="maRgbG" min="0" max="255" value="255" disabled /><span class="val" id="maRgbGVal">255</span></div>
        <div class="ec-row sb-sc-ec sb-ma-rgb-row"><label>B</label><input type="range" class="lt" id="maRgbB" min="0" max="255" value="255" disabled /><span class="val" id="maRgbBVal">255</span></div>
      </div>
    </div>
    <div class="hint" style="margin-top:8px;color:rgba(255,255,255,0.45);font-size:10px">
      값 조절 후 <b>+ 키</b> 또는 <b>K</b>로 플레이헤드에 키프레임 저장
    </div>
  `;
  host.appendChild(pane);

  const grid = pane.querySelector("#maFixGrid");
  const groupsEl = pane.querySelector("#maGroups");
  const tabsEl = pane.querySelector("#maAttrTabs");
  const knobsEl = pane.querySelector("#maKnobs");
  const colorGrid = pane.querySelector("#maColorGrid");
  const selInfo = pane.querySelector("#maSelInfo");
  const selDimSlider = pane.querySelector("#maSelDim");
  const selDimVal = pane.querySelector("#maSelDimVal");
  const rgbR = pane.querySelector("#maRgbR");
  const rgbG = pane.querySelector("#maRgbG");
  const rgbB = pane.querySelector("#maRgbB");

  function engine() {
    return editor.fixtureEngine;
  }

  function refreshGroupsMap() {
    const fe = engine();
    groups = buildDefaultMaGroups(fe?.getFixtures?.() || []);
  }

  function refreshGroupsMapIfNeeded() {
    const fe = engine();
    const list = fe?.getFixtures?.() || [];
    if (list.length === lastFixtureCount && Object.keys(groups).length) return;
    lastFixtureCount = list.length;
    refreshGroupsMap();
  }

  function applySelection(ids) {
    const fe = engine();
    if (!fe?.built) return false;
    const valid = (ids || []).map(Number).filter((id) => fe.getFixture(id));
    if (!valid.length) return false;
    fe.setSelection(valid);
    syncSelectionUI();
    hooks.onSelectionChange?.();
    return true;
  }

  function syncTimelineFromSelection() {
    const sel = engine()?.getSelectionIds?.() || [];
    const lt = editor.lightTimeline;
    const bridge = editor.timeline?.selectionBridge;
    if (!lt?.tracks?.size) return;

    bridge?.clearTrackHighlights?.();

    if (!sel.length) {
      lt.selectedTrackId = null;
      return;
    }

    const trackIds = sel
      .map((fid) => fixtureTrackId(fid))
      .filter((id) => lt.tracks.has(id));
    if (!trackIds.length) return;

    lt.selectedTrackId = trackIds[0];
    trackIds.forEach((trackId) => {
      const track = lt.tracks.get(trackId);
      if (track?.element) {
        track.element.classList.add("timeline-track--selected");
      }
    });

    const firstEl = lt.tracks.get(trackIds[0])?.element;
    firstEl?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }

  function addKeyframesForCurrentSelection() {
    const lt = editor.lightTimeline;
    const res =
      lt?.fixtureBridge?.addKeyframesForSelection?.() ||
      lt?.addKeyframeAtPlayhead?.();
    if (res && !res.success && res.message) {
      console.warn("[MA]", res.message);
    }
    return res;
  }

  function syncSelectionUI() {
    refreshSheet();
    refreshGroups();
    buildKnobs();
    syncRgbSliders();
    syncSelDimRow();
    syncTimelineFromSelection();
    const sel = engine()?.getSelectionIds?.() || [];
    selInfo.textContent = sel.length
      ? `${sel.length} selected · #${sel.join(", #")}`
      : "선택 없음";
  }

  function applyKnobAttr(attr, val) {
    const fe = engine();
    if (!fe?.getSelectionIds?.()?.length) return;
    if (attr === "dim") fe.setSelectionDim(val);
    else fe.applyProgToSelection(attr, val);
    refreshSheet();
    if (attr === "dim") syncSelDimRow();
    bumpRender(editor);
  }

  function buildKnobs() {
    knobsEl.innerHTML = "";
    knobs.length = 0;
    const fe = engine();
    const sel = fe?.getSelectionIds?.() || [];
    const f0 = sel.length ? fe.getFixture(sel[0]) : null;
    const layout = KNOB_LAYOUT[attrPage] || KNOB_LAYOUT.Dimmer;
    layout.forEach((spec) => {
      if (!spec) {
        const ph = document.createElement("div");
        ph.className = "sb-ma-knob off";
        ph.innerHTML = `<div class="sb-ma-knob-dial"><span class="sb-ma-knob-dash">—</span></div><div class="sb-ma-knob-lbl">—</div><div class="sb-ma-knob-val">—</div>`;
        knobsEl.appendChild(ph);
        return;
      }
      const [lab, attr, min, max, unit] = spec;
      const val = f0 ? fmtLive(f0, attr) : 0;
      const knob = mountMaKnob(knobsEl, {
        label: lab,
        min,
        max,
        value: val,
        unit,
        disabled: !sel.length,
        onChange: (v) => applyKnobAttr(attr, v),
      });
      knobs.push(knob);
    });
    knobsEl.style.display = attrPage === "Color" ? "none" : "";
    pane.querySelector("#maColorWrap")?.classList.toggle("dim", false);
  }

  function buildColorGrid() {
    colorGrid.innerHTML = "";
    MA_COLOR_SWATCHES.forEach((sw) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sb-ma-swatch";
      b.style.background = `rgb(${Math.round(sw.r * 255)},${Math.round(sw.g * 255)},${Math.round(sw.b * 255)})`;
      b.onclick = () => {
        const fe = engine();
        if (!fe?.setSelectionColor?.(sw.r, sw.g, sw.b)) return;
        syncRgbSliders();
        refreshSheet();
        bumpRender(editor);
      };
      colorGrid.appendChild(b);
    });
  }

  function syncRgbSliders() {
    const fe = engine();
    const sel = fe?.getSelectionIds?.() || [];
    const disabled = !sel.length;
    [rgbR, rgbG, rgbB].forEach((el) => { if (el) el.disabled = disabled; });
    if (!sel.length) return;
    const rgb = liveToRgb255(fe.getFixture(sel[0]));
    rgbR.value = String(rgb.r);
    rgbG.value = String(rgb.g);
    rgbB.value = String(rgb.b);
    pane.querySelector("#maRgbRVal").textContent = String(rgb.r);
    pane.querySelector("#maRgbGVal").textContent = String(rgb.g);
    pane.querySelector("#maRgbBVal").textContent = String(rgb.b);
  }

  function onRgbInput() {
    const fe = engine();
    if (!fe?.getSelectionIds?.()?.length) return;
    const r = Number(rgbR.value) / 255;
    const g = Number(rgbG.value) / 255;
    const b = Number(rgbB.value) / 255;
    fe.setSelectionColor(r, g, b);
    pane.querySelector("#maRgbRVal").textContent = rgbR.value;
    pane.querySelector("#maRgbGVal").textContent = rgbG.value;
    pane.querySelector("#maRgbBVal").textContent = rgbB.value;
    refreshSheet();
    bumpRender(editor);
  }

  rgbR?.addEventListener("input", onRgbInput);
  rgbG?.addEventListener("input", onRgbInput);
  rgbB?.addEventListener("input", onRgbInput);

  function refreshSheet() {
    const fe = engine();
    const list = fe?.getFixtures?.() || [];
    grid.innerHTML = "";
    if (!list.length) {
      grid.innerHTML = `<div class="sb-ma-empty">「리그 생성 / 재배치」 후 픽스처가 표시됩니다</div>`;
      return;
    }
    list.forEach((f) => {
      const o = f.live || f.attr || f.home || {};
      const dim = f.enabled === false ? 0 : Math.round(o.dim || 0);
      const el = document.createElement("button");
      el.type = "button";
      el.className = "sb-ma-fx" + (f.sel ? " sel" : "") + (Object.keys(f.prog || {}).length ? " prog" : "") + (f.enabled === false ? " off" : "");
      const c = `rgb(${Math.round((o.r ?? 1) * 255)},${Math.round((o.g ?? 1) * 255)},${Math.round((o.b ?? 1) * 255)})`;
      el.innerHTML = `
        <span class="sb-ma-fx-id">${f.fid}</span>
        <span class="sb-ma-fx-sw" style="background:${c}"></span>
        <span class="sb-ma-fx-nm">${f.name.replace(/ .*/, "")}</span>
        <span class="sb-ma-fx-dim">${f.enabled === false ? "OFF" : dim || "·"}</span>
        <span class="sb-ma-fx-bar"><i style="width:${dim}%"></i></span>
      `;
      el.onclick = (ev) => {
        if (ev.shiftKey && fe.getSelectionIds().length) {
          fe.toggleSelection(f.fid);
          syncSelectionUI();
          hooks.onSelectionChange?.();
        } else if (ev.ctrlKey || ev.metaKey) {
          fe.toggleSelection(f.fid);
          syncSelectionUI();
          hooks.onSelectionChange?.();
        } else {
          applySelection([f.fid]);
        }
      };
      el.ondblclick = (ev) => {
        ev.preventDefault();
        if (!applySelection([f.fid])) return;
        const live = f.live || f.attr || {};
        const cur = Math.round(Number(live.dim) || 0);
        fe.setSelectionDim(cur > 0 ? 0 : 50);
        refresh();
        hooks.onFixtureChange?.();
        bumpRender(editor);
      };
      el.oncontextmenu = (ev) => {
        ev.preventDefault();
        fe.setFixtureEnabled(f.fid, !f.enabled);
        refresh();
      };
      grid.appendChild(el);
    });
  }

  function selectionMatchesGroup(sel, ids) {
    if (!sel?.length || !ids?.length || sel.length !== ids.length) return false;
    const norm = (arr) => [...arr].sort((a, b) => a - b).join(",");
    return norm(sel) === norm(ids);
  }

  function refreshGroups() {
    const sel = engine()?.getSelectionIds?.() || [];
    groupsEl.innerHTML = "";
    Object.entries(groups).forEach(([n, g]) => {
      const b = document.createElement("button");
      const active = selectionMatchesGroup(sel, g.ids);
      b.type = "button";
      b.className =
        "sb-ma-grp" +
        (g.ids?.length ? "" : " empty") +
        (active ? " on" : "");
      b.innerHTML = `<span class="gn">G${n}</span><span class="gn-name">${g.name}</span><span class="cnt">${g.ids?.length || 0}</span>`;
      if (g.ids?.length) {
        b.onclick = () => {
          applySelection(g.ids);
        };
      }
      groupsEl.appendChild(b);
    });
  }

  function refreshTabs() {
    tabsEl.innerHTML = "";
    ATTR_TABS.forEach((pg) => {
      const t = document.createElement("button");
      t.type = "button";
      t.className = "sb-ma-tab" + (pg === attrPage ? " on" : "");
      t.textContent = pg.toUpperCase();
      t.onclick = () => {
        attrPage = pg;
        refreshTabs();
        buildKnobs();
        pane.querySelector("#maColorWrap").style.display =
          pg === "Color" ? "" : "none";
      };
      tabsEl.appendChild(t);
    });
    pane.querySelector("#maColorWrap").style.display =
      attrPage === "Color" ? "" : "none";
  }

  function syncSelDimRow() {
    const fe = engine();
    const sel = fe?.getSelectionIds?.() || [];
    if (!selDimSlider || !selDimVal) return;
    if (!sel.length) {
      selDimSlider.disabled = true;
      selDimSlider.value = "0";
      selDimVal.textContent = "—";
      return;
    }
    selDimSlider.disabled = false;
    const f0 = fe.getFixture(sel[0]);
    const src = f0?.attr || f0?.live || {};
    const dim = Math.round(Number(src.dim) || 0);
    selDimSlider.value = String(dim);
    selDimVal.textContent = sel.length > 1 ? `${dim}% (${sel.length})` : `${dim}%`;
  }

  function refresh({ light = false } = {}) {
    refreshGroupsMapIfNeeded();
    syncSelectionUI();
    if (!light) {
      refreshTabs();
    }
    hooks.onFixtureChange?.();
  }

  selDimSlider?.addEventListener("input", () => {
    const fe = engine();
    if (!fe?.getSelectionIds?.()?.length) return;
    const v = Number(selDimSlider.value);
    fe.setSelectionDim(v);
    if (selDimVal) {
      const n = fe.getSelectionIds().length;
      selDimVal.textContent = n > 1 ? `${v}% (${n})` : `${v}%`;
    }
    refreshSheet();
    buildKnobs();
    bumpRender(editor);
  });

  pane.querySelector("#maSelOut").onclick = () => {
    const fe = engine();
    if (!fe?.setSelectionDim?.(0)) return;
    refresh();
    bumpRender(editor);
  };
  pane.querySelector("#maSelFull").onclick = () => {
    if (!engine()?.setSelectionDim?.(100)) return;
    refresh();
    bumpRender(editor);
  };
  pane.querySelector("#maClear").onclick = () => {
    engine()?.clearProgrammer?.();
    refresh();
    bumpRender(editor);
  };

  pane.querySelector("#maFxKfAdd")?.addEventListener("click", () => {
    addKeyframesForCurrentSelection();
  });
  pane.querySelector("#maGrpKfAdd")?.addEventListener("click", () => {
    addKeyframesForCurrentSelection();
  });
  pane.querySelector("#maGrpKfPrev")?.addEventListener("click", () => {
    editor.lightTimeline?.fixtureBridge?.navigateSelectionKeyframes?.("prev");
  });
  pane.querySelector("#maGrpKfNext")?.addEventListener("click", () => {
    editor.lightTimeline?.fixtureBridge?.navigateSelectionKeyframes?.("next");
  });
  pane.querySelector("#maGrpKfDel")?.addEventListener("click", () => {
    editor.lightTimeline?.fixtureBridge?.deleteSelectionKeyframesAtPlayhead?.();
  });

  buildColorGrid();
  refresh();

  return { refresh, syncSelectionUI };
}
