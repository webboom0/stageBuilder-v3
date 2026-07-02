import { ShowControl } from "../showcontrol/ShowControl.js";
import { findSceneObjectForCatalogEntry } from "../utils/motionFbxCatalog.js";
import { computeFormationOffsets, FORMATION_LABELS } from "../showcontrol/groupFormation.js";
import { getGroupTotalDuration } from "../showcontrol/groupSegments.js";

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function collectSceneMotionObjects(editor) {
  const out = [];
  const seen = new Set();
  editor.scene?.traverse?.((o) => {
    if (!o?.userData || o.userData.source !== "motion") return;
    if (o.isLight) return;
    if (o.isGroup && String(o.name || "").toLowerCase().includes("light")) return;
    if (seen.has(o.uuid)) return;
    seen.add(o.uuid);
    out.push(o);
  });
  return out;
}

function motionObjectLabel(obj) {
  if (obj?.userData?.actorId) return `Actor ${obj.userData.actorId}`;
  const src = obj?.userData?.sourceFile || obj?.userData?.filename;
  if (src) {
    const base = String(src).split(/[/\\]/).pop();
    return obj.name || base;
  }
  return obj?.name || obj?.uuid?.slice(0, 8) || "Motion";
}

const sharedUIMap = new WeakMap();

function getSharedUI(editor) {
  if (!sharedUIMap.has(editor)) {
    const bag = {
      refreshers: {},
      refreshAll() {
        Object.values(this.refreshers).forEach((fn) => {
          try {
            fn();
          } catch (e) {
            console.error("ShowControl UI refresh failed:", e);
          }
        });
      },
    };
    const fire = () => bag.refreshAll();
    editor.signals.objectSelected.add(fire);
    editor.signals.editorCleared.add(fire);
    editor.signals.sceneGraphChanged.add(fire);
    sharedUIMap.set(editor, bag);
  }
  return sharedUIMap.get(editor);
}

export function createShowControlSection(editor, section) {
  return createShowControlPanel(editor, { section });
}

export function createShowControlPanel(editor, options = {}) {
  const section = options.section || null;
  const root = document.createElement("div");
  root.className = "sb-showcontrol-panel";

  // Ensure engines exist
  if (!editor.showControl) {
    editor.showControl = new ShowControl(editor);
    editor.showControl.loadFromSceneUserData();
    editor.showControl.ensureDefaultShow();
  }

  // ============================================================
  // grandMA3 / QLab-like console layout (drawer-friendly)
  // ============================================================
  const style = document.createElement("style");
  style.textContent = `
    .sb-showcontrol-panel{
      --ql-bg:#101215;
      --ql-panel:#171a1e;
      --ql-row:#1d2025;
      --ql-line: rgba(255,255,255,0.10);
      --ql-dim: rgba(255,255,255,0.60);
      --ql-ink: rgba(255,255,255,0.86);
      --ql-go:#34c759;
      --ql-sb:#ffcc44;
      --ql-cy:#39d3ff;
      --ql-nv:#76b900;
      color: var(--ql-ink);
    }
    .sb-sc-top{
      height: 40px;
      display:flex; align-items:center; gap:10px;
      padding: 0 12px;
      background: linear-gradient(180deg,#1f242a,#15181c);
      border-bottom: 1px solid var(--ql-line);
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: .4px;
    }
    .sb-sc-top .pill{
      font-size:10px;
      padding: 5px 10px;
      border: 1px solid var(--ql-line);
      border-radius: 999px;
      background: rgba(0,0,0,0.25);
      cursor: pointer;
      color: var(--ql-dim);
    }
    .sb-sc-top .pill.on{ color: var(--ql-ink); border-color: rgba(57,211,255,0.35); background: rgba(57,211,255,0.10); }
    .sb-sc-top .sb{ color: var(--ql-sb); font-weight:700; }
    .sb-sc-top .go{
      margin-left:auto;
      height: 28px;
      padding: 0 16px;
      border-radius: 8px;
      border: 0;
      background: linear-gradient(180deg,#52db73,#27b34a);
      color: #07140b;
      font-weight: 700;
      cursor: pointer;
    }
    .sb-sc-top .go:hover{ filter: brightness(1.05); }
    .sb-sc-body{
      display:grid;
      grid-template-columns: 320px minmax(0,1fr);
      gap: 10px;
      padding: 10px 12px;
    }
    .sb-sc-col{
      background: var(--ql-panel);
      border: 1px solid var(--ql-line);
      border-radius: 10px;
      overflow: hidden;
      min-height: 0;
      display:flex;
      flex-direction:column;
    }
    .sb-sc-sec{
      height: 30px;
      display:flex; align-items:center; gap:8px;
      padding: 0 10px;
      background: linear-gradient(180deg,#1b1f25,#171a1e);
      border-bottom: 1px solid var(--ql-line);
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10.5px;
      color: var(--ql-dim);
    }
    .sb-sc-sec b{ color: var(--ql-ink); font-weight: 700; }
    .sb-sc-pane{ padding: 10px; overflow-x:hidden; overflow-y:auto; min-height:0; min-width:0; }
    .sb-form{
      display:grid;
      grid-template-columns: 84px minmax(0, 1fr);
      gap: 8px 10px;
      align-items:center;
      font-size: 11px;
      width:100%;
      max-width:100%;
      box-sizing:border-box;
    }
    .sb-form label{ color: var(--ql-dim); }
    .sb-form input, .sb-form select{
      width: 100%;
      background: #0f1113;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      color: var(--ql-ink);
      padding: 6px 8px;
      font-size: 11px;
      outline: none;
    }
    .sb-form input:focus, .sb-form select:focus{ border-color: rgba(57,211,255,0.35); }
    .sb-rowbtns{ display:flex; gap:8px; margin-top: 10px; }
    .sb-rowbtns .btn{
      height: 30px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(0,0,0,0.25);
      color: var(--ql-ink);
      cursor: pointer;
      padding: 0 10px;
      font-size: 11px;
    }
    .sb-rowbtns .btn.go{ background: rgba(52,199,89,0.15); border-color: rgba(52,199,89,0.35); }
    .sb-rowbtns .btn.del{ background: rgba(224,88,78,0.12); border-color: rgba(224,88,78,0.30); }
    .sb-cuelist{
      border-top: 1px solid var(--ql-line);
      margin-top: 10px;
      padding-top: 10px;
      display:flex;
      flex-direction:column;
      gap: 6px;
    }
    .sb-cue{
      background: rgba(0,0,0,0.22);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 8px 10px;
      display:grid;
      grid-template-columns: 46px 1fr 94px;
      gap: 8px;
      align-items:center;
      cursor: pointer;
    }
    .sb-cue.sel{ border-color: rgba(255,204,68,0.45); box-shadow: 0 0 0 1px rgba(255,204,68,0.10) inset; }
    .sb-cue .n{ font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--ql-sb); }
    .sb-cue .nm{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .sb-cue select{ background:#0f1113; }

    .sb-ens{
      display:flex;
      flex-direction:column;
      gap: 10px;
      width:100%;
      min-width:0;
      overflow-x:hidden;
    }
    .sb-ens-actions{ display:flex; flex-wrap:wrap; gap:6px; width:100%; }
    .sb-ens-seg{
      border:1px solid rgba(255,255,255,0.10);
      border-radius:8px;
      padding:8px;
      margin-top:6px;
      background:rgba(0,0,0,0.18);
    }
    .sb-ens-seg.on{
      border-color:rgba(57,211,255,0.45);
      background:rgba(57,211,255,0.06);
    }
    .sb-ens-seg-hd{
      display:flex;align-items:center;gap:6px;margin-bottom:6px;
      font-size:11px;color:rgba(255,255,255,0.75);
    }
    .sb-ens-seg-fmt{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}
    .sb-ens-seg-fmt .sb-chip{font-size:10px;padding:3px 6px}
    .sb-ens-pane{ overflow-x:hidden; overflow-y:auto; width:100%; min-width:0; }
    .sb-ens-grid{
      display:grid;
      grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
      gap: 8px;
    }
    .sb-ens-groups{
      display:flex;
      flex-wrap:wrap;
      gap:6px;
      margin-bottom:0;
      width:100%;
      min-height:28px;
      overflow:visible;
    }
    .sb-ens-toolbar{
      display:flex;
      align-items:center;
      gap:6px;
      flex-wrap:wrap;
      width:100%;
      overflow:visible;
    }
    .sb-ens-toolbar .sb-chip{ flex-shrink:0; }
    .sb-ens-group-tab{ flex-shrink:0; max-width:100%; }
    .sb-ens-step{
      border-top:1px solid rgba(255,255,255,0.08);
      padding-top:10px;
      display:flex;
      flex-direction:column;
      gap:8px;
      width:100%;
      min-width:0;
      overflow:hidden;
    }
    .sb-ens-step-num{
      color:rgba(255,204,68,0.85);
      font-size:10px;
      letter-spacing:0.08em;
      font-weight:700;
    }
    .sb-ens-group-tab{
      height: 28px;
      padding: 0 10px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(0,0,0,0.20);
      color: rgba(255,255,255,0.75);
      cursor: pointer;
      font-size: 11px;
    }
    .sb-ens-group-tab.on{
      border-color: rgba(255,204,68,0.45);
      color: rgba(255,204,68,0.95);
      box-shadow: 0 0 0 1px rgba(255,204,68,0.10) inset;
    }
    .sb-ens-cell .lbl{
      font-size:10px;
      text-align:center;
      padding:0 4px;
      width:100%;
      max-width:100%;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      line-height:1.25;
      color:rgba(255,255,255,0.82);
    }
    .sb-fbx-slot-num{
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 18px;
      font-weight: 700;
      color: rgba(255,255,255,0.92);
      line-height:1;
      flex-shrink:0;
    }
    .sb-ens-subtitle{
      color: rgba(255,255,255,0.55);
      font-size: 10px;
      letter-spacing: 0.06em;
      margin: 4px 0 6px;
    }
    .sb-ens-cell{
      aspect-ratio: 1;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(0,0,0,0.18);
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:flex-start;
      gap:2px;
      padding:8px 4px 6px;
      box-sizing:border-box;
      min-width:0;
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      cursor: pointer;
      position: relative;
      overflow:hidden;
    }
    .sb-ens-cell.on{ border-color: rgba(57,211,255,0.45); box-shadow: 0 0 0 1px rgba(57,211,255,0.10) inset, 0 0 10px rgba(57,211,255,0.08); }
    .sb-ens-cell small{
      margin-top:auto;
      width:100%;
      text-align:center;
      font-size:9px;
      line-height:1.2;
      color: rgba(255,255,255,0.50);
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      padding:0 4px;
      box-sizing:border-box;
    }
    .sb-ens-actions{ display:flex; flex-wrap:wrap; gap:6px; }
    .sb-chip{
      height: 28px;
      padding: 0 10px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(0,0,0,0.20);
      color: rgba(255,255,255,0.78);
      cursor: pointer;
      font-size: 11px;
    }
    .sb-chip:hover{ border-color: rgba(255,255,255,0.20); color: rgba(255,255,255,0.92); }
    .sb-chip.acc{ border-color: rgba(118,185,0,0.35); color: rgba(118,185,0,0.90); }
    .sb-chip.cy{ border-color: rgba(57,211,255,0.35); color: rgba(57,211,255,0.90); }
    .sb-chip.lt{ border-color: rgba(255,204,68,0.30); color: rgba(255,204,68,0.95); }
    .sb-chip.on{ border-color: rgba(57,211,255,0.55); color: rgba(57,211,255,0.95); box-shadow: 0 0 0 1px rgba(57,211,255,0.12) inset; }
  `;
  document.head.appendChild(style);

  // --- view state
  let view = "qlab"; // 'qlab' | 'ma'
  let selectedCueIndex = editor.showControl.standbyIndex || 0;
  const sharedUI = getSharedUI(editor);

  if (section) {
    root.className = `sb-showcontrol-panel sb-showcontrol-section sb-sc-${section}`;
    if (section === "cues") {
      root.innerHTML = `
        <div class="sb-sc-mini-top">
          <span style="color:#ffcc44;font-weight:700">STANDBY</span>
          <b id="sbStandby">Q${selectedCueIndex + 1}</b>
          <button type="button" class="go" id="sbGoTop">GO</button>
        </div>
        <div class="sb-sc-section-host"></div>
      `;
    } else {
      root.innerHTML = `<div class="sb-sc-section-host"></div>`;
    }
  } else {
    root.innerHTML = `
    <div class="sb-sc-top">
      <button type="button" class="pill on" data-view="qlab">▶ QLab</button>
      <button type="button" class="pill" data-view="ma">grandMA3</button>
      <span class="sb">STANDBY</span>
      <b id="sbStandby">Q${selectedCueIndex + 1}</b>
      <button type="button" class="go" id="sbGoTop">GO</button>
    </div>
    <div class="sb-sc-body">
      <div class="sb-sc-col" data-pane="left"></div>
      <div class="sb-sc-col" data-pane="right"></div>
    </div>
  `;
  }

  const top = root.querySelector(".sb-sc-top");
  const leftCol = root.querySelector('[data-pane="left"]');
  const rightCol = root.querySelector('[data-pane="right"]');
  const sectionHost = root.querySelector(".sb-sc-section-host");
  const standbyEl = root.querySelector("#sbStandby");

  const setView = (v) => {
    view = v;
    top?.querySelectorAll(".pill").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
    sharedUI.refreshAll();
  };
  top?.querySelectorAll(".pill").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  // --- Shared helpers
  const syncStandby = () => {
    selectedCueIndex = Math.max(0, Math.min(editor.showControl.cues.length - 1, editor.showControl.standbyIndex || 0));
    if (standbyEl) standbyEl.textContent = `Q${selectedCueIndex + 1}`;
  };

  const renderCueList = (host) => {
    const sc = editor.showControl;
    const box = document.createElement("div");
    box.className = "sb-cuelist";
    sc.cues.forEach((c, idx) => {
      const row = document.createElement("div");
      row.className = "sb-cue" + (idx === sc.standbyIndex ? " sel" : "");
      row.innerHTML = `
        <div class="n">Q${c.num || idx + 1}</div>
        <div class="nm">${c.name || "Cue"}</div>
        <select>
          <option value="none">정지</option>
          <option value="cont">Auto-continue</option>
          <option value="follow">Auto-follow</option>
        </select>
      `;
      const sel = row.querySelector("select");
      sel.value = c.cont || "none";
      sel.addEventListener("change", () => {
        c.cont = sel.value;
        editor.showControl.persistToSceneUserData();
      });
      row.addEventListener("click", () => {
        editor.showControl.setStandby(idx);
        syncStandby();
        sharedUI.refreshAll();
      });
      box.appendChild(row);
    });
    host.appendChild(box);
  };

  const mountCueSection = (host) => {
    host.innerHTML = "";

    // Cue Inspector + cue list
    const sec = document.createElement("div");
    sec.className = "sb-sc-sec";
    sec.innerHTML = `CUE INSPECTOR <span style="margin-left:auto;color:rgba(255,255,255,0.5)">type · timing · continue</span>`;
    host.appendChild(sec);

    const pane = document.createElement("div");
    pane.className = "sb-sc-pane";
    host.appendChild(pane);

    const sc = editor.showControl;
    const cue = sc.cues[sc.standbyIndex] || sc.cues[0];
    if (!cue) return;

    pane.innerHTML = `
      <div class="sb-form">
        <label>타입</label><input value="${(cue.type || "Group")}" disabled />
        <label>큐 번호</label><input id="qiNum" value="${cue.num || ""}" />
        <label>이름</label><input id="qiName" value="${(cue.name || "").replace(/"/g, "&quot;")}" />
        <label>Pre-wait</label><input id="qiPre" type="number" step="0.5" value="${Number(cue.preWait || 0)}" />
        <label>Duration</label><input id="qiDur" type="number" step="0.5" value="${Number(cue.duration || 0)}" />
        <label>Continue</label>
        <select id="qiCont">
          <option value="none">정지(GO 대기)</option>
          <option value="cont">Auto-continue</option>
          <option value="follow">Auto-follow</option>
        </select>
      </div>
      <div style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div style="color:rgba(255,255,255,0.75);font-size:11px;letter-spacing:0.06em">ACTIONS</div>
          <div style="margin-left:auto;display:flex;gap:6px">
            <button class="btn" id="qaAddWork">+ WorkLight</button>
            <button class="btn" id="qaAddLight">+ Light ON/OFF</button>
            <button class="btn" id="qaAddMove">+ 객체 이동</button>
            <button class="btn" id="qaAddGroupMove">+ 그룹 이동</button>
            <button class="btn" id="qaAddDeploy">+ 그룹 배치</button>
          </div>
        </div>
        <div id="qaList"></div>
      </div>
      <div class="sb-rowbtns">
        <button class="btn" id="qiDisarm">${cue.armed === false ? "Arm" : "Disarm"}</button>
        <button class="btn del" id="qiDel">삭제</button>
        <button class="btn go" id="qiGo">이 큐 GO</button>
      </div>
    `;

    pane.querySelector("#qiCont").value = cue.cont || "none";

    const bind = (id, fn) => {
      const el = pane.querySelector("#" + id);
      if (!el) return;
      el.addEventListener("change", () => {
        fn(el.value);
        editor.showControl.persistToSceneUserData();
        syncStandby();
        sharedUI.refreshAll();
      });
    };

    bind("qiNum", (v) => (cue.num = v));
    bind("qiName", (v) => (cue.name = v));
    bind("qiPre", (v) => (cue.preWait = Number(v) || 0));
    bind("qiDur", (v) => (cue.duration = Number(v) || 0));
    bind("qiCont", (v) => (cue.cont = v));

    pane.querySelector("#qiDisarm").onclick = () => {
      cue.armed = !(cue.armed === false);
      editor.showControl.persistToSceneUserData();
      sharedUI.refreshAll();
    };
    pane.querySelector("#qiDel").onclick = () => {
      const idx = sc.standbyIndex;
      sc.cues.splice(idx, 1);
      sc.setStandby(Math.min(idx, sc.cues.length - 1));
      editor.showControl.persistToSceneUserData();
      syncStandby();
      sharedUI.refreshAll();
    };
    pane.querySelector("#qiGo").onclick = () => {
      editor.showControl.go();
      syncStandby();
      sharedUI.refreshAll();
    };

    // --- Actions UI
    const ensureActions = () => {
      if (!Array.isArray(cue.actions)) cue.actions = [];
      return cue.actions;
    };
    const listHost = pane.querySelector("#qaList");
    const renderActions = () => {
      const actions = ensureActions();
      listHost.innerHTML = "";
      if (!actions.length) {
        const empty = document.createElement("div");
        empty.style.color = "rgba(255,255,255,0.45)";
        empty.style.fontSize = "11px";
        empty.textContent = "이 큐에 연결된 액션이 없습니다. (+ 버튼으로 추가)";
        listHost.appendChild(empty);
        return;
      }

      actions.forEach((a, idx) => {
        const row = document.createElement("div");
        row.style.border = "1px solid rgba(255,255,255,0.10)";
        row.style.borderRadius = "10px";
        row.style.padding = "10px";
        row.style.marginBottom = "8px";
        row.style.background = "rgba(255,255,255,0.03)";

        const head = document.createElement("div");
        head.style.display = "flex";
        head.style.alignItems = "center";
        head.style.gap = "8px";
        head.innerHTML = `
          <div style="font-family:JetBrains Mono;color:rgba(255,255,255,0.85);font-size:11px">${a.type || "action"}</div>
          <div style="margin-left:auto;display:flex;gap:6px">
            <button class="btn del" data-act-del="${idx}">삭제</button>
          </div>
        `;
        row.appendChild(head);

        const body = document.createElement("div");
        body.style.marginTop = "8px";
        body.className = "sb-form";

        if (a.type === "workLight") {
          const v = Math.round(clamp01(Number(a.level01 ?? 0)) * 100);
          body.innerHTML = `
            <label>Level</label><input data-act="${idx}" data-k="level01" type="range" min="0" max="100" value="${v}" />
            <label></label><div style="text-align:right;color:rgba(255,255,255,0.65);font-family:JetBrains Mono">${v}%</div>
          `;
        } else if (a.type === "lightToggle") {
          body.innerHTML = `
            <label>Light</label>
            <select data-act="${idx}" data-k="uuid" style="width:100%">
              ${(editor.showControl.ensureRegistry().lights || [])
                .map((l) => `<option value="${l.uuid}">${(l.name || l.uuid).replace(/</g, "&lt;")}</option>`)
                .join("")}
            </select>
            <label>ON</label><input data-act="${idx}" data-k="enabled" type="checkbox" ${a.enabled !== false ? "checked" : ""} />
          `;
        } else if (a.type === "deployGroup") {
          const groups = editor.showControl.ensureGroups();
          body.innerHTML = `
            <label>그룹</label>
            <select data-act="${idx}" data-k="groupId" style="width:100%">
              ${groups
                .map((g) => `<option value="${g.id}">${(g.name || g.id).replace(/</g, "&lt;")} (${g.members.length})</option>`)
                .join("")}
            </select>
          `;
        } else if (a.type === "moveGroup") {
          const groups = editor.showControl.ensureGroups();
          body.innerHTML = `
            <label>그룹</label>
            <select data-act="${idx}" data-k="groupId" style="width:100%">
              ${groups
                .map((g) => `<option value="${g.id}">${(g.name || g.id).replace(/</g, "&lt;")} (${g.members.length})</option>`)
                .join("")}
            </select>
            <label>X</label><input data-act="${idx}" data-k="x" type="number" step="0.1" value="${Number(a.x ?? 0)}" />
            <label>Z</label><input data-act="${idx}" data-k="z" type="number" step="0.1" value="${Number(a.z ?? 0)}" />
            <label>Duration</label><input data-act="${idx}" data-k="duration" type="number" step="0.1" value="${Number(a.duration ?? cue.duration ?? 1.2)}" />
          `;
        } else if (a.type === "moveActor") {
          const targets = editor.showControl.ensureRegistry().motion || [];
          body.innerHTML = `
            <label>대상</label>
            <select data-act="${idx}" data-k="uuid" style="width:100%">
              ${targets
                .map((m) => `<option value="${m.uuid}">${(m.name || m.uuid).replace(/</g, "&lt;")}</option>`)
                .join("")}
            </select>
            <label>X</label><input data-act="${idx}" data-k="x" type="number" step="0.1" value="${Number(a.x ?? 0)}" />
            <label>Z</label><input data-act="${idx}" data-k="z" type="number" step="0.1" value="${Number(a.z ?? 0)}" />
            <label>Duration</label><input data-act="${idx}" data-k="duration" type="number" step="0.1" value="${Number(a.duration ?? cue.duration ?? 1.2)}" />
          `;
        } else {
          body.innerHTML = `<label>JSON</label><input value="${JSON.stringify(a).replace(/"/g, "&quot;")}" disabled />`;
        }

        row.appendChild(body);
        listHost.appendChild(row);

        // apply initial selects
        const uuidSel = body.querySelector('select[data-k="uuid"]');
        if (uuidSel && a.uuid) uuidSel.value = a.uuid;
        else if (uuidSel && a.actorId != null) {
          const actor = editor.actorsManager?.getActor?.(Number(a.actorId));
          if (actor?.object?.uuid) uuidSel.value = actor.object.uuid;
        }
        const groupSel = body.querySelector('select[data-k="groupId"]');
        if (groupSel && a.groupId) groupSel.value = a.groupId;
      });

      // bind changes (delegated)
      listHost.querySelectorAll("[data-act][data-k]").forEach((el) => {
        const idx = Number(el.dataset.act);
        const k = el.dataset.k;
        el.addEventListener("change", () => {
          const a = ensureActions()[idx];
          if (!a) return;
          if (el.type === "checkbox") a[k] = !!el.checked;
          else if (el.type === "range") a[k] = clamp01(Number(el.value) / 100);
          else if (el.type === "number") a[k] = Number(el.value);
          else a[k] = el.value;
          editor.showControl.persistToSceneUserData();
          renderActions();
        });
        if (el.type === "range") {
          el.addEventListener("input", () => {
            const a = ensureActions()[idx];
            if (!a) return;
            a[k] = clamp01(Number(el.value) / 100);
            editor.showControl.persistToSceneUserData();
            renderActions();
          });
        }
      });

      listHost.querySelectorAll("[data-act-del]").forEach((b) => {
        b.addEventListener("click", () => {
          const i = Number(b.dataset.actDel);
          ensureActions().splice(i, 1);
          editor.showControl.persistToSceneUserData();
          renderActions();
        });
      });
    };

    const pickDefaultLight = () => editor.showControl.ensureRegistry().lights?.[0]?.uuid;
    const pickDefaultMotion = () => editor.showControl.ensureRegistry().motion?.[0]?.uuid;
    const pickDefaultGroup = () => editor.showControl.getSelectedGroup()?.id;

    pane.querySelector("#qaAddWork").onclick = () => {
      ensureActions().push({ type: "workLight", level01: 0.3 });
      editor.showControl.persistToSceneUserData();
      renderActions();
    };
    pane.querySelector("#qaAddLight").onclick = () => {
      const uuid = pickDefaultLight();
      ensureActions().push({ type: "lightToggle", uuid: uuid || "", enabled: true });
      editor.showControl.persistToSceneUserData();
      renderActions();
    };
    pane.querySelector("#qaAddMove").onclick = () => {
      const uuid = pickDefaultMotion();
      ensureActions().push({ type: "moveActor", uuid: uuid || "", x: 0, z: 0, duration: 1.2 });
      editor.showControl.persistToSceneUserData();
      renderActions();
    };
    pane.querySelector("#qaAddGroupMove").onclick = () => {
      const groupId = pickDefaultGroup();
      ensureActions().push({ type: "moveGroup", groupId: groupId || "", x: 0, z: 0, duration: 1.2 });
      editor.showControl.persistToSceneUserData();
      renderActions();
    };
    pane.querySelector("#qaAddDeploy").onclick = () => {
      const groupId = pickDefaultGroup();
      ensureActions().push({ type: "deployGroup", groupId: groupId || "" });
      editor.showControl.persistToSceneUserData();
      renderActions();
    };

    renderActions();

    renderCueList(pane);
  };

  const mountGroupSection = (host) => {
    if (!host) return;
    host.innerHTML = "";
    const groups = editor.showControl.ensureGroups();
    const activeGroup = editor.showControl.getSelectedGroup();
    const pathPick = editor.showControl.getGroupPathPickMode?.();

    const paneR = document.createElement("div");
    paneR.className = "sb-sc-pane sb-ens-pane";
    host.appendChild(paneR);

    paneR.innerHTML = `
      <div class="sb-ens">
        <div class="sb-ens-toolbar">
          <button type="button" class="sb-chip acc" id="ensNewGroup">+ 그룹 만들기</button>
          <button type="button" class="sb-chip" id="ensRenameGroup" title="이름 변경">이름 변경</button>
          <button type="button" class="sb-chip del" id="ensDelGroup" title="그룹 삭제">삭제</button>
        </div>
        <div class="sb-ens-groups" id="ensGroups" role="tablist" aria-label="그룹 목록"></div>

        <div class="sb-ens-step">
          <div class="sb-ens-step-num">1 · 객체 등록</div>
          <div class="sb-ens-subtitle">FBX 번호 선택 → [그룹에 등록] · ${activeGroup?.name || "그룹 선택"} · 다른 그룹 슬롯도 등록 시 이동</div>
          <div class="sb-ens-grid" id="fbxSlots"><div style="color:rgba(255,255,255,0.45);font-size:11px;padding:8px">FBX 목록 불러오는 중…</div></div>
          <div class="sb-ens-actions">
            <button type="button" class="sb-chip acc" id="ensAddSlotsToGroup">선택 → 그룹에 등록</button>
            <button type="button" class="sb-chip" id="ensClearSlotSel">선택 해제</button>
          </div>
          <div class="sb-ens-subtitle">등록된 멤버 · ${FORMATION_LABELS[activeGroup?.formation] || "격자"}</div>
          <div class="sb-ens-grid" id="ensGrid"></div>
        </div>

        <div class="sb-ens-step">
          <div class="sb-ens-step-num">2 · Formation</div>
          <div class="sb-ens-subtitle" id="ensFmtHint">선택 구간 포메이션 · 기본 간격</div>
          <div class="sb-ens-actions" id="ensFmtBtns">
            <button type="button" class="sb-chip" data-fmt="grid">격자</button>
            <button type="button" class="sb-chip" data-fmt="line">횡대 (X)</button>
            <button type="button" class="sb-chip" data-fmt="lineZ">종렬 (Z)</button>
            <button type="button" class="sb-chip" data-fmt="circle">원형</button>
            <button type="button" class="sb-chip" data-fmt="scatter">산개</button>
          </div>
          <div class="sb-form" style="gap:6px;margin-top:4px">
            <label>간격 (기본)</label>
            <input id="gmSpace" type="number" step="1" min="0.5" value="${Number(activeGroup?.formationSpacing || 30)}" />
          </div>
        </div>

        <div class="sb-ens-step">
          <div class="sb-ens-step-num">3 · 그룹 애니메이션 (구간)</div>
          <div id="ensGroupMove"></div>
          <div class="sb-ens-actions">
            <button type="button" class="sb-chip cy ${pathPick?.mode === "from" ? "on" : ""}" id="ensPlaceFrom">시작 위치 (무대 클릭)</button>
            <button type="button" class="sb-chip acc" id="ensAddSegment">+ 구간 추가</button>
          </div>
        </div>

        <div class="sb-ens-step">
          <div class="sb-ens-step-num">4 · 배치</div>
          <div class="sb-ens-actions">
            <button type="button" class="sb-chip acc" id="ensDeployGroup">그룹 GO (스테이지 배치)</button>
          </div>
        </div>
      </div>
    `;

    const getCatalogGroupLabel = (catalogIndex) => {
      const owner = editor.showControl.findGroupWithCatalogIndex?.(catalogIndex);
      if (!owner) return "OPEN";
      const current = editor.showControl.getSelectedGroup();
      if (owner.id === current?.id) return "THIS GROUP";
      return owner.name || "IN GROUP";
    };

    const renderFbxSlotGrid = async () => {
      const slotHost = paneR.querySelector("#fbxSlots");
      if (!slotHost) return;
      const catalog = await editor.showControl.ensureFbxCatalog();
      slotHost.innerHTML = "";
      const selected = editor.showControl.selectedFbxSlotIndices;

      catalog.forEach((entry, index) => {
        const num = index + 1;
        const groupLabel = getCatalogGroupLabel(index);
        const inOtherGroup = groupLabel !== "OPEN" && groupLabel !== "THIS GROUP";
        const deployed = !!findSceneObjectForCatalogEntry(editor, entry);
        const label = (entry.displayName || entry.name || entry.filename || `#${num}`).replace(/</g, "&lt;");
        const status =
          inOtherGroup ? `${groupLabel} · 등록 시 이동` : groupLabel;
        const cell = document.createElement("div");
        cell.className = "sb-ens-cell" + (selected.has(index) ? " on" : "") + (inOtherGroup ? " other-group" : "");
        cell.innerHTML = `
          <div class="sb-fbx-slot-num">${num}</div>
          <div class="lbl">${label}</div>
          <small>${status}${deployed ? " · LIVE" : ""}</small>
        `;
        cell.onclick = (e) => {
          if (e.ctrlKey || e.metaKey) {
            editor.showControl.toggleFbxSlot(index);
          } else {
            editor.showControl.clearFbxSlotSelection();
            editor.showControl.toggleFbxSlot(index);
          }
          sharedUI.refreshAll();
        };
        slotHost.appendChild(cell);
      });
    };

    renderFbxSlotGrid();

    const renderGroupTabs = () => {
      const groupHost = paneR.querySelector("#ensGroups");
      if (!groupHost) return;
      const list = editor.showControl.ensureGroups();
      const current = editor.showControl.getSelectedGroup();
      groupHost.innerHTML = "";
      if (!list.length) {
        groupHost.innerHTML = `<span style="color:rgba(255,255,255,0.45);font-size:11px;padding:4px 2px">그룹이 없습니다. [+ 그룹 만들기]를 누르세요.</span>`;
        return;
      }
      list.forEach((g) => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "sb-ens-group-tab" + (g.id === current?.id ? " on" : "");
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", String(g.id === current?.id));
        tab.textContent = `${g.name} (${g.members.length})`;
        tab.onclick = () => {
          editor.showControl.setSelectedGroupId(g.id);
          remountGroupsSection();
        };
        groupHost.appendChild(tab);
      });
    };

    const remountGroupsSection = () => {
      syncStandby();
      mountGroupSection(host);
    };

    editor._showControlPathPickDone = () => remountGroupsSection();

    renderGroupTabs();

    const grid = paneR.querySelector("#ensGrid");
    const members = activeGroup?.members || [];
    const offsets = computeFormationOffsets(
      members.length,
      activeGroup?.segments?.[0]?.formation || activeGroup?.formation || "grid",
      activeGroup?.formationSpacing ?? 30,
    );

    if (!members.length) {
      const empty = document.createElement("div");
      empty.style.gridColumn = "1 / -1";
      empty.style.color = "rgba(255,255,255,0.45)";
      empty.style.fontSize = "11px";
      empty.style.padding = "12px 4px";
      empty.textContent = "그룹 탭을 선택한 뒤 FBX 번호를 선택하고 [그룹에 등록]하세요.";
      grid.appendChild(empty);
    } else {
      members.forEach((member, i) => {
        const slotNum = Number.isFinite(member.catalogIndex) ? member.catalogIndex + 1 : member.actorId || i + 1;
        const title = (member.displayName || `Member ${slotNum}`).replace(/</g, "&lt;");
        const deployed = member.deployedUuid
          ? editor.scene?.getObjectByProperty?.("uuid", member.deployedUuid)
          : null;
        const off = offsets[i] || { x: 0, z: 0 };
        const cell = document.createElement("div");
        cell.className = "sb-ens-cell";
        cell.innerHTML = `
          <div class="sb-fbx-slot-num">${slotNum}</div>
          <div class="lbl">${title}</div>
          <small>${deployed ? "LIVE" : "PLANNED"}</small>
        `;
        cell.title = `오프셋 X:${off.x.toFixed(1)} Z:${off.z.toFixed(1)}`;
        cell.oncontextmenu = (e) => {
          e.preventDefault();
          editor.showControl.removeMemberFromGroup(activeGroup.id, member.id);
          sharedUI.refreshAll();
        };
        if (deployed) cell.onclick = () => editor.select?.(deployed);
        grid.appendChild(cell);
      });
    }

    const moveHost = paneR.querySelector("#ensGroupMove");
    if (moveHost && activeGroup) {
      const segments = activeGroup.segments || [];
      const totalDur = getGroupTotalDuration(activeGroup);
      const selSeg = editor.showControl.getSelectedSegment(activeGroup);
      const hasDeployed = (activeGroup.members || []).some((m) => m.deployedUuid);

      moveHost.innerHTML = `
        <div class="sb-form" style="gap:6px">
          <label>Start (초)</label><input id="gmStart" type="number" step="0.1" value="${Number(activeGroup.startTime || 0)}" />
          <label>총 Duration</label><input type="text" readonly value="${totalDur.toFixed(1)}초 (구간 합)" style="opacity:0.75" />
          <label>From X</label><input id="gmFx" type="number" step="0.1" value="${Number(activeGroup.fromX || 0)}" />
          <label>From Z</label><input id="gmFz" type="number" step="0.1" value="${Number(activeGroup.fromZ || 0)}" />
          <label>From Rot Y (°)</label><input id="gmFry" type="number" step="1" value="${Number(activeGroup.fromRotY || 0)}" />
        </div>
        <div id="ensSegments"></div>
        ${hasDeployed ? `<div class="sb-ens-actions" style="margin-top:6px;flex-wrap:wrap">
          <button type="button" class="sb-chip acc" id="ensSyncGroupTimelineSel">선택 트랙 반영</button>
          <button type="button" class="sb-chip" id="ensSyncGroupTimelineAll">그룹 전체 반영</button>
        </div>
        <div style="font-size:10px;color:rgba(255,255,255,0.42);margin-top:4px">구간마다 포메이션·끝 위치·시간을 다르게 줄 수 있습니다. GO / 반영 시 구간 수만큼 키프레임이 생성됩니다.</div>` : ""}
      `;

      const segHost = moveHost.querySelector("#ensSegments");
      const fmtTypes = ["grid", "line", "lineZ", "circle", "scatter"];

      segments.forEach((seg, idx) => {
        const isOn = seg.id === selSeg?.id;
        const pickOn = pathPick?.mode === "segmentAnchor" && pathPick?.segmentId === seg.id;
        const card = document.createElement("div");
        card.className = "sb-ens-seg" + (isOn ? " on" : "");
        card.innerHTML = `
          <div class="sb-ens-seg-hd">
            <strong>구간 ${idx + 1}</strong>
            <span style="margin-left:auto;color:rgba(255,255,255,0.4)">${FORMATION_LABELS[seg.formation] || seg.formation}</span>
            ${segments.length > 1 ? `<button type="button" class="sb-chip del" data-seg-del="${seg.id}" style="padding:2px 6px;font-size:10px">삭제</button>` : ""}
          </div>
          <div class="sb-form" style="gap:4px">
            <label>Duration</label><input data-seg-dur="${seg.id}" type="number" step="0.1" min="0.1" value="${Number(seg.duration || 3)}" />
            <label>끝 X</label><input data-seg-ax="${seg.id}" type="number" step="0.1" value="${Number(seg.anchorX || 0)}" />
            <label>끝 Z</label><input data-seg-az="${seg.id}" type="number" step="0.1" value="${Number(seg.anchorZ || 0)}" />
            <label>끝 Rot Y°</label><input data-seg-ry="${seg.id}" type="number" step="1" value="${Number(seg.toRotY || 0)}" />
          </div>
          <div class="sb-ens-seg-fmt" data-seg-fmt="${seg.id}"></div>
          <button type="button" class="sb-chip cy ${pickOn ? "on" : ""}" data-seg-pick="${seg.id}">끝 위치 (무대 클릭)</button>
        `;
        card.onclick = (e) => {
          if (e.target.closest("button,input")) return;
          editor.showControl.setSelectedSegmentId(seg.id);
          remountGroupsSection();
        };
        segHost.appendChild(card);

        const fmtRow = card.querySelector(`[data-seg-fmt="${seg.id}"]`);
        fmtTypes.forEach((fmt) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "sb-chip" + (seg.formation === fmt ? " on cy" : "");
          b.textContent = FORMATION_LABELS[fmt] || fmt;
          b.onclick = (e) => {
            e.stopPropagation();
            editor.showControl.setSelectedSegmentId(seg.id);
            editor.showControl.setGroupFormation(activeGroup.id, fmt, seg.id);
            sharedUI.refreshAll();
          };
          fmtRow.appendChild(b);
        });

        card.querySelector(`[data-seg-dur="${seg.id}"]`)?.addEventListener("change", (e) => {
          editor.showControl.updateGroupSegment(activeGroup.id, seg.id, { duration: Number(e.target.value) });
          remountGroupsSection();
        });
        card.querySelector(`[data-seg-ax="${seg.id}"]`)?.addEventListener("change", (e) => {
          editor.showControl.updateGroupSegment(activeGroup.id, seg.id, { anchorX: Number(e.target.value) });
        });
        card.querySelector(`[data-seg-az="${seg.id}"]`)?.addEventListener("change", (e) => {
          editor.showControl.updateGroupSegment(activeGroup.id, seg.id, { anchorZ: Number(e.target.value) });
        });
        card.querySelector(`[data-seg-ry="${seg.id}"]`)?.addEventListener("change", (e) => {
          editor.showControl.updateGroupSegment(activeGroup.id, seg.id, { toRotY: Number(e.target.value) });
        });
        const pickBtn = card.querySelector(`[data-seg-pick="${seg.id}"]`);
        if (pickBtn) {
          pickBtn.onclick = (e) => {
            e.stopPropagation();
            editor.showControl.setSelectedSegmentId(seg.id);
            editor.showControl.setGroupPathPickMode(activeGroup.id, "segmentAnchor", seg.id);
            remountGroupsSection();
          };
        }
        const delBtn = card.querySelector(`[data-seg-del="${seg.id}"]`);
        if (delBtn) {
          delBtn.onclick = (e) => {
            e.stopPropagation();
            editor.showControl.removeGroupSegment(activeGroup.id, seg.id);
            remountGroupsSection();
          };
        }
      });

      const bindGroupField = (id, key) => {
        const el = moveHost.querySelector(id);
        el?.addEventListener("change", () => {
          editor.showControl.updateGroup(activeGroup.id, { [key]: Number(el.value) });
        });
      };
      bindGroupField("#gmStart", "startTime");
      bindGroupField("#gmFx", "fromX");
      bindGroupField("#gmFz", "fromZ");
      bindGroupField("#gmFry", "fromRotY");

      const runSync = async (scope) => {
        const result = await editor.showControl.syncGroupTimeline(activeGroup.id, scope);
        if (!result?.ok) {
          const msg =
            result?.reason === "no_selection"
              ? "선택 트랙 반영 실패 — 모션 타임라인에서 이 그룹 멤버 트랙(또는 씬 객체)을 먼저 선택하세요."
              : "타임라인 반영 실패 — 그룹 GO로 먼저 배치하고, LIVE 멤버가 있어야 합니다.";
          window.alert(msg);
        } else {
          remountGroupsSection();
        }
      };
      moveHost.querySelector("#ensSyncGroupTimelineSel")?.addEventListener("click", () => runSync("selected"));
      moveHost.querySelector("#ensSyncGroupTimelineAll")?.addEventListener("click", () => runSync("all"));
    }

    const fmtHint = paneR.querySelector("#ensFmtHint");
    if (fmtHint && activeGroup) {
      const sel = editor.showControl.getSelectedSegment(activeGroup);
      fmtHint.textContent = sel
        ? `구간 ${(activeGroup.segments?.indexOf(sel) ?? 0) + 1} 포메이션 · ${FORMATION_LABELS[sel.formation] || sel.formation}`
        : "구간을 선택하면 포메이션 적용 대상이 바뀝니다";
    }

    const spaceInput = paneR.querySelector("#gmSpace");
    spaceInput?.addEventListener("change", () => {
      if (!activeGroup?.id) return;
      editor.showControl.updateGroup(activeGroup.id, { formationSpacing: Number(spaceInput.value) });
    });

    paneR.querySelectorAll("#ensFmtBtns [data-fmt]").forEach((btn) => {
      const fmt = btn.dataset.fmt;
      const selSeg = editor.showControl.getSelectedSegment(activeGroup);
      const curFmt = selSeg?.formation || activeGroup?.formation;
      btn.classList.toggle("on", curFmt === fmt);
      btn.classList.toggle("cy", curFmt === fmt);
      btn.onclick = () => {
        if (!activeGroup?.id) return;
        editor.showControl.setGroupFormation(activeGroup.id, fmt, selSeg?.id);
        sharedUI.refreshAll();
      };
    });

    paneR.querySelector("#ensAddSlotsToGroup").onclick = async () => {
      const g = editor.showControl.getSelectedGroup();
      if (!g) return;
      const catalog = await editor.showControl.ensureFbxCatalog();
      if (!editor.showControl.selectedFbxSlotIndices.size) {
        window.alert("FBX 번호(1,2,3…)를 먼저 선택하세요. Ctrl+클릭으로 여러 개 선택 가능합니다.");
        return;
      }
      const added = editor.showControl.addSelectedFbxSlotsToGroup(g.id, catalog);
      if (!added) window.alert("그룹 등록에 실패했습니다.");
      sharedUI.refreshAll();
    };
    paneR.querySelector("#ensClearSlotSel").onclick = () => {
      editor.showControl.clearFbxSlotSelection();
      sharedUI.refreshAll();
    };

    paneR.querySelector("#ensNewGroup").onclick = () => {
      const name = window.prompt("새 그룹 이름", "악단");
      if (name == null) return;
      editor.showControl.createGroup(name.trim() || "새 그룹");
      remountGroupsSection();
    };
    paneR.querySelector("#ensRenameGroup").onclick = () => {
      const g = editor.showControl.getSelectedGroup();
      if (!g) return;
      const name = window.prompt("그룹 이름 변경", g.name);
      if (name == null) return;
      editor.showControl.renameGroup(g.id, name.trim() || g.name);
      remountGroupsSection();
    };
    paneR.querySelector("#ensDelGroup").onclick = async () => {
      const g = editor.showControl.getSelectedGroup();
      if (!g) return;
      if (!window.confirm(`"${g.name}" 그룹과 타임라인 트랙을 모두 삭제할까요?`)) return;
      editor.showControl.setGroupPathPickMode?.(null, null);
      await editor.showControl.deleteGroup(g.id);
      remountGroupsSection();
    };

    paneR.querySelector("#ensDeployGroup").onclick = async () => {
      const g = editor.showControl.getSelectedGroup();
      if (!g || !g.members.length) {
        window.alert("배치할 그룹 멤버가 없습니다. FBX 번호를 선택해 그룹에 등록하세요.");
        return;
      }
      const btn = paneR.querySelector("#ensDeployGroup");
      const prev = btn.textContent;
      btn.textContent = "배치 중…";
      btn.disabled = true;
      try {
        const result = await editor.showControl.deployGroup(g.id);
        if (result.count > 0) {
          console.log(`✅ 그룹 배치 완료: ${result.count}명`);
        }
        if (!result.count || result.errors?.length) {
          window.alert(
            result.errors?.length
              ? `배치 실패:\n${result.errors.join("\n")}`
              : "배치된 객체가 없습니다.",
          );
        }
        sharedUI.refreshAll();
      } catch (e) {
        console.error(e);
        window.alert(`배치 오류: ${e?.message || e}`);
        sharedUI.refreshAll();
      } finally {
        btn.textContent = prev;
        btn.disabled = false;
      }
    };
    paneR.querySelector("#ensPlaceFrom").onclick = () => {
      const g = editor.showControl.getSelectedGroup();
      if (!g) return;
      editor.showControl.setGroupPathPickMode(g.id, "from");
      remountGroupsSection();
    };
    const addSegBtn = paneR.querySelector("#ensAddSegment");
    if (addSegBtn) {
      addSegBtn.onclick = () => {
        const g = editor.showControl.getSelectedGroup();
        if (!g) return;
        editor.showControl.addGroupSegment(g.id);
        remountGroupsSection();
      };
    }

    sharedUI.refreshers.groups = remountGroupsSection;
  };

  const mountTargetsSection = (host) => {
    host.innerHTML = "";
    const secT = document.createElement("div");
    secT.className = "sb-sc-sec";
    secT.innerHTML = `CONTROL TARGETS <span style="margin-left:auto;color:rgba(255,255,255,0.5)">직접 등록 → 큐 액션에서 선택</span>`;
    host.appendChild(secT);

    const paneT = document.createElement("div");
    paneT.className = "sb-sc-pane";
    host.appendChild(paneT);

    const getSceneLights = () => {
      const out = [];
      editor.scene?.traverse?.((o) => {
        if (o?.isLight) out.push(o);
      });
      return out;
    };

    const renderRegistry = () => {
      const reg = editor.showControl.ensureRegistry();
      const lights = getSceneLights();
      const motionObjects = collectSceneMotionObjects(editor);

      const lightRows = lights
        .map((l) => {
          const name = (l.name || l.uuid).replace(/</g, "&lt;");
          const checked = reg.lights.some((x) => x?.uuid === l.uuid);
          return `<label style="display:flex;align-items:center;gap:8px;margin:4px 0">
            <input type="checkbox" data-reg-light="${l.uuid}" ${checked ? "checked" : ""} />
            <span style="color:rgba(255,255,255,0.80);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</span>
          </label>`;
        })
        .join("");

      const motionRows = motionObjects
        .map((o) => {
          const label = motionObjectLabel(o).replace(/</g, "&lt;");
          const checked = reg.motion.some((m) => m?.uuid === o.uuid);
          const tag = o.userData?.actorId ? "Actor" : "FBX";
          return `<label style="display:flex;align-items:center;gap:8px;margin:4px 0">
            <input type="checkbox" data-reg-motion="${o.uuid}" ${checked ? "checked" : ""} />
            <span style="color:rgba(255,255,255,0.80);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</span>
            <span style="margin-left:auto;color:rgba(255,255,255,0.45);font-size:10px">${tag}</span>
          </label>`;
        })
        .join("");

      const registeredMotion = reg.motion
        .map((m) => {
          const obj = m.uuid ? editor.scene?.getObjectByProperty?.("uuid", m.uuid) : null;
          const missing = m.uuid && !obj;
          const label = (m.name || m.uuid || "unknown").replace(/</g, "&lt;");
          return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;opacity:${missing ? 0.45 : 1}">
            <span style="color:rgba(63,214,224,0.9);font-size:10px">●</span>
            <span style="color:rgba(255,255,255,0.80);font-size:12px">${label}</span>
            ${missing ? `<span style="margin-left:auto;color:rgba(255,120,120,0.8);font-size:10px">missing</span>` : ""}
          </div>`;
        })
        .join("");

      const sel = editor.selected;
      const canRegisterSel = !!(sel && (sel.isLight || sel.userData?.source === "motion"));

      paneT.innerHTML = `
        <div style="display:flex;gap:6px;margin-bottom:10px">
          <button class="btn" id="regSel" ${canRegisterSel ? "" : "disabled"}>+ 선택 객체 등록</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <div style="color:rgba(255,255,255,0.65);font-size:11px;margin-bottom:6px">LIGHTS (씬 조명)</div>
            <div style="max-height:120px;overflow:auto;padding-right:6px">${lightRows || `<div style="color:rgba(255,255,255,0.45);font-size:11px">씬에 Light가 없습니다.</div>`}</div>
          </div>
          <div>
            <div style="color:rgba(255,255,255,0.65);font-size:11px;margin-bottom:6px">MOTION (Assets 씬 객체)</div>
            <div style="max-height:120px;overflow:auto;padding-right:6px">${motionRows || `<div style="color:rgba(255,255,255,0.45);font-size:11px">Assets에서 FBX를 추가하면 여기에 표시됩니다.</div>`}</div>
          </div>
        </div>
        <div style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.08);padding-top:8px">
          <div style="color:rgba(255,255,255,0.65);font-size:11px;margin-bottom:6px">등록됨 (${reg.motion.length + reg.lights.length})</div>
          <div style="max-height:80px;overflow:auto">
            ${registeredMotion || `<div style="color:rgba(255,255,255,0.45);font-size:11px">체크박스로 등록하거나, 씬에서 선택 후 [선택 객체 등록]을 누르세요.</div>`}
          </div>
        </div>
        <div class="hint" style="margin-top:10px;color:rgba(255,255,255,0.55);font-size:11px">
          Formation(격자/횡대/원형/산개)으로 대형 배치 · GROUP MOVE에서 시간·이동 설정 · GO 시 전원 동시 애니메이션
        </div>
      `;

      paneT.querySelector("#regSel")?.addEventListener("click", () => {
        if (editor.showControl.registerSelectedObject()) {
          renderRegistry();
          sharedUI.refreshAll();
        }
      });

      paneT.querySelectorAll("[data-reg-light]").forEach((cb) => {
        cb.addEventListener("change", () => {
          const uuid = cb.dataset.regLight;
          const obj = editor.scene?.getObjectByProperty?.("uuid", uuid);
          if (cb.checked) editor.showControl.registerLight(uuid, obj?.name || uuid);
          else editor.showControl.unregisterLight(uuid);
          renderRegistry();
        });
      });

      paneT.querySelectorAll("[data-reg-motion]").forEach((cb) => {
        cb.addEventListener("change", () => {
          const uuid = cb.dataset.regMotion;
          const obj = editor.scene?.getObjectByProperty?.("uuid", uuid);
          if (cb.checked) {
            editor.showControl.registerMotionObject(uuid, motionObjectLabel(obj), obj?.userData?.actorId);
          } else {
            editor.showControl.unregisterMotionObject(uuid);
          }
          renderRegistry();
          sharedUI.refreshAll();
        });
      });
    };

    renderRegistry();
  };

  const renderQLab = () => {
    if (!leftCol || !rightCol) return;
    leftCol.innerHTML = "";
    rightCol.innerHTML = "";
    mountCueSection(leftCol);
    const groupWrap = document.createElement("div");
    rightCol.appendChild(groupWrap);
    mountGroupSection(groupWrap);
    const targetsWrap = document.createElement("div");
    rightCol.appendChild(targetsWrap);
    mountTargetsSection(targetsWrap);
  };

  const mountMASection = (host) => {
    host.innerHTML = "";

    const sec = document.createElement("div");
    sec.className = "sb-sc-sec";
    sec.innerHTML = `MA Lighting <b>INTENSITY</b> <span style="margin-left:auto;color:rgba(255,255,255,0.5)">무대 확인용 WORK</span>`;
    host.appendChild(sec);

    const pane = document.createElement("div");
    pane.className = "sb-sc-pane";
    host.appendChild(pane);

    pane.innerHTML = `
      <div class="sb-form">
        <label>WORK</label>
        <input id="sbWorkLight" type="range" min="0" max="100" value="0" />
        <label></label><div id="sbWorkLightVal" style="color:rgba(255,255,255,0.78);text-align:right;font-family:JetBrains Mono">0%</div>
      </div>
      <div class="hint" style="margin-top:10px;color:rgba(255,255,255,0.55);font-size:11px">
        프로그램 실행 후 무대 확인을 위해 먼저 WORK 밝기를 조정하세요.
      </div>
    `;

    const workSlider = pane.querySelector("#sbWorkLight");
    const workVal = pane.querySelector("#sbWorkLightVal");
    const syncWork = () => {
      const level = editor.scene?.userData?.workLightLevel ?? 0;
      workSlider.value = String(Math.round(clamp01(level) * 100));
      workVal.textContent = `${workSlider.value}%`;
    };
    syncWork();
    workSlider.addEventListener("input", () => {
      const v = clamp01(Number(workSlider.value) / 100);
      editor.setWorkLightLevel?.(v);
      workVal.textContent = `${Math.round(v * 100)}%`;
    });

    const secR = document.createElement("div");
    secR.className = "sb-sc-sec";
    secR.style.marginTop = "8px";
    secR.innerHTML = `POSITION <span style="margin-left:auto;color:rgba(255,255,255,0.5)">선택 조명</span>`;
    host.appendChild(secR);

    const paneR = document.createElement("div");
    paneR.className = "sb-sc-pane";
    host.appendChild(paneR);

    const obj = editor.selected && editor.selected.isLight ? editor.selected : null;
    paneR.innerHTML = `
      <div style="color:rgba(255,255,255,0.65);font-size:11px;margin-bottom:8px">
        ${obj ? `선택됨: <b style="color:rgba(255,255,255,0.90)">${obj.name || obj.uuid}</b>` : "조명을 선택하세요."}
      </div>
      <div class="sb-form">
        <label>ON/OFF</label><input id="sbLightOn" type="checkbox" ${obj && obj.visible !== false && (obj.intensity ?? 0) > 0 ? "checked" : ""} ${obj ? "" : "disabled"} />
        <label>Pos X</label><input id="sbLx" type="number" step="0.1" value="${obj ? obj.position.x.toFixed(1) : 0}" ${obj ? "" : "disabled"} />
        <label>Pos Y</label><input id="sbLy" type="number" step="0.1" value="${obj ? obj.position.y.toFixed(1) : 0}" ${obj ? "" : "disabled"} />
        <label>Pos Z</label><input id="sbLz" type="number" step="0.1" value="${obj ? obj.position.z.toFixed(1) : 0}" ${obj ? "" : "disabled"} />
        <label>Pan(Y)</label><input id="sbPan" type="number" step="1" value="${obj ? (obj.rotation.y * 180 / Math.PI).toFixed(0) : 0}" ${obj ? "" : "disabled"} />
        <label>Tilt(X)</label><input id="sbTilt" type="number" step="1" value="${obj ? (obj.rotation.x * 180 / Math.PI).toFixed(0) : 0}" ${obj ? "" : "disabled"} />
        <label>Intensity</label><input id="sbInt" type="range" min="0" max="100" value="${obj ? Math.round((obj.intensity ?? 0) * 100) : 0}" ${obj ? "" : "disabled"} />
      </div>
      <div class="hint" style="margin-top:10px;color:rgba(255,255,255,0.55);font-size:11px">
        조명 개별 ON/OFF 설정 가능 · POSITION 메뉴에서 위치/각도 조정
      </div>
    `;

    if (obj) {
      const on = paneR.querySelector("#sbLightOn");
      const lx = paneR.querySelector("#sbLx");
      const ly = paneR.querySelector("#sbLy");
      const lz = paneR.querySelector("#sbLz");
      const pan = paneR.querySelector("#sbPan");
      const tilt = paneR.querySelector("#sbTilt");
      const inten = paneR.querySelector("#sbInt");

      on.onchange = () => {
        const enabled = !!on.checked;
        obj.visible = enabled;
        if (enabled) {
          obj.intensity = obj.userData?.savedIntensity ?? Math.max(0.01, obj.intensity || 1);
        } else {
          obj.userData.savedIntensity = obj.intensity;
          obj.intensity = 0;
        }
        editor.signals.sceneGraphChanged.dispatch();
      };
      const bindNum = (el, fn) => el.addEventListener("change", () => { fn(Number(el.value)); editor.signals.sceneGraphChanged.dispatch(); });
      bindNum(lx, (v) => (obj.position.x = v));
      bindNum(ly, (v) => (obj.position.y = v));
      bindNum(lz, (v) => (obj.position.z = v));
      bindNum(pan, (v) => (obj.rotation.y = (v * Math.PI) / 180));
      bindNum(tilt, (v) => (obj.rotation.x = (v * Math.PI) / 180));
      inten.oninput = () => {
        obj.intensity = Number(inten.value) / 100;
        editor.signals.sceneGraphChanged.dispatch();
      };
    }
  };

  const renderMA = () => {
    if (!leftCol) return;
    leftCol.innerHTML = "";
    if (rightCol) rightCol.innerHTML = "";
    mountMASection(leftCol);
  };

  const render = () => {
    syncStandby();
    if (section && sectionHost) {
      if (section === "cues") mountCueSection(sectionHost);
      else if (section === "groups") mountGroupSection(sectionHost);
      else if (section === "targets") mountTargetsSection(sectionHost);
      else if (section === "ma") mountMASection(sectionHost);
      return;
    }
    if (view === "ma") renderMA();
    else renderQLab();
  };

  const refreshKey = section || "full";
  sharedUI.refreshers[refreshKey] = render;

  root.querySelector("#sbGoTop")?.addEventListener("click", () => {
    editor.showControl.go();
    syncStandby();
    sharedUI.refreshAll();
  });

  render();

  return root;
}

