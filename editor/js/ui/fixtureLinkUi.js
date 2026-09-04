import {
  bakeFixtureFollowDraft,
  buildFixtureFollowDraft,
} from '../domain/lighting/fixtureFollowDraft.js';
import { runLightingEdit } from '../domain/lighting/lightingHistory.js';

/**
 * Fixture pane — AI 조명 시퀀스: @캐릭터 조준(pan/tilt) 키 bake · 트랙별 프롬프트 이력
 * @param {HTMLElement} host
 * @param {{
 *   engine: import('../domain/timeline/TimelineEngine.js').TimelineEngine,
 *   fixtures: import('../domain/lighting/FixtureDirector.js').FixtureDirector,
 *   historyCtx: ReturnType<import('../domain/lighting/lightingHistory.js').createLightingHistoryContext>,
 *   getSelectedFids: () => Iterable<number>,
 *   getMotions: () => Array<{ id: string, name: string, trackId: string, object: import('three').Object3D }>,
 *   onChange?: () => void,
 *   onConvertToManual?: (aiTrackId: string) => string | null,
 * }} opts
 */
export function mountFixtureFollowAi(host, opts) {
  if (!(host instanceof HTMLElement)) return { sync() {} };

  host.innerHTML = `
    <div class="sb-seg-ai sb-fx-follow-ai">
      <div class="sb-seg-ai-head">
        <span class="sb-seg-ai-title">AI 조명 시퀀스</span>
        <span class="sb-seg-ai-hint">@캐릭터 · 따라가기·머물기·끄기</span>
        <button type="button" class="sb-seg-ai-icon-btn" data-act="fx-follow-help" title="사용법" aria-label="사용법">?</button>
      </div>
      <div class="sb-seg-ai-input-wrap" data-role="fx-follow-wrap">
        <div class="sb-ai-mention-highlight" data-role="fx-follow-highlight" aria-hidden="true"></div>
        <textarea class="sb-seg-ai-input sb-seg-ai-input--overlay" data-role="fx-follow-input"
          rows="2" spellcheck="false"
          placeholder="@주인공 시작부터 따라가다가 40초까지 머무르다가 사라져"></textarea>
      </div>
      <div class="sb-seg-ai-key-preview" data-role="fx-follow-preview" hidden></div>
      <div class="sb-seg-ai-actions">
        <button type="button" class="sb-chip" data-act="fx-follow-draft">초안 보기</button>
        <button type="button" class="sb-chip acc" data-act="fx-follow-apply" data-role="fx-follow-apply">키프레임 적용</button>
        <button type="button" class="sb-chip" data-act="fx-follow-to-manual" data-role="fx-follow-to-manual"
          title="AI 트랙을 수동 트랙으로 바꿔 키를 직접 편집합니다 (AI 문장 연결이 끊어집니다)" hidden>수동으로 변경</button>
      </div>
      <p class="sb-light-hint" data-role="fx-follow-status"></p>
    </div>
  `;

  const textarea = /** @type {HTMLTextAreaElement} */ (host.querySelector('[data-role="fx-follow-input"]'));
  const highlight = /** @type {HTMLElement} */ (host.querySelector('[data-role="fx-follow-highlight"]'));
  const preview = /** @type {HTMLElement} */ (host.querySelector('[data-role="fx-follow-preview"]'));
  const status = /** @type {HTMLElement} */ (host.querySelector('[data-role="fx-follow-status"]'));
  const wrap = /** @type {HTMLElement} */ (host.querySelector('[data-role="fx-follow-wrap"]'));
  const applyBtn = /** @type {HTMLButtonElement} */ (host.querySelector('[data-role="fx-follow-apply"]'));
  const toManualBtn = /** @type {HTMLButtonElement} */ (host.querySelector('[data-role="fx-follow-to-manual"]'));

  /** Avoid overwriting user typing when selection sync reloads the same prompt */
  let lastSelKey = '';
  let userEditedSinceLoad = false;

  function motions() {
    return opts.getMotions?.() || [];
  }

  function setStatus(msg, isErr = false) {
    if (!status) return;
    status.textContent = msg || '';
    status.classList.toggle('is-err', !!isErr);
  }

  function syncHighlight() {
    const list = motions();
    if (highlight) {
      highlight.innerHTML = buildTrackMentionHighlight(textarea.value, list);
      highlight.scrollTop = textarea.scrollTop;
      highlight.scrollLeft = textarea.scrollLeft;
    }
  }

  /** @returns {{ prompt: string | null, mixed: boolean, count: number }} */
  function promptsFromSelection() {
    const fids = [...(opts.getSelectedFids?.() || [])];
    /** @type {string[]} */
    const found = [];
    for (const fid of fids) {
      // Prefer AI track for prompt history
      const aiTrack = opts.fixtures.getAiTrackForFid?.(fid);
      if (aiTrack) {
        const p = aiTrack.fixtureFollowPrompt != null ? String(aiTrack.fixtureFollowPrompt).trim() : '';
        if (p) { found.push(p); continue; }
      }
      // Fallback: legacy prompt on manual track
      const ch = opts.fixtures.findByFid?.(fid);
      if (!ch) continue;
      const track = opts.engine.getTrack(ch.trackId);
      const p = track?.fixtureFollowPrompt != null ? String(track.fixtureFollowPrompt).trim() : '';
      if (p) found.push(p);
    }
    if (!found.length) return { prompt: null, mixed: false, count: 0 };
    const first = found[0];
    const mixed = found.some((p) => p !== first);
    return { prompt: first, mixed, count: found.length };
  }

  function updateApplyLabel(hasHistory) {
    if (!applyBtn) return;
    applyBtn.textContent = hasHistory ? '수정 후 다시 적용' : '키프레임 적용';
    applyBtn.title = hasHistory
      ? '문장을 고친 뒤 선택 Fixture 키를 다시 만듭니다 (기존 AI 키 교체)'
      : '선택한 Fixture에 AI 조명 키를 만듭니다';
  }

  /** AI 트랙이 있는 선택 fixture의 AI 트랙 id 목록 */
  function selectedAiTrackIds() {
    /** @type {string[]} */
    const ids = [];
    for (const fid of opts.getSelectedFids?.() || []) {
      const t = opts.fixtures.getAiTrackForFid?.(fid);
      if (t) ids.push(t.id);
    }
    return ids;
  }

  function updateToManualBtn() {
    if (!toManualBtn) return;
    const ids = selectedAiTrackIds();
    toManualBtn.hidden = ids.length === 0;
    toManualBtn.textContent = ids.length > 1
      ? `수동으로 변경 (${ids.length})`
      : '수동으로 변경';
  }

  function loadPromptFromSelection() {
    const fids = [...(opts.getSelectedFids?.() || [])];
    const selKey = fids.join(',');
    const info = promptsFromSelection();
    const selectionChanged = selKey !== lastSelKey;

    if (!selectionChanged && userEditedSinceLoad) {
      updateApplyLabel(info.count > 0 || !!String(textarea.value).trim());
      return;
    }

    if (selectionChanged) {
      lastSelKey = selKey;
      userEditedSinceLoad = false;
      if (info.prompt != null) {
        textarea.value = info.prompt;
        updateApplyLabel(true);
        setStatus(
          info.mixed
            ? '선택 트랙 이력이 서로 다릅니다 · 첫 트랙 문장을 불러왔습니다. 수정 후 다시 적용하세요.'
            : '이 트랙의 AI 문장을 불러왔습니다. 수정 후 다시 적용할 수 있습니다.',
        );
      } else {
        textarea.value = '';
        updateApplyLabel(false);
        setStatus('');
      }
      syncHighlight();
      return;
    }

    updateApplyLabel(info.count > 0 || !!String(textarea.value).trim());
    syncHighlight();
  }

  function runDraft(apply) {
    const prompt = textarea.value;
    const draft = buildFixtureFollowDraft(prompt, {
      engine: opts.engine,
      motions: motions(),
    });
    if (!draft.ok) {
      preview.hidden = true;
      preview.innerHTML = '';
      setStatus(draft.error, true);
      return;
    }
    preview.hidden = false;
    preview.innerHTML = `<span class="sb-seg-ai-key-preview-label">키 예정</span>${
      draft.phases.map((p) => {
        const cls = p.kind === 'follow' ? 'is-move' : p.kind === 'hold' ? 'is-hold' : 'is-exit';
        const label = p.kind === 'follow' ? '따라' : p.kind === 'hold' ? '머물' : '끄기';
        return `<span class="sb-seg-ai-key-chip ${cls}">${label}</span>`;
      }).join('')
    }`;
    setStatus(draft.summary);

    if (!apply) return;

    const fids = [...(opts.getSelectedFids?.() || [])];
    if (!fids.length) {
      setStatus('Fixture를 선택한 뒤 적용하세요.', true);
      return;
    }

    const hadHistory = promptsFromSelection().count > 0;
    runLightingEdit(opts.historyCtx, 'Fixture AI 조명 시퀀스', () => {
      const result = bakeFixtureFollowDraft({
        engine: opts.engine,
        fixtures: opts.fixtures,
        draft,
        fids,
        prompt,
      });
      if (!result.ok) {
        setStatus(result.error, true);
        return;
      }
      lastSelKey = fids.join(',');
      userEditedSinceLoad = false;
      updateApplyLabel(true);
      setStatus(
        `${hadHistory ? '다시 적용됨' : '적용됨'} · 트랙 ${result.trackCount} · 키 ${result.keyCount} · ${draft.summary}`,
      );
      opts.onChange?.();
    });
  }

  textarea.addEventListener('input', () => {
    userEditedSinceLoad = true;
    syncHighlight();
  });
  textarea.addEventListener('scroll', syncHighlight);

  host.querySelector('[data-act="fx-follow-draft"]')?.addEventListener('click', () => {
    runDraft(false);
  });
  toManualBtn?.addEventListener('click', () => {
    const ids = selectedAiTrackIds();
    if (!ids.length) {
      setStatus('AI 트랙이 있는 Fixture를 선택하세요.', true);
      return;
    }
    let n = 0;
    for (const id of ids) {
      if (opts.onConvertToManual?.(id)) n += 1;
    }
    if (!n) return;
    textarea.value = '';
    lastSelKey = '';
    userEditedSinceLoad = false;
    setStatus(`수동 트랙으로 변경됨 · ${n}개 · 이제 타임라인에서 키를 직접 편집할 수 있습니다.`);
    updateToManualBtn();
    syncHighlight();
  });
  applyBtn?.addEventListener('click', () => {
    runDraft(true);
  });
  host.querySelector('[data-act="fx-follow-help"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFxFollowHelp(/** @type {HTMLElement} */ (e.currentTarget));
  });

  wireTrackMentions(textarea, wrap, motions, syncHighlight);
  loadPromptFromSelection();
  updateToManualBtn();
  syncHighlight();

  return {
    sync() {
      loadPromptFromSelection();
      updateToManualBtn();
      syncHighlight();
    },
  };
}

/**
 * @param {string} text
 * @param {Array<{ name: string }>} motions
 */
function buildTrackMentionHighlight(text, motions) {
  if (!text) return '<br>';
  const mentionRanges = collectTrackMentionRanges(text, motions);
  return `${colorFollowKeywords(text, mentionRanges).replace(/\n/g, '<br>') || '<br>'}`;
}

/**
 * @param {string} text
 * @param {{ start: number, end: number, html: string }[]} mentionRanges
 */
function colorFollowKeywords(text, mentionRanges) {
  /** @type {{ start: number, end: number, html: string }[]} */
  const picked = [...mentionRanges];
  const overlaps = (r) => picked.some((p) => !(r.end <= p.start || r.start >= p.end));

  const defs = [
    { re: /따라(?:가|다녀|다)?|비춰|추적|follow/giu, cls: 'is-move' },
    { re: /머물(?:르)?(?:다|고|며)?|대기|홀드|hold/giu, cls: 'is-hold' },
    { re: /사라(?:져|지)|꺼져|오프|소등/giu, cls: 'is-exit' },
  ];
  for (const def of defs) {
    const re = new RegExp(def.re.source, def.re.flags);
    let m;
    while ((m = re.exec(text))) {
      const r = {
        start: m.index,
        end: m.index + m[0].length,
        html: `<span class="sb-ai-action-token ${def.cls}">${escapeHtml(m[0])}</span>`,
      };
      if (!overlaps(r)) picked.push(r);
    }
  }
  picked.sort((a, b) => a.start - b.start);
  let out = '';
  let last = 0;
  for (const r of picked) {
    out += escapeHtml(text.slice(last, r.start));
    out += r.html;
    last = r.end;
  }
  out += escapeHtml(text.slice(last));
  return out;
}

/**
 * @param {string} text
 * @param {Array<{ name: string }>} motions
 */
function collectTrackMentionRanges(text, motions) {
  const byLen = [...(motions || [])]
    .filter((m) => m?.name)
    .sort((a, b) => String(b.name).length - String(a.name).length);
  /** @type {{ start: number, end: number, html: string }[]} */
  const ranges = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@') continue;
    const after = text.slice(i + 1);
    let best = null;
    let labelEnd = -1;
    for (const m of byLen) {
      const label = String(m.name);
      if (after.startsWith(label) && label.length > labelEnd) {
        best = m;
        labelEnd = label.length;
      }
    }
    if (!best) {
      const tok = after.match(/^([^\s@.,，]+)/u);
      if (!tok) continue;
      let stripped = tok[1].replace(/(에서|으로|까지|부터|에게|을|를|이|가|은|는)$/u, '');
      best = byLen.find((m) => m.name === stripped) || null;
      labelEnd = best ? String(best.name).length : stripped.length;
    }
    const raw = text.slice(i, i + 1 + labelEnd);
    const cls = best ? 'sb-ai-mention-token is-linked' : 'sb-ai-mention-token is-unknown';
    ranges.push({
      start: i,
      end: i + 1 + labelEnd,
      html: `<span class="${cls}">${escapeHtml(raw)}</span>`,
    });
    i += labelEnd;
  }
  return ranges;
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {HTMLElement} wrap
 * @param {() => Array<{ name: string, trackId: string }>} getMotions
 * @param {() => void} onChange
 */
function wireTrackMentions(textarea, wrap, getMotions, onChange) {
  const menu = document.createElement('div');
  menu.className = 'sb-ai-mention-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');
  wrap.appendChild(menu);

  /** @type {Array<{ name: string, trackId: string }>} */
  let items = [];
  let activeIdx = 0;

  function getAtQuery() {
    const pos = textarea.selectionStart ?? 0;
    const head = textarea.value.slice(0, pos);
    const m = head.match(/@([^\s@]*)$/u);
    if (!m) return null;
    return { start: pos - m[0].length, query: m[1] || '', pos };
  }

  /** @param {boolean} [resetActive] */
  function refreshMenu(resetActive = false) {
    const q = getAtQuery();
    if (!q) {
      menu.hidden = true;
      return;
    }
    const all = getMotions();
    const ql = q.query.toLowerCase();
    items = all.filter((m) => !ql || String(m.name).toLowerCase().includes(ql));
    if (!items.length) {
      menu.hidden = true;
      return;
    }
    if (resetActive) activeIdx = 0;
    else activeIdx = Math.min(Math.max(0, activeIdx), items.length - 1);
    menu.hidden = false;
    menu.innerHTML = items.map((m, i) => `
      <button type="button" class="sb-ai-mention-item${i === activeIdx ? ' is-active' : ''}" data-i="${i}" role="option">
        <span class="sb-ai-mention-label">@${escapeHtml(m.name)}</span>
        <span class="sb-ai-mention-meta">캐릭터 트랙</span>
      </button>`).join('');
    const active = menu.querySelector('.sb-ai-mention-item.is-active');
    active?.scrollIntoView?.({ block: 'nearest' });
  }

  function insertMention(item) {
    const q = getAtQuery();
    if (!q) return;
    const before = textarea.value.slice(0, q.start);
    const after = textarea.value.slice(q.pos);
    const insert = `@${item.name}`;
    textarea.value = `${before}${insert}${after.startsWith(' ') ? after : ` ${after}`}`;
    const caret = before.length + insert.length + 1;
    textarea.setSelectionRange(caret, caret);
    menu.hidden = true;
    onChange();
    textarea.focus();
  }

  textarea.addEventListener('keydown', (e) => {
    if (menu.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(items.length - 1, activeIdx + 1);
      refreshMenu(false);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(0, activeIdx - 1);
      refreshMenu(false);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (items[activeIdx]) {
        e.preventDefault();
        insertMention(items[activeIdx]);
      }
    } else if (e.key === 'Escape') {
      menu.hidden = true;
    }
  });
  textarea.addEventListener('input', () => refreshMenu(true));
  textarea.addEventListener('click', () => refreshMenu(true));

  menu.addEventListener('mousedown', (e) => {
    const btn = e.target.closest?.('.sb-ai-mention-item');
    if (!btn) return;
    e.preventDefault();
    const i = Number(btn.getAttribute('data-i'));
    if (items[i]) insertMention(items[i]);
  });

  document.addEventListener('mousedown', (e) => {
    if (!wrap.contains(/** @type {Node} */ (e.target))) menu.hidden = true;
  });
}

/** @param {HTMLElement} anchor */
function toggleFxFollowHelp(anchor) {
  let pop = document.querySelector('[data-role="fx-follow-help-pop"]');
  if (!pop) {
    pop = document.createElement('div');
    pop.className = 'sb-seg-ai-help-pop';
    pop.dataset.role = 'fx-follow-help-pop';
    pop.hidden = true;
    document.body.appendChild(pop);
  }
  if (!pop.hidden) {
    pop.hidden = true;
    anchor.classList.remove('is-on');
    return;
  }
  pop.innerHTML = `
    <div class="sb-seg-ai-help-head">
      <span class="sb-seg-ai-help-title">AI 조명 시퀀스 · Fixture 조준</span>
      <button type="button" class="sb-seg-ai-help-close" data-act="close" aria-label="닫기">×</button>
    </div>
    <p class="sb-seg-ai-help-lead">선택한 Fixture에 <strong>조준(pan/tilt)·dim 키</strong>만 만듭니다. 캐릭터 <strong>AI 패턴</strong>(이동 시퀀스)과 다릅니다.</p>
    <ul class="sb-seg-ai-help-list">
      <li>캐릭터에 <strong>모션 키</strong>가 있어야 합니다 — 조준은 캐릭터 위치에서 계산됩니다</li>
      <li>Fixture 선택 → <code>@캐릭터이름</code> (↑↓로 목록 이동 · Enter 확정)</li>
      <li><strong>따라가기</strong>: <code>@주인공 따라가줘</code> · <code>시작부터 퇴장까지 따라가</code></li>
      <li><strong>구간</strong>: <code>5초부터 30초까지 따라가</code> (여러 구간 가능)</li>
      <li><strong>이어 붙이기</strong>: <code>…따라가다가 40초까지 머무르다가 사라져</code> — 머물기는 여러 번 쓸 수 있고, 끝에 <code>사라져</code>로 소등합니다</li>
      <li>적용 문장은 <strong>트랙에 저장</strong>됩니다. 나중에 트랙을 고르면 이력이 다시 열리고, 고친 뒤 <strong>수정 후 다시 적용</strong>하면 됩니다</li>
      <li>AI 트랙은 <strong>잠겨 있습니다</strong>. 키를 손으로 고치려면 <strong>수동으로 변경</strong>을 누르세요 (AI 문장 연결이 끊어집니다)</li>
    </ul>
    <p class="sb-seg-ai-help-note">「몇 초에 어디로 이동」처럼 <strong>좌표를 직접 지정하는 문장은 아직 지원하지 않습니다</strong> — 조준 대상은 항상 <code>@캐릭터</code>입니다. Zoom·Focus·Color는 <strong>선택 속성 → 전 키</strong>로 맞추세요.</p>`;
  pop.querySelector('[data-act="close"]')?.addEventListener('click', () => {
    pop.hidden = true;
    anchor.classList.remove('is-on');
  });
  pop.hidden = false;
  anchor.classList.add('is-on');
  const r = anchor.getBoundingClientRect();
  const w = Math.min(400, window.innerWidth - 16);
  pop.style.width = `${w}px`;
  pop.style.top = `${r.bottom + 6}px`;
  pop.style.left = `${Math.min(r.left, window.innerWidth - w - 8)}px`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
