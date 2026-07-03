/** grandMA3-style command line (MVP) */

function parseVal(w) {
  const s = String(w || "").toLowerCase();
  if (s === "full") return 100;
  if (s === "out" || s === "off") return 0;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

export function createMaCommandHandler(ctx) {
  const { engine, groups, onRefresh } = ctx;

  function getFixtures() {
    return engine?.getFixtures?.() || [];
  }

  function readSel(tokens, iRef) {
    const sel = new Set();
    let last = null;
    let mode = "+";
    const FIX = getFixtures();
    let i = iRef.i;

    while (i < tokens.length) {
      const w = String(tokens[i] || "").toLowerCase();
      if (w === "thru") {
        i++;
        const to = +tokens[i++];
        const from = last == null ? FIX[0]?.fid : last;
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        FIX.forEach((f) => {
          if (f.fid >= lo && f.fid <= hi) {
            if (mode === "-") sel.delete(f.fid);
            else sel.add(f.fid);
          }
        });
        last = to;
      } else if (w === "+") {
        i++;
        mode = "+";
      } else if (w === "-") {
        i++;
        mode = "-";
      } else if (/^\d+$/.test(w)) {
        const n = +tokens[i++];
        if (mode === "-") sel.delete(n);
        else sel.add(n);
        last = n;
      } else break;
    }
    iRef.i = i;
    return [...sel];
  }

  function applyAttr(attr, val) {
    if (attr === "dim") {
      if (!engine.getSelectionIds().length) return;
      engine.setSelectionDim(val);
      return;
    }
    engine.getSelectionIds().forEach((id) => engine.setProgAttr(id, attr, val));
  }

  function applyTail(tokens, iRef) {
    let i = iRef.i;
    while (i < tokens.length) {
      const w = String(tokens[i] || "").toLowerCase();
      if (w === "at" || w === "dim" || w === "dimmer") {
        i++;
        const v = parseVal(tokens[i++]);
        if (v != null) applyAttr("dim", v);
      } else if (["pan", "tilt", "zoom", "focus"].includes(w)) {
        i++;
        const v = parseVal(tokens[i++]);
        if (v != null) applyAttr(w, v);
      } else break;
    }
    iRef.i = i;
    onRefresh?.();
  }

  return function parseCommand(raw) {
    if (!engine?.built) return { ok: false, msg: "리그를 먼저 생성하세요" };
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return { ok: false, msg: "" };

    const head = tokens[0].toLowerCase();
    const iRef = { i: 1 };

    if (["fixture", "fix", "f"].includes(head)) {
      engine.setSelection(readSel(tokens, iRef));
      applyTail(tokens, iRef);
      return { ok: true, msg: `Fixture ${engine.getSelectionIds().length} 선택` };
    }

    if (["group", "grp", "g"].includes(head)) {
      const gs = readSel(tokens, iRef);
      const ids = [];
      gs.forEach((g) => (groups[g]?.ids || []).forEach((x) => ids.push(x)));
      engine.setSelection(ids);
      applyTail(tokens, iRef);
      return { ok: true, msg: `Group → ${ids.length} fixtures` };
    }

    if (head === "clear") {
      engine.clearProgrammer();
      onRefresh?.();
      return { ok: true, msg: "Programmer CLEAR" };
    }

    if (head === "blackout" || head === "black") {
      engine.setBlackout(!engine.blackout);
      onRefresh?.();
      return { ok: true, msg: `BLACKOUT ${engine.blackout ? "ON" : "OFF"}` };
    }

    if (head === "highlight" || head === "highlt") {
      engine.setHighlight(!engine.highlight);
      onRefresh?.();
      return { ok: true, msg: `Highlight ${engine.highlight ? "ON" : "OFF"}` };
    }

    if (head === "at" || head === "dim" || head === "dimmer") {
      iRef.i = 0;
      applyTail(tokens, iRef);
      return { ok: true, msg: "속성 적용" };
    }

    return { ok: false, msg: `명령 해석 불가: "${raw}"` };
  };
}
