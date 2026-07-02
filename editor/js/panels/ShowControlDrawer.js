import { createShowControlPanel } from "./ShowControlPanel.js";

/**
 * Bottom drawer (QLab/grandMA-ish) that slides up over timeline area.
 * Height follows `.timelineWrapper` height when possible.
 */
export function mountShowControlDrawer(editor) {
  const root = editor?.tabRoot || document.querySelector(".editorTab.active");
  if (!root) return null;

  // prevent duplicates per tab
  const existing = root.querySelector("#sb-showcontrol-drawer");
  if (existing) return existing;

  const drawer = document.createElement("div");
  drawer.id = "sb-showcontrol-drawer";
  drawer.className = "sb-drawer";
  drawer.innerHTML = `
    <div class="sb-drawer__bar">
      <div class="sb-drawer__title"><b>QLab</b> · MA Lighting</div>
      <div class="sb-drawer__sp"></div>
      <button type="button" class="sb-drawer__btn" data-act="toggle">▲</button>
      <button type="button" class="sb-drawer__btn" data-act="close">✕</button>
    </div>
    <div class="sb-drawer__body"></div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    .sb-drawer{
      position: fixed;
      left: 0; right: 0;
      bottom: 0;
      height: var(--sb-drawer-h, 460px);
      transform: translateY(calc(100% - 34px));
      transition: transform .22s cubic-bezier(.4,0,.2,1);
      z-index: 120000;
      background: linear-gradient(180deg,#15181c,#101215);
      border-top: 1px solid rgba(255,255,255,0.10);
      box-shadow: 0 -18px 40px rgba(0,0,0,0.6);
      display:flex; flex-direction:column;
      font-family: "Noto Sans KR", system-ui, -apple-system, "Segoe UI", sans-serif;
      user-select:none;
    }
    .sb-drawer.open{ transform: translateY(0); }
    .sb-drawer__bar{
      height:34px; flex-shrink:0;
      display:flex; align-items:center; gap:10px;
      padding: 0 12px;
      background: linear-gradient(180deg,#262b31,#1b1f23);
      border-bottom: 1px solid rgba(255,255,255,0.08);
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      letter-spacing: .3px;
      color: rgba(255,255,255,0.78);
    }
    .sb-drawer__title b{ color:#76b900; }
    .sb-drawer__sp{ flex:1; }
    .sb-drawer__btn{
      height:22px; padding:0 10px;
      border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(0,0,0,0.25);
      color: rgba(255,255,255,0.85);
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
    }
    .sb-drawer__btn:hover{ border-color: rgba(255,255,255,0.24); }
    .sb-drawer__body{ flex:1; min-height:0; overflow:auto; padding:10px 12px; }

    /* Make existing panel look like the reference (compact grid) */
    .sb-drawer .sb-showcontrol-panel{ max-width: 1200px; margin: 0 auto; }
  `;
  document.head.appendChild(style);

  const body = drawer.querySelector(".sb-drawer__body");
  body.appendChild(createShowControlPanel(editor));

  const toggle = () => drawer.classList.toggle("open");
  drawer.querySelector('[data-act="toggle"]').addEventListener("click", toggle);
  drawer.querySelector('[data-act="close"]').addEventListener("click", () => drawer.classList.remove("open"));

  root.appendChild(drawer);

  // Height = timelineWrapper height if available
  const tw = root.querySelector(".timelineWrapper");
  const applyH = () => {
    const h = Math.max(300, Math.min(window.innerHeight * 0.8, tw?.getBoundingClientRect?.().height || 460));
    drawer.style.setProperty("--sb-drawer-h", `${Math.round(h)}px`);
  };
  applyH();
  const ro = new ResizeObserver(applyH);
  if (tw) ro.observe(tw);
  window.addEventListener("resize", applyH);

  // Expose for quick access
  editor.showControlDrawer = drawer;
  editor.toggleShowControlDrawer = () => toggle();

  return drawer;
}

