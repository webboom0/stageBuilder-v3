import {
  bakeFixtureLinkDraft,
  buildFixtureLinkDraft,
} from '../domain/lighting/fixtureLinkDraft.js';
import { runLightingEdit } from '../domain/lighting/lightingHistory.js';

/**
 * Fixture pane — 트랙 연결: 선택한 Fixture를 캐릭터 트랙에 묶어 조준(pan/tilt) 키를 만든다.
 * @param {HTMLElement} host
 * @param {{
 *   engine: import('../domain/timeline/TimelineEngine.js').TimelineEngine,
 *   fixtures: import('../domain/lighting/FixtureDirector.js').FixtureDirector,
 *   historyCtx: ReturnType<import('../domain/lighting/lightingHistory.js').createLightingHistoryContext>,
 *   getSelectedFids: () => Iterable<number>,
 *   getMotions: () => Array<{ id: string, name: string, trackId: string, object: import('three').Object3D }>,
 *   onChange?: () => void,
 *   onUnlink?: (linkTrackId: string) => string | null,
 * }} opts
 */
export function mountFixtureLinkPanel(host, opts) {
  if (!(host instanceof HTMLElement)) return { sync() {} };

  host.innerHTML = `
    <div class="sb-seg-ai sb-fx-link">
      <div class="sb-seg-ai-head">
        <span class="sb-seg-ai-title"><i class="fas fa-link" aria-hidden="true"></i> 트랙 연결</span>
        <button type="button" class="sb-seg-ai-icon-btn" data-act="fx-link-help" title="사용법" aria-label="사용법">?</button>
        <span class="sb-seg-ai-hint">캐릭터 조준 · 퇴장 소등</span>
      </div>
      <div class="sb-fx-link-picker">
        <span class="sb-fx-link-picker-label">캐릭터</span>
        <button type="button" class="sb-fx-link-trigger" data-role="fx-link-trigger"
          aria-haspopup="listbox" aria-expanded="false" title="캐릭터 검색">
          <span class="sb-fx-link-trigger-text" data-role="fx-link-trigger-text">캐릭터 검색…</span>
          <i class="fas fa-search" aria-hidden="true"></i>
        </button>
      </div>
      <div class="sb-seg-ai-actions">
        <button type="button" class="sb-chip acc" data-role="fx-link-apply">연결하고 키 만들기</button>
        <button type="button" class="sb-chip" data-role="fx-link-unlink"
          title="캐릭터와의 연결을 끊고 수동 트랙으로 바꿉니다 (키는 그대로 남습니다)" hidden>연결 끊기</button>
      </div>
      <p class="sb-light-hint" data-role="fx-link-status"></p>
    </div>
  `;

  const trigger = /** @type {HTMLButtonElement} */ (host.querySelector('[data-role="fx-link-trigger"]'));
  const triggerText = /** @type {HTMLElement} */ (host.querySelector('[data-role="fx-link-trigger-text"]'));
  const status = /** @type {HTMLElement} */ (host.querySelector('[data-role="fx-link-status"]'));
  const applyBtn = /** @type {HTMLButtonElement} */ (host.querySelector('[data-role="fx-link-apply"]'));
  const unlinkBtn = /** @type {HTMLButtonElement} */ (host.querySelector('[data-role="fx-link-unlink"]'));

  /** Keep the user's pick while they look around before pressing 연결 */
  let lastSelKey = '';
  let userPicked = false;
  /** Currently chosen motion track id (empty = none) */
  let pickedId = '';
  /** sync() also runs on every playhead tick — rebuild DOM only when the inputs changed */
  let lastTriggerKey = '';
  let wasStale = false;

  function motions() {
    return opts.getMotions?.() || [];
  }

  /** @param {'' | 'err' | 'warn'} [tone] */
  function setStatus(msg, tone = '') {
    if (!status) return;
    status.textContent = msg || '';
    status.classList.toggle('is-err', tone === 'err');
    status.classList.toggle('is-warn', tone === 'warn');
  }

  function motionById(id) {
    return motions().find((m) => m.trackId === id) || null;
  }

  function setPicked(id, fromUser = false) {
    const next = motionById(id) ? id : '';
    pickedId = next;
    if (fromUser) userPicked = true;
    renderTrigger();
  }

  function renderTrigger() {
    const list = motions();
    const m = motionById(pickedId);
    const key = `${list.map((x) => `${x.trackId}\u0000${x.name}`).join('|')}#${pickedId}`;
    if (key === lastTriggerKey) return;
    lastTriggerKey = key;

    if (!trigger || !triggerText) return;
    trigger.disabled = list.length === 0;
    trigger.classList.toggle('is-empty', !m);
    triggerText.textContent = m
      ? m.name
      : (list.length ? '캐릭터 검색…' : '캐릭터 없음');
  }

  /** 선택 fixture 중 연결된 트랙 목록 */
  function selectedLinkTracks() {
    /** @type {import('../domain/timeline/Track.js').Track[]} */
    const list = [];
    for (const fid of opts.getSelectedFids?.() || []) {
      const t = opts.fixtures.getLinkTrackForFid?.(fid);
      if (t) list.push(t);
    }
    return list;
  }

  function staleLinkCount() {
    return selectedLinkTracks().filter((t) => t.linkStale).length;
  }

  /** @returns {{ trackId: string | null, mixed: boolean, count: number }} */
  function linkedMotionFromSelection() {
    const list = motions();
    const found = selectedLinkTracks()
      .map((t) => t.linkMotionTrackId || legacyMotionTrackId(t, list))
      .filter(Boolean);
    if (!found.length) return { trackId: null, mixed: false, count: 0 };
    const first = found[0];
    return { trackId: first, mixed: found.some((id) => id !== first), count: found.length };
  }

  function updateApplyBtn(hasLink) {
    if (!applyBtn) return;
    const stale = staleLinkCount();
    applyBtn.classList.toggle('is-stale', stale > 0);
    applyBtn.disabled = !pickedId;
    if (stale > 0) {
      applyBtn.textContent = '연결 갱신';
      applyBtn.title = '연결된 캐릭터가 바뀌었습니다 · 조명 키를 다시 계산합니다';
      return;
    }
    applyBtn.textContent = hasLink ? '연결 갱신' : '연결하고 키 만들기';
    applyBtn.title = hasLink
      ? '선택 Fixture의 조준 키를 다시 만듭니다 (기존 키 교체)'
      : '선택한 Fixture를 이 캐릭터에 연결하고 조준 키를 만듭니다';
  }

  function updateUnlinkBtn() {
    if (!unlinkBtn) return;
    const n = selectedLinkTracks().length;
    unlinkBtn.hidden = n === 0;
    unlinkBtn.textContent = n > 1 ? `연결 끊기 (${n})` : '연결 끊기';
  }

  /** What the pick will produce, on the status line so it costs no extra row. */
  function showPlanForPick() {
    if (!pickedId) {
      setStatus('');
      return;
    }
    const draft = buildFixtureLinkDraft(pickedId, {
      engine: opts.engine,
      motions: motions(),
    });
    setStatus(draft.ok ? draft.summary : draft.error, draft.ok ? '' : 'err');
  }

  function syncFromSelection() {
    const fids = [...(opts.getSelectedFids?.() || [])];
    const selKey = fids.join(',');
    const selectionChanged = selKey !== lastSelKey;
    const info = linkedMotionFromSelection();
    const stale = staleLinkCount();

    if (selectionChanged) {
      lastSelKey = selKey;
      userPicked = false;
    }
    // Only overwrite the pick when the user has not chosen something yet
    setPicked(userPicked ? pickedId : info.trackId || '');

    updateApplyBtn(info.count > 0);
    updateUnlinkBtn();
    const staleTurnedOn = stale > 0 && !wasStale;
    wasStale = stale > 0;

    if (stale > 0) {
      if (staleTurnedOn || selectionChanged) {
        setStatus(
          `연결된 캐릭터가 바뀌었습니다 · 「연결 갱신」을 눌러 조명 키를 다시 계산하세요. (${stale}개)`,
          'warn',
        );
      }
    } else if (selectionChanged) {
      if (info.mixed) {
        setStatus('선택 Fixture의 연결 대상이 서로 다릅니다 · 첫 트랙 기준으로 표시했습니다.');
      } else if (info.count > 0) {
        setStatus('이 Fixture는 위 캐릭터에 연결되어 있습니다.');
      } else if (!motions().length) {
        setStatus('캐릭터 트랙이 없습니다. 캐릭터를 먼저 무대에 올리세요.', 'err');
      } else {
        setStatus('');
      }
    }
  }

  function applyLink() {
    const motionTrackId = pickedId;
    const draft = buildFixtureLinkDraft(motionTrackId, {
      engine: opts.engine,
      motions: motions(),
    });
    if (!draft.ok) {
      setStatus(draft.error, 'err');
      return;
    }

    const fids = [...(opts.getSelectedFids?.() || [])];
    if (!fids.length) {
      setStatus('Fixture를 선택한 뒤 연결하세요.', 'err');
      return;
    }

    const hadLink = linkedMotionFromSelection().count > 0;
    runLightingEdit(opts.historyCtx, 'Fixture 트랙 연결', () => {
      const result = bakeFixtureLinkDraft({
        engine: opts.engine,
        fixtures: opts.fixtures,
        draft,
        fids,
      });
      if (!result.ok) {
        setStatus(result.error, 'err');
        return;
      }
      lastSelKey = fids.join(',');
      userPicked = false;
      wasStale = false;
      updateApplyBtn(true);
      updateUnlinkBtn();
      setStatus(
        `${hadLink ? '연결 갱신됨' : '연결됨'} · 트랙 ${result.trackCount} · 키 ${result.keyCount} · ${draft.summary}`,
      );
      opts.onChange?.();
    });
  }

  trigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (trigger.disabled) return;
    if (document.querySelector('[data-role="fx-link-search-pop"]')) {
      closeMotionSearchPop();
      return;
    }
    openMotionSearchPop(trigger, {
      motions: motions(),
      selectedId: pickedId,
      onPick: (trackId) => {
        setPicked(trackId, true);
        updateApplyBtn(linkedMotionFromSelection().count > 0);
        showPlanForPick();
      },
    });
  });
  applyBtn?.addEventListener('click', applyLink);
  unlinkBtn?.addEventListener('click', () => {
    const tracks = selectedLinkTracks();
    if (!tracks.length) {
      setStatus('연결된 Fixture를 선택하세요.', 'err');
      return;
    }
    let n = 0;
    for (const t of tracks) {
      if (opts.onUnlink?.(t.id)) n += 1;
    }
    if (!n) return;
    lastSelKey = '';
    userPicked = false;
    setStatus(`연결 끊김 · ${n}개 · 이제 타임라인에서 키를 직접 편집할 수 있습니다.`);
    updateUnlinkBtn();
  });
  host.querySelector('[data-act="fx-link-help"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFxLinkHelp(/** @type {HTMLElement} */ (e.currentTarget));
  });

  syncFromSelection();

  return { sync: syncFromSelection };
}

/**
 * Search popup — type to filter character tracks, click or Enter to pick.
 * @param {HTMLElement} anchor
 * @param {{
 *   motions: Array<{ name: string, trackId: string }>,
 *   selectedId?: string,
 *   onPick: (trackId: string) => void,
 * }} opts
 */
function openMotionSearchPop(anchor, opts) {
  closeFxLinkHelp();
  closeMotionSearchPop();
  const pop = document.createElement('div');
  pop.className = 'sb-fx-link-search-pop';
  pop.dataset.role = 'fx-link-search-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', '캐릭터 검색');
  pop.innerHTML = `
    <div class="sb-fx-link-search-head">
      <span class="sb-fx-link-search-title">캐릭터 검색</span>
      <button type="button" class="sb-seg-ai-help-close" data-act="close" aria-label="닫기">×</button>
    </div>
    <input type="search" class="sb-fx-link-search-input" data-role="q"
      placeholder="이름 입력…" autocomplete="off" spellcheck="false">
    <div class="sb-fx-link-search-list" data-role="list" role="listbox"></div>
  `;
  document.body.appendChild(pop);
  anchor.setAttribute('aria-expanded', 'true');
  anchor.classList.add('is-on');

  const input = /** @type {HTMLInputElement} */ (pop.querySelector('[data-role="q"]'));
  const listEl = /** @type {HTMLElement} */ (pop.querySelector('[data-role="list"]'));
  const all = opts.motions || [];
  /** @type {Array<{ name: string, trackId: string }>} */
  let shown = all;
  let active = Math.max(0, shown.findIndex((m) => m.trackId === opts.selectedId));

  function paint() {
    if (!shown.length) {
      listEl.innerHTML = '<p class="sb-fx-link-search-empty">일치하는 캐릭터가 없습니다</p>';
      return;
    }
    listEl.innerHTML = shown.map((m, i) => `
      <button type="button" class="sb-fx-link-search-item${i === active ? ' is-active' : ''}${
        m.trackId === opts.selectedId ? ' is-current' : ''
      }" data-i="${i}" role="option" aria-selected="${i === active ? 'true' : 'false'}">
        <span class="sb-fx-link-search-name">${escapeHtml(m.name)}</span>
      </button>`).join('');
    listEl.querySelector('.sb-fx-link-search-item.is-active')
      ?.scrollIntoView?.({ block: 'nearest' });
  }

  function filter(q) {
    const prevId = shown[active]?.trackId;
    const nq = String(q || '').trim().toLowerCase();
    shown = nq
      ? all.filter((m) => String(m.name).toLowerCase().includes(nq))
      : all;
    const keep = shown.findIndex((m) => m.trackId === prevId);
    active = shown.length ? Math.max(0, keep) : 0;
    paint();
  }

  function pick(i) {
    const m = shown[i];
    if (!m) return;
    closeMotionSearchPop();
    opts.onPick(m.trackId);
  }

  function place() {
    const r = anchor.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 16);
    pop.style.width = `${w}px`;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${r.bottom + 4}px`;
    const box = pop.getBoundingClientRect();
    if (box.bottom > window.innerHeight - 8) {
      pop.style.top = `${Math.max(8, r.top - box.height - 4)}px`;
    }
  }

  pop.querySelector('[data-act="close"]')?.addEventListener('click', closeMotionSearchPop);
  input.addEventListener('input', () => filter(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!shown.length) return;
      active = (active + 1) % shown.length;
      paint();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown.length) return;
      active = (active - 1 + shown.length) % shown.length;
      paint();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMotionSearchPop();
    }
  });
  listEl.addEventListener('mousedown', (e) => {
    const btn = e.target.closest?.('.sb-fx-link-search-item');
    if (!btn) return;
    e.preventDefault();
    pick(Number(btn.getAttribute('data-i')));
  });
  listEl.addEventListener('mouseover', (e) => {
    const btn = e.target.closest?.('.sb-fx-link-search-item');
    if (!btn) return;
    const i = Number(btn.getAttribute('data-i'));
    if (i === active || !Number.isFinite(i)) return;
    active = i;
    listEl.querySelector('.is-active')?.classList.remove('is-active');
    btn.classList.add('is-active');
  });

  const onDoc = (e) => {
    if (pop.contains(/** @type {Node} */ (e.target)) || anchor.contains(/** @type {Node} */ (e.target))) return;
    closeMotionSearchPop();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') closeMotionSearchPop();
  };
  setTimeout(() => {
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
  }, 0);
  pop._teardown = () => {
    document.removeEventListener('mousedown', onDoc);
    document.removeEventListener('keydown', onKey);
    anchor.setAttribute('aria-expanded', 'false');
    anchor.classList.remove('is-on');
  };

  paint();
  place();
  input.focus();
}

function closeMotionSearchPop() {
  const pop = document.querySelector('[data-role="fx-link-search-pop"]');
  if (!pop) return;
  pop._teardown?.();
  pop.remove();
}

function closeFxLinkHelp() {
  const pop = document.querySelector('[data-role="fx-link-help-pop"]');
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  document.querySelector('[data-act="fx-link-help"]')?.classList.remove('is-on');
}

/** @param {HTMLElement} anchor */
function toggleFxLinkHelp(anchor) {
  let pop = document.querySelector('[data-role="fx-link-help-pop"]');
  if (!pop) {
    pop = document.createElement('div');
    pop.className = 'sb-seg-ai-help-pop';
    pop.dataset.role = 'fx-link-help-pop';
    pop.hidden = true;
    document.body.appendChild(pop);
  }
  if (!pop.hidden) {
    pop.hidden = true;
    anchor.classList.remove('is-on');
    return;
  }
  closeMotionSearchPop();
  pop.innerHTML = `
    <div class="sb-seg-ai-help-head">
      <span class="sb-seg-ai-help-title">트랙 연결 · Fixture를 캐릭터에 묶기</span>
      <button type="button" class="sb-seg-ai-help-close" data-act="close" aria-label="닫기">×</button>
    </div>
    <p class="sb-seg-ai-help-lead">Fixture를 고르고 <strong>캐릭터 검색</strong>에서 트랙을 고른 뒤 <strong>연결하고 키 만들기</strong>를 누르면, 그 캐릭터를 조준하는 <strong>pan/tilt·dim 키</strong>가 만들어집니다.</p>
    <ul class="sb-seg-ai-help-list">
      <li><strong>캐릭터 검색</strong> 버튼을 누르면 팝업이 열립니다 — 이름을 치면 목록이 걸러지고, 클릭 또는 Enter로 고릅니다</li>
      <li>캐릭터에 <strong>모션 키</strong>가 있어야 합니다 — 조준은 캐릭터 위치에서 계산됩니다</li>
      <li>조명은 캐릭터가 <strong>등장할 때부터 퇴장할 때까지</strong> 따라갑니다 — 구간을 따로 적을 필요가 없습니다</li>
      <li>캐릭터가 <strong>퇴장으로 끝나면</strong> 조명도 퇴장 구간 동안 따라가며 <strong>서서히 꺼집니다</strong></li>
      <li>연결된 트랙은 헤드에 <strong><i class="fas fa-link" aria-hidden="true"></i> 링크 아이콘</strong>이 붙고 <strong>잠깁니다</strong> — 키가 캐릭터에서 계산된 값이라 직접 고칠 수 없습니다</li>
      <li><strong>캐릭터 동선을 고치면</strong> 아이콘이 <strong>주황색</strong>으로 바뀝니다 → <strong>연결 갱신</strong>을 눌러 조명 키를 다시 계산하세요</li>
      <li>키를 손으로 고치려면 <strong>연결 끊기</strong> — 키는 그대로 남고 트랙만 수동으로 바뀝니다</li>
    </ul>
    <p class="sb-seg-ai-help-note">Fixture를 여러 개 골라 한 번에 같은 캐릭터로 연결할 수 있습니다. Dim·Zoom·Focus·Color는 <strong>선택속성 모든키 적용</strong>으로 맞추세요.</p>`;
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

/**
 * Saves made before the picker stored the target as an `@이름` sentence.
 * Recover it once so old shows still show what they are linked to.
 * @param {import('../domain/timeline/Track.js').Track} track
 * @param {Array<{ name: string, trackId: string }>} motions
 */
function legacyMotionTrackId(track, motions) {
  const prompt = track?.fixtureFollowPrompt;
  if (!prompt) return null;
  const byLen = [...motions].sort((a, b) => String(b.name).length - String(a.name).length);
  const hit = byLen.find((m) => m.name && String(prompt).includes(`@${m.name}`));
  return hit?.trackId || null;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}
