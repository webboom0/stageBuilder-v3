import { buildDefaultMaGroups } from "./maGroups.js";
import { createMaCommandHandler } from "./maCommand.js";
import {
  applyExecutorLevel,
  loadExecutors,
  saveExecutors,
  storeExecutorFromSelection,
} from "./maExecutors.js";
import { mountMaKnob } from "./maKnob.js";
import { liveToRgb255, MA_COLOR_SWATCHES } from "./maColorPalette.js";

const ATTR_TABS = ["Dimmer", "Position", "Color", "Beam", "Gobo"];

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
  Gobo: [null, null, null, null],
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

/**
 * grandMA3 Fixture Sheet + Executors + Encoders + Command line
 */
export function mountMaConsole(host, editor, hooks = {}) {
  host.innerHTML = "";

  let groups = {};
  let attrPage = "Dimmer";
  let cmdTokens = [];
  let parseCommand = () => ({ ok: false, msg: "" });
  let executors = loadExecutors(editor.scene);
  let selectedExec = executors.find((e) => e.selected)?.id ?? 5;
  let lastFixtureCount = 0;
  const knobs = [];

  const sec = document.createElement("div");
  sec.className = "sb-sc-sec sb-sc-sec--ma";
  sec.innerHTML = `FIXTURE SHEET <span style="margin-left:auto;color:rgba(255,204,68,0.75);font-size:10px">Select · Prog</span>`;
  host.appendChild(sec);

  const pane = document.createElement("div");
  pane.className = "sb-sc-pane sb-ma-console";
  pane.innerHTML = `
    <div class="sb-ma-sheet-head">
      <button type="button" class="sb-ma-chip" id="maSelOut">SEL OUT</button>
      <button type="button" class="sb-ma-chip" id="maSelFull">SEL FULL</button>
      <button type="button" class="sb-ma-chip off" id="maAllOut">ALL OUT</button>
      <button type="button" class="sb-ma-chip" id="maHighlt">HIGHLT</button>
      <button type="button" class="sb-ma-chip" id="maClear">CLEAR</button>
      <span class="sb-ma-selinfo" id="maSelInfo">선택 없음</span>
    </div>
    <div class="sb-ma-sel-dim" id="maSelDimRow">
      <label>선택 Dim</label>
      <input type="range" class="lt" id="maSelDim" min="0" max="100" value="0" disabled />
      <span class="val" id="maSelDimVal">—</span>
    </div>
    <div class="sb-ma-fixgrid" id="maFixGrid"></div>
    <div class="sb-ma-groups-wrap">
      <div class="sb-ma-subsec">GROUPS <span class="sb-ma-kf-hint">선택 후 K → Light FX</span></div>
      <div class="sb-ma-groups" id="maGroups"></div>
    </div>
    <div class="sb-ma-exec-wrap">
      <div class="sb-ma-exec-head">
        <span class="sb-ma-exec-title">EXECUTORS</span>
        <button type="button" class="sb-ma-exec-act" id="maExecGo">Go</button>
        <button type="button" class="sb-ma-exec-act" id="maExecStore">Store</button>
      </div>
      <div class="sb-ma-exec-bank" id="maExecBank"></div>
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
    <div class="sb-ma-cmd">
      <div class="sb-ma-cmdline" id="maCmdEcho"><span class="pmt">›</span><span class="txt"></span><span class="cur">▌</span></div>
      <div class="sb-ma-keys" id="maKeys"></div>
    </div>
    <div class="hint" style="margin-top:8px;color:rgba(255,255,255,0.45);font-size:10px">
      EXECUTOR 페이더 · Position 노브 · 컬러 팔레트 · <code>Fixture 11 At Out</code>
    </div>
  `;
  host.appendChild(pane);

  const grid = pane.querySelector("#maFixGrid");
  const groupsEl = pane.querySelector("#maGroups");
  const tabsEl = pane.querySelector("#maAttrTabs");
  const knobsEl = pane.querySelector("#maKnobs");
  const execBank = pane.querySelector("#maExecBank");
  const colorGrid = pane.querySelector("#maColorGrid");
  const selInfo = pane.querySelector("#maSelInfo");
  const selDimSlider = pane.querySelector("#maSelDim");
  const selDimVal = pane.querySelector("#maSelDimVal");
  const cmdEcho = pane.querySelector("#maCmdEcho .txt");
  const rgbR = pane.querySelector("#maRgbR");
  const rgbG = pane.querySelector("#maRgbG");
  const rgbB = pane.querySelector("#maRgbB");

  function engine() {
    return editor.fixtureEngine;
  }

  function persistExecutors() {
    saveExecutors(editor.scene, executors);
  }

  function refreshGroupsMap() {
    const fe = engine();
    groups = buildDefaultMaGroups(fe?.getFixtures?.() || []);
    parseCommand = createMaCommandHandler({
      engine: fe,
      groups,
      onRefresh: refresh,
    });
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

  function syncSelectionUI() {
    refreshSheet();
    refreshGroups();
    buildKnobs();
    syncRgbSliders();
    syncSelDimRow();
    const sel = engine()?.getSelectionIds?.() || [];
    selInfo.textContent = sel.length
      ? `${sel.length} selected · #${sel.join(", #")}`
      : "선택 없음";
    pane.querySelector("#maHighlt")?.classList.toggle("on", !!engine()?.highlight);
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

  function buildExecutors() {
    execBank.innerHTML = "";
    executors.forEach((ex) => {
      const col = document.createElement("div");
      col.className = "sb-ma-exec-col" + (ex.id === selectedExec ? " sel" : "");
      col.innerHTML = `
        <div class="sb-ma-exec-led${ex.level > 0 ? " on" : ""}"><i></i></div>
        <input type="range" class="sb-ma-exec-fader" min="0" max="100" orient="vertical" value="${ex.level}" />
        <button type="button" class="sb-ma-exec-off">OFF</button>
        <div class="sb-ma-exec-num">${ex.id}</div>
        <div class="sb-ma-exec-name">${ex.name}</div>
      `;
      const fader = col.querySelector(".sb-ma-exec-fader");
      const led = col.querySelector(".sb-ma-exec-led");
      col.querySelector(".sb-ma-exec-off").onclick = (ev) => {
        ev.stopPropagation();
        ex.level = 0;
        applyExecutorLevel(engine(), groups, ex);
        persistExecutors();
        refreshExecutors();
        bumpRender(editor);
      };
      fader.addEventListener("input", () => {
        ex.level = Number(fader.value);
        led.classList.toggle("on", ex.level > 0);
        applyExecutorLevel(engine(), groups, ex);
        persistExecutors();
        refreshSheet();
        bumpRender(editor);
      });
      col.onclick = () => {
        selectedExec = ex.id;
        executors.forEach((e) => { e.selected = e.id === ex.id; });
        persistExecutors();
        refreshExecutors();
      };
      execBank.appendChild(col);
    });
  }

  function refreshExecutors() {
    buildExecutors();
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
        disabled: !sel.length || attrPage === "Gobo",
        onChange: (v) => applyKnobAttr(attr, v),
      });
      knobs.push(knob);
    });
    knobsEl.style.display = attrPage === "Color" ? "none" : "";
    pane.querySelector("#maColorWrap")?.classList.toggle("dim", attrPage === "Gobo");
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

  function updateCmdEcho() {
    cmdEcho.textContent = cmdTokens.join(" ");
  }

  function cmdPush(tok) {
    cmdTokens.push(tok);
    updateCmdEcho();
  }

  function cmdBack() {
    cmdTokens.pop();
    updateCmdEcho();
  }

  function cmdEnter() {
    const raw = cmdTokens.join(" ");
    if (raw.trim()) {
      const res = parseCommand(raw);
      if (res.msg) console.log("[MA]", res.msg);
    }
    cmdTokens = [];
    updateCmdEcho();
    refresh();
    bumpRender(editor);
  }

  function buildKeys() {
    const keysEl = pane.querySelector("#maKeys");
    const keys = [
      ["Fixture", "Fixture"], ["Group", "Group"], ["At", "At"], ["Thru", "Thru"], ["Full", "Full"],
      ["Clear", "__clr"], ["Highlt", "Highlight"], ["1", "1"], ["2", "2"], ["3", "3"],
      ["4", "4"], ["5", "5"], ["6", "6"], ["7", "7"], ["8", "8"], ["9", "9"],
      ["0", "0"], ["+", "+"], ["-", "-"], ["Out", "Out"], ["⌫", "__bs"], ["Enter", "__ent"],
    ];
    keysEl.innerHTML = "";
    keys.forEach(([lbl, tok]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sb-ma-key" + (tok === "__ent" ? " wide" : "");
      b.textContent = lbl;
      b.onclick = () => {
        if (tok === "__ent") cmdEnter();
        else if (tok === "__bs") cmdBack();
        else if (tok === "__clr") {
          if (cmdTokens.length) {
            cmdTokens = [];
            updateCmdEcho();
          } else engine()?.clearProgrammer?.();
          refresh();
        } else cmdPush(tok);
      };
      keysEl.appendChild(b);
    });
  }

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
      b.innerHTML = `<span class="gn">G${n}</span> ${g.name} <span class="cnt">${g.ids?.length || 0}</span>`;
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
      };
      tabsEl.appendChild(t);
    });
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
    const live = f0?.live || f0?.attr || {};
    const dim = Math.round(Number(live.dim) || 0);
    selDimSlider.value = String(dim);
    selDimVal.textContent = sel.length > 1 ? `${dim}% (${sel.length})` : `${dim}%`;
  }

  function refresh({ light = false } = {}) {
    refreshGroupsMapIfNeeded();
    syncSelectionUI();
    if (!light) {
      refreshExecutors();
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
    if (fe.highlight) fe.setHighlight(false);
    refresh();
    bumpRender(editor);
  };
  pane.querySelector("#maSelFull").onclick = () => {
    if (!engine()?.setSelectionDim?.(100)) return;
    refresh();
    bumpRender(editor);
  };
  pane.querySelector("#maAllOut").onclick = () => {
    engine()?.setAllDim?.(0);
    engine()?.setBlackout?.(false);
    engine()?.setAllEnabled?.(true);
    executors.forEach((e) => { e.level = 0; });
    persistExecutors();
    refresh();
    bumpRender(editor);
  };
  pane.querySelector("#maHighlt").onclick = () => {
    engine()?.setHighlight?.(!engine()?.highlight);
    refresh();
    bumpRender(editor);
  };
  pane.querySelector("#maClear").onclick = () => {
    engine()?.clearProgrammer?.();
    refresh();
    bumpRender(editor);
  };
  pane.querySelector("#maExecGo").onclick = () => {
    const ex = executors.find((e) => e.id === selectedExec);
    if (!ex || !engine()?.built) return;
    applyExecutorLevel(engine(), groups, ex);
    refresh();
    bumpRender(editor);
  };
  pane.querySelector("#maExecStore").onclick = () => {
    const ex = executors.find((e) => e.id === selectedExec);
    if (!ex) return;
    storeExecutorFromSelection(engine(), ex);
    persistExecutors();
    refreshExecutors();
  };

  buildColorGrid();
  buildKeys();
  refresh();

  return { refresh, syncSelectionUI };
}
