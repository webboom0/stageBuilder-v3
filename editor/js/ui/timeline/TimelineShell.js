import { DURATION_MODE } from '../../domain/timeline/types.js';
import { keyframeTimeEps, snapKeyframeTimeSec } from '../../domain/timeline/KeyframeStore.js';
import {
  audioTrackLabelHtml,
  audioTrackRowHtml,
  audioVolumeIconClass,
  bindAudioClipInteractions,
  scheduleAudioWaveforms,
  syncAudioClipDom,
  syncAudioClipSelection,
} from './audioClipView.js';

/**
 * Phase 2–3 TimelineShell — ruler, playhead, tracks, keys (no clip resize).
 * Tracks come from Assets (+ Character / Stage), not from the toolbar.
 * @param {HTMLElement} host
 * @param {{
 *   engine: import('../../domain/timeline/TimelineEngine.js').TimelineEngine,
 *   getMotionKeyValue?: (trackId: string) => any,
 *   getLightKeyValue?: (trackId: string) => any,
 *   audio?: import('../../domain/audio/AudioDirector.js').AudioDirector,
 *   onTrackSelect?: (trackId: string, opt?: { selectKey?: boolean }) => void,
 *   onTrackRemove?: (trackId: string) => boolean | void,
 * }} ctx
 */
export function mountTimelineShell(host, ctx) {
  const {
    engine,
    getMotionKeyValue,
    getLightKeyValue,
    audio,
    onTrackSelect,
    onTrackRemove,
  } = ctx;

  host.classList.add('sb-tl');
  host.tabIndex = 0;
  host.setAttribute('aria-label', '타임라인');
  host.innerHTML = `
    <div class="sb-tl-toolbar">
      <button type="button" class="sb-tl-btn" data-act="to-start" title="처음으로">⏮</button>
      <button type="button" class="sb-tl-btn" data-act="play" title="재생/일시정지">▶</button>
      <button type="button" class="sb-tl-btn" data-act="to-end" title="끝으로">⏭</button>
      <span class="sb-tl-time" data-role="time">0.00 / ${engine.durationSec.toFixed(0)}s</span>
      <label class="sb-tl-field" title="쇼 총 길이(초). 키 시각은 유지되고, 길이를 줄이면 범위 밖 키만 정리됩니다.">길이
        <input type="number" data-role="duration" min="1" step="1" value="${engine.durationSec}" />
      </label>
      <button type="button" class="sb-tl-btn" data-act="zoom-out" title="줌 아웃">−</button>
      <button type="button" class="sb-tl-btn" data-act="zoom-in" title="줌 인">+</button>
      <button type="button" class="sb-tl-btn" data-act="add-key" title="플레이헤드에 키 추가 (K)">+ Key</button>
      <button type="button" class="sb-tl-btn" data-act="del-key" title="선택 키/클립 삭제 (D / Del)">Del</button>
      <button type="button" class="sb-tl-btn" data-act="undo" title="실행 취소">Undo</button>
      <button type="button" class="sb-tl-btn" data-act="redo" title="다시 실행">Redo</button>
      <span class="sb-tl-jumps" data-role="jumps" role="toolbar" aria-label="타임라인 섹션">
        <button type="button" class="sb-tl-jump is-on" data-section="all">All</button>
        <button type="button" class="sb-tl-jump" data-section="motion">Characters</button>
        <button type="button" class="sb-tl-jump" data-section="stage">Stage</button>
        <button type="button" class="sb-tl-jump" data-section="light">Light</button>
        <button type="button" class="sb-tl-jump" data-section="audio">Audio</button>
      </span>
      <button type="button" class="sb-tl-btn sb-tl-btn-help" data-act="shortcuts" title="타임라인 단축키">?</button>
    </div>
    <div class="sb-tl-body">
      <div class="sb-tl-labels" data-role="labels"></div>
      <div class="sb-tl-viewport" data-role="viewport">
        <div class="sb-tl-canvas" data-role="canvas">
          <div class="sb-tl-ruler" data-role="ruler"></div>
          <div class="sb-tl-tracks" data-role="tracks"></div>
          <div class="sb-tl-playhead" data-role="playhead">
            <div class="sb-tl-playhead-head" data-role="playhead-head" title="드래그하여 스크럽"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const wrapper = host.closest('.timelineWrapper') || host.parentElement;
  const detachHeight = attachTimelineHeightResize(wrapper);

  /** @type {'all' | 'motion' | 'stage' | 'light' | 'audio'} */
  let sectionFilter = 'all';

  const SECTION_META = [
    { id: 'motion', label: 'Characters' },
    { id: 'stage', label: 'Stage' },
    { id: 'light', label: 'Light' },
    { id: 'audio', label: 'Audio' },
  ];

  /** @type {Record<string, boolean>} UI-only section fold (not filter). */
  const sectionCollapsed = Object.fromEntries(SECTION_META.map((s) => [s.id, false]));

  const el = {
    time: host.querySelector('[data-role="time"]'),
    duration: host.querySelector('[data-role="duration"]'),
    labels: host.querySelector('[data-role="labels"]'),
    viewport: host.querySelector('[data-role="viewport"]'),
    canvas: host.querySelector('[data-role="canvas"]'),
    ruler: host.querySelector('[data-role="ruler"]'),
    tracks: host.querySelector('[data-role="tracks"]'),
    playhead: host.querySelector('[data-role="playhead"]'),
    playBtn: host.querySelector('[data-act="play"]'),
    jumps: host.querySelector('[data-role="jumps"]'),
  };

  /** Prevent scroll event feedback loops while locking labels ↔ viewport */
  let syncingScroll = false;
  /** @type {string | null} */
  let audioDragClipId = null;

  function refreshAudioSelection() {
    if (!audio) return;
    syncAudioClipSelection(el.viewport, audio.selectedClipId);
    updateAudioBar();
  }

  function syncPlayheadUi() {
    el.time.textContent = `${engine.playheadSec.toFixed(2)} / ${engine.durationSec.toFixed(0)}s`;
    el.playhead.style.left = `${secToX(engine.playheadSec)}px`;
    el.playBtn.textContent = engine.playing ? '⏸' : '▶';
  }

  function timelineWidthPx() {
    return Math.max(engine.durationSec * engine.pxPerSec, el.viewport.clientWidth || 400);
  }

  function secToX(sec) {
    return sec * engine.pxPerSec;
  }

  function xToSec(x) {
    return clamp(x / engine.pxPerSec, 0, engine.durationSec);
  }

  function render() {
    // innerHTML rebuild resets labels scrollTop — keep both columns locked
    const keepY = el.viewport.scrollTop || el.labels.scrollTop;
    const keepX = el.viewport.scrollLeft;

    const w = timelineWidthPx();
    el.canvas.style.width = `${w}px`;
    el.time.textContent = `${engine.playheadSec.toFixed(2)} / ${engine.durationSec.toFixed(0)}s`;
    el.duration.value = String(Math.round(engine.durationSec));
    el.playBtn.textContent = engine.playing ? '⏸' : '▶';
    el.playhead.style.left = `${secToX(engine.playheadSec)}px`;

    // ruler ticks
    const step = niceStep(engine.pxPerSec);
    let ticks = '';
    for (let t = 0; t <= engine.durationSec + 1e-6; t += step) {
      ticks += `<span class="sb-tl-tick" style="left:${secToX(t)}px"><i>${formatTick(t)}</i></span>`;
    }
    el.ruler.innerHTML = ticks;

    // labels + tracks by section (Motion / Light / Audio) — folders collapse
    const trackList = engine.listTracks();
    let labelsHtml = '';
    let tracksHtml = '';

    for (const sec of SECTION_META) {
      if (sectionFilter !== 'all' && sectionFilter !== sec.id) continue;
      const folded = sectionCollapsed[sec.id] === true;
      const rows = trackList.filter((tr) => (tr.section || 'motion') === sec.id);
      const secLabelClass = sec.id === 'audio' ? ' sb-tl-sec-label-audio' : '';
      const secFoldClass = folded ? ' is-collapsed' : '';
      labelsHtml += `<div class="sb-tl-sec-label${secLabelClass}${secFoldClass}" data-section="${sec.id}">
        <button type="button" class="sb-tl-sec-toggle" data-section="${sec.id}" title="접기/펼치기">${folded ? '▸' : '▾'}</button>
        <span class="sb-tl-sec-label-text">${escapeHtml(sec.label)}</span>
      </div>`;
      if (sec.id === 'audio') {
        if (!folded) {
          tracksHtml += audioSectionToolbarHtml(audio);
        } else {
          tracksHtml += `<div class="sb-tl-sec-lane" data-section="${sec.id}"></div>`;
        }
      } else {
        tracksHtml += `<div class="sb-tl-sec-lane" data-section="${sec.id}"></div>`;
      }

      if (folded) continue;

      if (!rows.length && sec.id !== 'audio') {
        continue;
      }
      if (!rows.length && sec.id === 'audio') {
        labelsHtml += `<div class="sb-tl-label sb-tl-label-stub" data-section="audio">—</div>`;
        tracksHtml += `<div class="sb-tl-track sb-tl-track-stub sb-tl-track-audio-empty" data-section="audio"><span class="sb-tl-stub">+ 트랙 또는 Assets Audio +</span></div>`;
        continue;
      }

      if (!rows.length && sec.stub) {
        labelsHtml += `<div class="sb-tl-label sb-tl-label-stub" data-section="${sec.id}">—</div>`;
        tracksHtml += `<div class="sb-tl-track sb-tl-track-stub" data-section="${sec.id}"><span class="sb-tl-stub">${escapeHtml(sec.stub)}</span></div>`;
        continue;
      }

      const { folders, loose } = partitionByFolder(rows, engine);
      for (const folder of folders) {
        const collapsed = !!folder.meta.collapsed;
        labelsHtml += `<div class="sb-tl-folder-label ${collapsed ? 'is-collapsed' : ''}" data-folder="${folder.id}">
          <button type="button" class="sb-tl-folder-toggle" data-folder="${folder.id}" title="접기/펼치기">${collapsed ? '▸' : '▾'}</button>
          ${escapeHtml(folder.meta.name)}
        </div>`;
        tracksHtml += `<div class="sb-tl-folder-lane" data-folder="${folder.id}"></div>`;
        if (collapsed) continue;
        for (const tr of folder.tracks) {
          labelsHtml += trackLabelHtml(tr, engine, true, audio);
          tracksHtml += trackRowHtml(tr, engine, secToX, audio);
        }
      }
      for (const tr of loose) {
        labelsHtml += trackLabelHtml(tr, engine, false, audio);
        tracksHtml += trackRowHtml(tr, engine, secToX, audio);
      }
    }

    el.labels.innerHTML = labelsHtml;
    el.tracks.innerHTML = tracksHtml;

    bindAudioClipInteractions(el.viewport, {
      engine,
      audio: audio || null,
      secToX,
      onLiveUpdate: (clipId) => syncAudioClipDom(el.viewport, clipId, engine, secToX),
      onDragStart: (clipId) => {
        audioDragClipId = clipId;
      },
      onDragEnd: () => {
        audioDragClipId = null;
      },
      onCommit: () => render(),
      onSelect: () => refreshAudioSelection(),
      onContextMenu: (clientX, clientY, clipId, playheadSec) => {
        if (!audio) return;
        openCtx(clientX, clientY, [
          {
            label: '플레이헤드에서 분할',
            shortcut: 'S',
            action: () => {
              engine.setPlayhead(playheadSec);
              audio.splitClipAt(clipId, playheadSec);
            },
          },
          { sep: true },
          {
            label: '클립 삭제',
            shortcut: 'Del',
            action: () => audio.removeClip(clipId),
          },
        ]);
      },
    });
    scheduleAudioWaveforms(el.tracks, engine, secToX);
    updateAudioBar();

    syncingScroll = true;
    el.viewport.scrollLeft = keepX;
    el.viewport.scrollTop = keepY;
    el.labels.scrollTop = keepY;
    syncingScroll = false;
  }

  // toolbar actions
  host.querySelector('[data-act="to-start"]').addEventListener('click', () => {
    engine.pause();
    engine.setPlayhead(0);
  });
  host.querySelector('[data-act="to-end"]').addEventListener('click', () => {
    engine.pause();
    engine.setPlayhead(engine.durationSec);
  });
  el.playBtn.addEventListener('click', () => {
    engine.togglePlay();
  });
  host.querySelector('[data-act="zoom-in"]').addEventListener('click', () => {
    engine.setZoom(engine.pxPerSec * 1.25);
  });
  host.querySelector('[data-act="zoom-out"]').addEventListener('click', () => {
    engine.setZoom(engine.pxPerSec / 1.25);
  });
  host.querySelector('[data-act="undo"]').addEventListener('click', () => engine.undo());
  host.querySelector('[data-act="redo"]').addEventListener('click', () => engine.redo());
  host.querySelector('[data-act="shortcuts"]').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleShortcutsPopup();
  });

  el.jumps?.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.sb-tl-jump');
    if (!btn) return;
    sectionFilter = /** @type {typeof sectionFilter} */ (btn.dataset.section || 'all');
    el.jumps.querySelectorAll('.sb-tl-jump').forEach((b) => {
      b.classList.toggle('is-on', b === btn);
    });
    host.classList.toggle('tl-filtered', sectionFilter !== 'all');
    render();
  });

  host.querySelector('[data-act="add-key"]').addEventListener('click', () => {
    addKeyAtPlayhead();
  });

  host.querySelector('[data-act="del-key"]').addEventListener('click', () => {
    deleteSelectedKey();
  });

  host.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-act="audio-split"]')) {
      e.preventDefault();
      e.stopPropagation();
      if (audio?.splitSelectedAtPlayhead()) {
        render();
      }
      return;
    }
    if (e.target.closest?.('[data-act="audio-delete"]')) {
      e.preventDefault();
      e.stopPropagation();
      if (audio?.selectedClipId && audio.removeClip(audio.selectedClipId)) {
        render();
      }
    }
  }, true);

  host.addEventListener('pointerdown', (e) => {
    if (e.target.closest?.('[data-role="audio-bar"]')) {
      e.stopPropagation();
    }
  }, true);

  host.addEventListener('input', (e) => {
    const master = e.target.closest?.('[data-role="audio-master"]');
    if (master && audio) {
      audio.setMasterVolume(Number(master.value) / 100);
      audio.apply(engine.playheadSec);
      syncMasterVolumeIcon(Number(master.value));
      return;
    }
  });

  function syncMasterVolumeIcon(pct = Math.round((audio?.masterVolume ?? 1) * 100)) {
    const bar = el.tracks.querySelector('[data-role="audio-bar"]');
    const icon = bar?.querySelector('[data-role="audio-master-icon"]');
    const btn = icon?.closest?.('.sb-tl-audio-master-label');
    if (!icon) return;
    icon.className = audioVolumeIconClass(pct / 100, false);
    btn?.classList.toggle('is-muted', pct <= 0);
  }

  function syncTrackVolumeIcon(trackId, pct) {
    const label = el.labels.querySelector(`.sb-tl-label-audio[data-track="${trackId}"]`);
    if (!label) return;
    const track = engine.getTrack(trackId);
    const icon = label.querySelector('[data-role="track-vol-icon"]');
    const muteBtn = label.querySelector('[data-tl-act="mute"]');
    if (icon) {
      icon.className = audioVolumeIconClass(pct / 100, !!track?.hidden);
    }
    muteBtn?.classList.toggle('is-on', !!track?.hidden || pct <= 0);
  }

  function updateAudioBar() {
    if (!audio) return;
    const bar = el.tracks.querySelector('[data-role="audio-bar"]');
    if (!bar) return;
    const canSplit = audio.canSplitAtPlayhead();
    const hasClip = !!audio.selectedClipId;
    bar.querySelector('[data-act="audio-split"]')
      ?.classList.toggle('is-off', !canSplit);
    bar.querySelector('[data-act="audio-delete"]')
      ?.classList.toggle('is-off', !hasClip);
    const master = bar.querySelector('[data-role="audio-master"]');
    if (master) master.value = String(Math.round(audio.masterVolume * 100));
    syncMasterVolumeIcon();
  }

  el.duration.addEventListener('change', () => {
    const v = Number(el.duration.value);
    if (!Number.isFinite(v) || v <= 0) return;
    // Keep absolute key times; only clamp keys past the new end.
    engine.setDuration(v, DURATION_MODE.CLAMP_END);
  });

  let dragMoved = false;
  /** @type {null | { kind: 'key', trackId: string, keyId: string, startTime: number, lastTime: number, pointerId: number } | { kind: 'scrub', pointerId: number }} */
  let drag = null;
  /** @type {HTMLElement | null} */
  let ctxMenu = null;
  /** @type {HTMLElement | null} */
  let shortcutsPopup = null;

  function closeCtx() {
    if (!ctxMenu) return;
    ctxMenu.remove();
    ctxMenu = null;
  }

  function closeShortcutsPopup() {
    if (!shortcutsPopup) return;
    shortcutsPopup.remove();
    shortcutsPopup = null;
  }

  function toggleShortcutsPopup() {
    if (shortcutsPopup) {
      closeShortcutsPopup();
      return;
    }
    closeCtx();
    const pop = document.createElement('div');
    pop.className = 'sb-tl-help';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', '타임라인 단축키');
    pop.innerHTML = `
      <div class="sb-tl-help-head">
        <strong>타임라인 단축키</strong>
        <button type="button" class="sb-tl-help-close" data-act="close-help" aria-label="닫기">×</button>
      </div>
      <table class="sb-tl-help-table">
        <tr><td>K</td><td>선택 트랙 · 플레이헤드에 키 추가</td></tr>
        <tr><td>D / Del</td><td>선택 키 삭제</td></tr>
        <tr><td>← / →</td><td>선택 키 1프레임 이동</td></tr>
        <tr><td>[ / ]</td><td>선택 키 1프레임 이동 (대체)</td></tr>
        <tr><td>Shift+← / →</td><td>선택 키 1초 이동</td></tr>
        <tr><td>Alt+← / →</td><td>선택 키 0.1초 이동</td></tr>
        <tr><td>M</td><td>선택 키 → 초 입력 이동</td></tr>
        <tr><td>Shift+M</td><td>플레이헤드 → 초 입력 이동</td></tr>
        <tr><td>Space</td><td>재생 / 일시정지</td></tr>
        <tr><td>S</td><td>선택 오디오 클립 분할 (플레이헤드)</td></tr>
        <tr><td>Ctrl+Z / Y</td><td>Undo / Redo</td></tr>
      </table>
      <p class="sb-tl-help-note">트랙은 Assets에서 Characters / Stage를 <strong>+</strong> 로 추가합니다. 오디오는 Audio 바에서 <strong>+ 트랙</strong> · 볼륨 · Split · Delete. 플레이헤드 스크럽: 룰러·빈 트랙 드래그.</p>
    `;
    const btn = host.querySelector('[data-act="shortcuts"]');
    const br = btn?.getBoundingClientRect?.();
    document.body.appendChild(pop);
    if (br) {
      const pr = pop.getBoundingClientRect();
      let left = br.right - pr.width;
      let top = br.bottom + 6;
      if (left < 8) left = 8;
      if (top + pr.height > window.innerHeight - 8) top = br.top - pr.height - 6;
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
    }
    pop.querySelector('[data-act="close-help"]')?.addEventListener('click', closeShortcutsPopup);
    shortcutsPopup = pop;
  }

  function onDocPointerDown(e) {
    if (ctxMenu && ctxMenu.contains(/** @type {Node} */ (e.target))) return;
    if (shortcutsPopup && shortcutsPopup.contains(/** @type {Node} */ (e.target))) return;
    if (timeMoveDialog && timeMoveDialog.contains(/** @type {Node} */ (e.target))) return;
    if (e.target.closest?.('[data-act="shortcuts"]')) return;
    closeCtx();
    closeShortcutsPopup();
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @param {{ label: string, shortcut?: string, disabled?: boolean, action?: () => void, sep?: boolean }[]} items
   */
  function openCtx(clientX, clientY, items) {
    closeCtx();
    const menu = document.createElement('ul');
    menu.className = 'sb-tl-ctx';
    menu.setAttribute('role', 'menu');
    for (const item of items) {
      if (item.sep) {
        const sep = document.createElement('li');
        sep.className = 'sb-tl-ctx-sep';
        sep.setAttribute('role', 'separator');
        menu.appendChild(sep);
        continue;
      }
      const li = document.createElement('li');
      li.setAttribute('role', 'none');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'menuitem');
      const label = document.createElement('span');
      label.textContent = item.label;
      btn.appendChild(label);
      if (item.shortcut) {
        const sc = document.createElement('span');
        sc.className = 'sb-tl-ctx-sc';
        sc.textContent = item.shortcut;
        btn.appendChild(sc);
      }
      if (item.disabled) btn.disabled = true;
      btn.addEventListener('click', () => {
        closeCtx();
        item.action?.();
      });
      li.appendChild(btn);
      menu.appendChild(li);
    }
    document.body.appendChild(menu);
    const pad = 6;
    const rect = menu.getBoundingClientRect();
    let left = clientX;
    let top = clientY;
    if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
    if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
    menu.style.left = `${Math.max(pad, left)}px`;
    menu.style.top = `${Math.max(pad, top)}px`;
    ctxMenu = menu;
  }

  function secFromClientX(clientX) {
    const rect = el.canvas.getBoundingClientRect();
    return xToSec(clientX - rect.left + el.viewport.scrollLeft);
  }

  function isKeyableTrack(trackId) {
    const track = trackId ? engine.getTrack(trackId) : null;
    return !!(track && track.kind !== 'clip' && !track.locked);
  }

  function resolveTrackId(preferred) {
    if (preferred && isKeyableTrack(preferred)) return preferred;

    const section = sectionFilter !== 'all' ? sectionFilter : null;
    if (section) {
      const targeted = engine.getKeyTargetTrackId?.(section);
      if (targeted && isKeyableTrack(targeted)) return targeted;
      const inSection = engine.listTracks().find(
        (t) => t.kind === 'motion' && (t.section || 'motion') === section,
      );
      if (inSection && isKeyableTrack(inSection.id)) return inSection.id;
    }

    const recent = engine.getRecentKeyTargetTrackId?.();
    if (recent && isKeyableTrack(recent)) return recent;

    if (engine.selectedTrackId && isKeyableTrack(engine.selectedTrackId)) {
      return engine.selectedTrackId;
    }

    return engine.listTracks().find((t) => t.kind === 'motion' && isKeyableTrack(t.id))?.id
      ?? engine.listTracks().find((t) => t.kind !== 'clip' && isKeyableTrack(t.id))?.id
      ?? null;
  }

  function defaultKeyValue(track) {
    if (track.kind === 'motion') {
      return getMotionKeyValue?.(track.id) ?? {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        opacity: 1,
        visible: true,
      };
    }
    if (track.kind === 'light') {
      return getLightKeyValue?.(track.id) ?? {
        dim: 0,
        color: '#ffffff',
        size: 0.5,
      };
    }
    if (track.kind === 'bool') return true;
    if (track.kind === 'scalar') return 1;
    if (track.kind === 'vec3') {
      if (track.name.includes('scale')) return [1, 1, 1];
      return [0, 0, 0];
    }
    return 1;
  }

  /** Selected (or preferred) track @ playhead */
  function addKeyAtPlayhead(preferredTrackId) {
    const trackId = resolveTrackId(preferredTrackId);
    if (!trackId) return null;
    const track = engine.getTrack(trackId);
    if (!track || track.kind === 'clip') return null;
    if (track.locked) return null;
    const ph = snapKeyframeTimeSec(engine.playheadSec, engine.fps);
    const eps = keyframeTimeEps(engine.fps);
    const existing = track.keys.findAtTime(ph, { eps });
    const value = defaultKeyValue(track);
    if (existing) {
      engine.editKeyframe(trackId, existing.id, { value });
      selectTimelineKey(trackId, existing.id, { scrub: false });
      return existing;
    }
    const added = engine.addKeyframe(trackId, ph, value);
    if (added) selectTimelineKey(trackId, added.id, { scrub: false });
    return added;
  }

  function addKeyAtTime(trackId, timeSec) {
    const resolved = resolveTrackId(trackId);
    if (!resolved) return null;
    const track = engine.getTrack(resolved);
    if (!track || track.kind === 'clip') return null;
    if (track.locked) return null;
    const ph = snapKeyframeTimeSec(timeSec, engine.fps);
    const eps = keyframeTimeEps(engine.fps);
    const existing = track.keys.findAtTime(ph, { eps });
    const value = defaultKeyValue(track);
    if (existing) {
      engine.editKeyframe(resolved, existing.id, { value });
      selectTimelineKey(resolved, existing.id, { scrub: false });
      return existing;
    }
    const added = engine.addKeyframe(resolved, ph, value);
    if (added) selectTimelineKey(resolved, added.id, { scrub: false });
    return added;
  }

  function nudgeSelectedKey(deltaSec) {
    const refs = engine.listSelectedKeys?.() || [];
    const list = refs.length
      ? refs
      : (engine.selectedTrackId && engine.selectedKeyframeId
        ? [{ trackId: engine.selectedTrackId, keyId: engine.selectedKeyframeId }]
        : []);
    if (!list.length) return false;
    let movedAny = false;
    let focusTime = null;
    for (const ref of list) {
      const track = engine.getTrack(ref.trackId);
      if (!track || track.locked) continue;
      const kf = track.keys.get(ref.keyId);
      if (!kf) continue;
      const before = kf.timeSec;
      engine.moveKeyframe(ref.trackId, ref.keyId, before + deltaSec);
      const moved = track.keys.get(ref.keyId);
      if (moved && Math.abs(moved.timeSec - before) > 1e-9) {
        movedAny = true;
        if (ref.keyId === engine.selectedKeyframeId) focusTime = moved.timeSec;
      }
    }
    if (focusTime != null) scrollTimeIntoView(focusTime);
    return movedAny;
  }

  function scrollTimeIntoView(timeSec) {
    const x = secToX(timeSec);
    const vp = el.viewport;
    const margin = 48;
    if (x < vp.scrollLeft + margin) {
      vp.scrollLeft = Math.max(0, x - margin);
    } else if (x > vp.scrollLeft + vp.clientWidth - margin) {
      vp.scrollLeft = x - vp.clientWidth + margin;
    }
  }

  function focusTimeline() {
    if (typeof host.focus === 'function') host.focus({ preventScroll: true });
  }

  /**
   * Select key on timeline + stage object; scrub playhead to key so opacity/visible match.
   * @param {string} trackId
   * @param {string} keyId
   * @param {{ scrub?: boolean }} [opt]
   */
  function selectTimelineKey(trackId, keyId, opt = {}) {
    if (!trackId || !keyId) return;
    engine.selectKeyframe(trackId, keyId);
    if (opt.scrub !== false) {
      const kf = engine.getTrack(trackId)?.keys.get(keyId);
      if (kf) {
        engine.pause();
        engine.setPlayhead(kf.timeSec);
        scrollTimeIntoView(kf.timeSec);
      }
    }
    onTrackSelect?.(trackId, { selectKey: false });
    focusTimeline();
  }

  /** @type {HTMLElement | null} */
  let timeMoveDialog = null;

  function closeTimeMoveDialog() {
    if (!timeMoveDialog) return;
    timeMoveDialog.remove();
    timeMoveDialog = null;
  }

  /**
   * @param {'key' | 'playhead'} mode
   * M — 선택 키프레임 이동 / Shift+M — 플레이헤드 이동
   */
  function openTimeMoveDialog(mode) {
    closeTimeMoveDialog();
    closeCtx();
    closeShortcutsPopup();

    const isKey = mode === 'key';
    const hasKey = !!(engine.selectedTrackId && engine.selectedKeyframeId);
    const track = hasKey ? engine.getTrack(engine.selectedTrackId) : null;
    const kf = hasKey && track ? track.keys.get(engine.selectedKeyframeId) : null;
    const canMoveKey = isKey && hasKey && !!kf && !track?.locked;

    if (isKey && !canMoveKey) {
      // 키 미선택·잠금이면 안내만 (폼 생략)
      return;
    }

    const defaultSec = isKey && kf ? kf.timeSec : engine.playheadSec;
    const maxSec = engine.durationSec;

    const overlay = document.createElement('div');
    overlay.className = 'sb-tl-time-dlg-overlay';
    overlay.innerHTML = `
      <div class="sb-tl-time-dlg" role="dialog" aria-modal="true"
        aria-label="${isKey ? '키프레임 시간 이동' : '플레이헤드 이동'}">
        <div class="sb-tl-time-dlg-head">
          <strong>${isKey ? '키프레임 시간 이동' : '플레이헤드 이동'}</strong>
          <button type="button" class="sb-tl-help-close" data-act="close-time" aria-label="닫기">×</button>
        </div>
        <p class="sb-tl-time-dlg-hint">
          ${isKey
            ? (engine.listSelectedKeys?.()?.length > 1
              ? `선택한 키 ${engine.listSelectedKeys().length}개를 함께 이동합니다.`
              : '선택한 키프레임을 입력한 초로 이동합니다.')
            : '플레이헤드를 입력한 초로 이동합니다.'}
        </p>
        <label class="sb-tl-time-dlg-field">
          <span>시간 (초)</span>
          <input type="number" data-role="time-sec" min="0" max="${maxSec}" step="0.01"
            value="${Number(defaultSec.toFixed(2))}" />
        </label>
        <p class="sb-tl-time-dlg-range">0 ~ ${maxSec.toFixed(0)}초</p>
        <div class="sb-tl-time-dlg-actions">
          <button type="button" class="sb-tl-btn" data-act="cancel-time">취소</button>
          <button type="button" class="sb-tl-btn sb-tl-btn-primary" data-act="apply-time">이동</button>
        </div>
      </div>
    `;

    const apply = () => {
      const input = /** @type {HTMLInputElement | null} */ (
        overlay.querySelector('[data-role="time-sec"]')
      );
      const raw = Number(input?.value);
      if (!Number.isFinite(raw)) return;
      const t = clamp(raw, 0, maxSec);
      engine.pause();
      if (isKey) {
        if (!engine.selectedTrackId || !engine.selectedKeyframeId || !kf) return;
        const refs = engine.listSelectedKeys?.() || [{ trackId: engine.selectedTrackId, keyId: engine.selectedKeyframeId }];
        const delta = t - kf.timeSec;
        for (const ref of refs) {
          const tr = engine.getTrack(ref.trackId);
          if (!tr || tr.locked) continue;
          const k = tr.keys.get(ref.keyId);
          if (!k) continue;
          engine.moveKeyframe(ref.trackId, ref.keyId, k.timeSec + delta);
        }
      }
      engine.setPlayhead(t);
      scrollTimeIntoView(t);
      closeTimeMoveDialog();
      focusTimeline();
    };

    overlay.querySelector('[data-act="close-time"]')?.addEventListener('click', closeTimeMoveDialog);
    overlay.querySelector('[data-act="cancel-time"]')?.addEventListener('click', closeTimeMoveDialog);
    overlay.querySelector('[data-act="apply-time"]')?.addEventListener('click', apply);
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) closeTimeMoveDialog();
    });

    const input = /** @type {HTMLInputElement} */ (overlay.querySelector('[data-role="time-sec"]'));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        apply();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeTimeMoveDialog();
      }
    });

    document.body.appendChild(overlay);
    timeMoveDialog = overlay;
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  function toggleTrackHidden(trackId) {
    const track = engine.getTrack(trackId);
    if (!track) return;
    track.hidden = !track.hidden;
    engine.emit('tracks');
    // Directors subscribe to all emits and re-apply (lights mute when hidden)
    engine.emit('change');
  }

  function toggleTrackLocked(trackId) {
    const track = engine.getTrack(trackId);
    if (!track) return;
    track.locked = !track.locked;
    engine.emit('tracks');
    engine.emit('change');
  }

  /** Dispose scene/audio/light object, then remove the timeline row if still present. */
  function deleteTimelineTrack(trackId) {
    onTrackRemove?.(trackId);
    if (engine.getTrack(trackId)) {
      engine.removeTrack(trackId, { history: true });
    }
  }

  function frameStep() {
    return 1 / Math.max(1, engine.fps || 30);
  }

  // track label select + folder toggle + header controls + context
  el.labels.addEventListener('pointerdown', (e) => {
    if (e.target.closest?.('[data-tl-act="track-vol"]')) {
      e.stopPropagation();
    }
  });

  el.labels.addEventListener('input', (e) => {
    const vol = /** @type {HTMLInputElement | null} */ (e.target.closest?.('[data-tl-act="track-vol"]'));
    if (!vol || e.target !== vol) return;
    e.stopPropagation();
    const trackId = vol.closest('.sb-tl-label')?.dataset?.track;
    if (!trackId || !audio) return;
    const pct = Number(vol.value);
    audio.setTrackVolume(trackId, pct / 100);
    audio.apply(engine.playheadSec);
    syncTrackVolumeIcon(trackId, pct);
  });

  el.labels.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-tl-act="track-vol"]')) return;
    focusTimeline();
    closeCtx();
    const secToggle = e.target.closest?.('.sb-tl-sec-toggle');
    if (secToggle?.dataset.section) {
      const sid = secToggle.dataset.section;
      sectionCollapsed[sid] = !sectionCollapsed[sid];
      render();
      return;
    }
    const toggle = e.target.closest?.('.sb-tl-folder-toggle');
    if (toggle?.dataset.folder) {
      const f = engine.folders.get(toggle.dataset.folder);
      if (f) engine.setFolderCollapsed(f.id, !f.collapsed);
      return;
    }
    const ctrl = e.target.closest?.('[data-tl-act]');
    if (ctrl) {
      e.stopPropagation();
      const trackId = ctrl.closest?.('.sb-tl-label')?.dataset?.track;
      if (!trackId) return;
      const act = ctrl.dataset.tlAct;
      if (act === 'vis') toggleTrackHidden(trackId);
      else if (act === 'mute') toggleTrackHidden(trackId);
      else if (act === 'key') {
        addKeyAtPlayhead(trackId);
      } else if (act === 'lock') toggleTrackLocked(trackId);
      return;
    }
    const label = e.target.closest?.('.sb-tl-label');
    if (!label) return;
    const trackId = label.dataset.track;
    const track = trackId ? engine.getTrack(trackId) : null;
    engine.selectTracks(trackId ? [trackId] : []);
    if (track?.kind === 'audio') {
      audio?.selectTrackTarget(trackId);
    }
    if (trackId) onTrackSelect?.(trackId);
  });

  el.labels.addEventListener('contextmenu', (e) => {
    const label = e.target.closest?.('.sb-tl-label');
    if (!label) return;
    e.preventDefault();
    const trackId = label.dataset.track;
    const track = engine.getTrack(trackId);
    engine.selectTracks(trackId ? [trackId] : []);
    if (track?.kind === 'audio') {
      openCtx(e.clientX, e.clientY, [
        {
          label: '트랙 삭제',
          action: () => deleteTimelineTrack(trackId),
        },
      ]);
      return;
    }
    openCtx(e.clientX, e.clientY, [
      { label: '키 추가 (플레이헤드)', shortcut: 'K', action: () => addKeyAtPlayhead(trackId) },
      { sep: true },
      {
        label: '트랙 삭제',
        action: () => deleteTimelineTrack(trackId),
      },
    ]);
  });

  // key / empty track / ruler context
  el.viewport.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const keyBtn = e.target.closest?.('.sb-tl-key');
    const trackRow = e.target.closest?.('.sb-tl-track');
    const clickSec = secFromClientX(e.clientX);

    if (keyBtn) {
      const trackId = keyBtn.dataset.track;
      const keyId = keyBtn.dataset.key;
      selectTimelineKey(trackId, keyId);
      const kf = engine.getTrack(trackId)?.keys.get(keyId);
      openCtx(e.clientX, e.clientY, [
        { label: '키 추가 (플레이헤드)', shortcut: 'K', action: () => addKeyAtPlayhead(trackId) },
        {
          label: '여기에 키 추가',
          action: () => addKeyAtTime(trackId, clickSec),
        },
        { sep: true },
        {
          label: `플레이헤드 → ${kf ? kf.timeSec.toFixed(2) : '?'}s`,
          action: () => {
            if (kf) {
              engine.pause();
              engine.setPlayhead(kf.timeSec);
            }
          },
        },
        { sep: true },
        {
          label: '키 삭제',
          shortcut: 'D',
          action: () => engine.removeKeyframe(trackId, keyId),
        },
      ]);
      return;
    }

    const trackId = resolveTrackId(trackRow?.dataset.track);
    if (trackId) {
      engine.selectTracks([trackId]);
    }
    openCtx(e.clientX, e.clientY, [
      {
        label: '키 추가 (플레이헤드)',
        shortcut: 'K',
        disabled: !trackId,
        action: () => addKeyAtPlayhead(trackId),
      },
      {
        label: '여기에 키 추가',
        disabled: !trackId,
        action: () => addKeyAtTime(trackId, clickSec),
      },
      { sep: true },
      {
        label: '플레이헤드를 여기로',
        action: () => {
          engine.pause();
          engine.setPlayhead(clickSec);
        },
      },
    ]);
  });

  el.viewport.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-role="audio-bar"]')) return;
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    closeCtx();
    const keyBtn = e.target.closest?.('.sb-tl-key');
    if (keyBtn) {
      selectTimelineKey(keyBtn.dataset.track, keyBtn.dataset.key);
      return;
    }
    const audioRow = e.target.closest?.('.sb-tl-track-audio[data-track]');
    if (audioRow && !e.target.closest?.('.sb-audio-clip')) {
      audio?.selectTrackTarget(audioRow.dataset.track);
    }
    engine.pause();
    engine.setPlayhead(secFromClientX(e.clientX));
  });

  // pointer: key drag or playhead scrub (no clip resize — unify with lights)
  el.viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest?.('.sb-audio-clip')) return;
    if (e.target.closest?.('[data-role="audio-bar"]')) return;
    focusTimeline();
    closeCtx();
    const keyBtn = e.target.closest?.('.sb-tl-key');
    if (keyBtn) {
      e.preventDefault();
      const track = engine.getTrack(keyBtn.dataset.track);
      const kf = track?.keys.get(keyBtn.dataset.key);
      if (!track || !kf) return;
      const already = engine.isKeySelected?.(track.id, kf.id);
      if (!already) {
        selectTimelineKey(track.id, kf.id, { scrub: true });
      } else {
        engine.pause();
        engine.setPlayhead(kf.timeSec);
        scrollTimeIntoView(kf.timeSec);
        engine.selectKeyframe(track.id, kf.id);
        onTrackSelect?.(track.id, { selectKey: false });
        focusTimeline();
      }
      if (track.locked) return;
      const refs = (engine.listSelectedKeys?.() || [{ trackId: track.id, keyId: kf.id }])
        .map((r) => {
          const tr = engine.getTrack(r.trackId);
          const k = tr?.keys.get(r.keyId);
          if (!tr || !k || tr.locked) return null;
          return { trackId: r.trackId, keyId: r.keyId, startTime: k.timeSec };
        })
        .filter(Boolean);
      dragMoved = false;
      drag = {
        kind: 'key',
        trackId: track.id,
        keyId: kf.id,
        startTime: kf.timeSec,
        lastTime: kf.timeSec,
        pointerId: e.pointerId,
        group: refs,
      };
      el.viewport.setPointerCapture(e.pointerId);
      return;
    }

    // scrub on ruler, playhead, or empty track area
    e.preventDefault();
    engine.pause();
    dragMoved = false;
    drag = { kind: 'scrub', pointerId: e.pointerId };
    engine.setPlayhead(secFromClientX(e.clientX));
    el.viewport.setPointerCapture(e.pointerId);
  });

  el.viewport.addEventListener('pointermove', (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.kind === 'scrub') {
      dragMoved = true;
      engine.setPlayhead(secFromClientX(e.clientX));
      return;
    }
    const t = secFromClientX(e.clientX);
    if (Math.abs(t - drag.startTime) > 1e-4) dragMoved = true;
    const delta = t - drag.startTime;
    const group = drag.group || [{ trackId: drag.trackId, keyId: drag.keyId, startTime: drag.startTime }];
    for (const g of group) {
      const track = engine.getTrack(g.trackId);
      if (!track) continue;
      const next = Math.min(engine.durationSec, Math.max(0, g.startTime + delta));
      if (track.keys.findAtTime(next, { excludeId: g.keyId })) continue;
      track.keys.update(g.keyId, { timeSec: next });
    }
    drag.lastTime = t;
    engine.emit('keys');
  });

  el.viewport.addEventListener('pointerup', (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.kind === 'scrub') {
      drag = null;
      return;
    }
    const { startTime, lastTime, group } = drag;
    drag = null;
    if (Math.abs(startTime - lastTime) < 1e-6) return;
    const delta = lastTime - startTime;
    const items = group || [];
    // revert live preview, then commit via history
    for (const g of items) {
      const track = engine.getTrack(g.trackId);
      if (!track) continue;
      track.keys.update(g.keyId, { timeSec: g.startTime });
    }
    for (const g of items) {
      engine.moveKeyframe(g.trackId, g.keyId, g.startTime + delta);
    }
  });

  el.viewport.addEventListener('pointercancel', () => {
    drag = null;
  });

  function deleteSelectedKey() {
    if (audio?.selectedClipId) {
      return audio.removeClip(audio.selectedClipId);
    }
    const refs = engine.listSelectedKeys?.() || [];
    const list = refs.length
      ? refs
      : (engine.selectedTrackId && engine.selectedKeyframeId
        ? [{ trackId: engine.selectedTrackId, keyId: engine.selectedKeyframeId }]
        : []);
    if (!list.length) return false;
    let n = 0;
    for (const ref of list) {
      if (engine.getTrack(ref.trackId)?.locked) continue;
      if (engine.removeKeyframe(ref.trackId, ref.keyId)) n += 1;
    }
    return n > 0;
  }

  // keyboard (capture — 뷰포트/브라우저보다 먼저 키프레임 이동 처리)
  const onKey = (e) => {
    if (timeMoveDialog) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTimeMoveDialog();
      }
      return;
    }

    if (e.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;

    const keyLower = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    if (keyLower === 'Escape') {
      closeCtx();
      closeShortcutsPopup();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && keyLower === 'z') {
      e.preventDefault();
      if (e.shiftKey) engine.redo();
      else engine.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && keyLower === 'y') {
      e.preventDefault();
      engine.redo();
      return;
    }

    if (!e.ctrlKey && !e.metaKey && !e.altKey && keyLower === 'k') {
      e.preventDefault();
      addKeyAtPlayhead();
      return;
    }

    // M — 선택 키 / Shift+M — 플레이헤드
    if (!e.ctrlKey && !e.metaKey && !e.altKey && keyLower === 'm') {
      e.preventDefault();
      openTimeMoveDialog(e.shiftKey ? 'playhead' : 'key');
      return;
    }

    if (
      e.key === 'Delete'
      || e.key === 'Backspace'
      || (!e.ctrlKey && !e.metaKey && !e.altKey && keyLower === 'd')
    ) {
      if (deleteSelectedKey()) {
        e.preventDefault();
      }
      return;
    }

    if (!e.ctrlKey && !e.metaKey && !e.altKey && keyLower === 's' && audio?.canSplitAtPlayhead()) {
      e.preventDefault();
      if (audio.splitSelectedAtPlayhead()) render();
      return;
    }

    // 키프레임 시간 이동 — 선택된 키 필요
    if (engine.selectedKeyframeId) {
      let delta = 0;
      if (e.key === 'ArrowLeft') delta = -1;
      else if (e.key === 'ArrowRight') delta = 1;
      else if (keyLower === '[') delta = -1;
      else if (keyLower === ']') delta = 1;

      if (delta !== 0) {
        e.preventDefault();
        let step = frameStep();
        if (e.shiftKey) step = 1;
        else if (e.altKey) step = 0.1;
        nudgeSelectedKey(delta * step);
        return;
      }
    }

    if (e.key === ' ') {
      if (document.querySelector('.sb-multiview-overlay')) return;
      if (host.contains(document.activeElement) || e.target === document.body || host.contains(e.target)) {
        e.preventDefault();
        engine.togglePlay();
      }
    }
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onDocPointerDown, true);

  const unsub = engine.subscribe((ev) => {
    if (ev.type === 'sceneLoaded') {
      sectionFilter = 'all';
      el.jumps?.querySelectorAll('.sb-tl-jump').forEach((b) => {
        b.classList.toggle('is-on', b.dataset.section === 'all');
      });
      host.classList.remove('tl-filtered');
    }
    if (audioDragClipId) {
      if (ev.type === 'playhead') syncPlayheadUi();
      else if (ev.type === 'selection') refreshAudioSelection();
      return;
    }
    if (ev.type === 'playhead') {
      syncPlayheadUi();
      if (audio) updateAudioBar();
      return;
    }
    render();
  });

  /** Viewport is scroll source; labels mirror Y (render also restores both). */
  const lockVerticalScroll = (y) => {
    if (syncingScroll) return;
    syncingScroll = true;
    el.viewport.scrollTop = y;
    el.labels.scrollTop = y;
    syncingScroll = false;
  };
  el.viewport.addEventListener('scroll', () => {
    if (syncingScroll) return;
    syncingScroll = true;
    el.labels.scrollTop = el.viewport.scrollTop;
    syncingScroll = false;
  }, { passive: true });
  el.labels.addEventListener('scroll', () => {
    if (syncingScroll) return;
    lockVerticalScroll(el.labels.scrollTop);
  }, { passive: true });
  el.labels.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    e.preventDefault();
    lockVerticalScroll(el.viewport.scrollTop + e.deltaY);
  }, { passive: false });

  render();

  return {
    destroy() {
      unsub();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDocPointerDown, true);
      closeCtx();
      closeShortcutsPopup();
      closeTimeMoveDialog();
      detachHeight?.();
    },
    render,
  };
}

const TL_HEIGHT_KEY = 'sb-timeline-height';
const TL_HEIGHT_DEFAULT = 320;
const TL_HEIGHT_MIN = 160;

/**
 * Drag the top edge of `.timelineWrapper` to resize (persisted).
 * @param {HTMLElement | null} wrapper
 */
function attachTimelineHeightResize(wrapper) {
  if (!wrapper || wrapper.dataset.heightResizeAttached === '1') return () => {};
  wrapper.dataset.heightResizeAttached = '1';

  const maxH = () => Math.round(window.innerHeight * 0.7);

  let height = TL_HEIGHT_DEFAULT;
  const saved = parseInt(localStorage.getItem(TL_HEIGHT_KEY), 10);
  if (Number.isFinite(saved)) height = saved;
  height = clamp(height, TL_HEIGHT_MIN, maxH());
  wrapper.style.height = `${height}px`;

  const handle = document.createElement('div');
  handle.className = 'sb-tl-height-handle';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'horizontal');
  handle.setAttribute('aria-label', '타임라인 높이 조절');
  handle.title = '드래그하여 타임라인 높이 조절';
  wrapper.prepend(handle);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = wrapper.offsetHeight;
    wrapper.classList.add('is-resizing');
    document.body.classList.add('sb-tl-resize-active');
    handle.setPointerCapture?.(e.pointerId);

    const onMove = (ev) => {
      // drag up → taller
      const next = clamp(startH + (startY - ev.clientY), TL_HEIGHT_MIN, maxH());
      wrapper.style.height = `${next}px`;
      window.dispatchEvent(new Event('resize'));
    };

    const onUp = (ev) => {
      wrapper.classList.remove('is-resizing');
      document.body.classList.remove('sb-tl-resize-active');
      handle.releasePointerCapture?.(ev.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      localStorage.setItem(TL_HEIGHT_KEY, String(wrapper.offsetHeight));
      window.dispatchEvent(new Event('resize'));
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  handle.addEventListener('pointerdown', onPointerDown);

  const onWinResize = () => {
    const capped = clamp(wrapper.offsetHeight, TL_HEIGHT_MIN, maxH());
    if (capped !== wrapper.offsetHeight) {
      wrapper.style.height = `${capped}px`;
    }
  };
  window.addEventListener('resize', onWinResize);

  return () => {
    handle.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('resize', onWinResize);
    handle.remove();
    delete wrapper.dataset.heightResizeAttached;
  };
}

function niceStep(pxPerSec) {
  const targetPx = 64;
  const raw = targetPx / pxPerSec;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  return step * pow;
}

/**
 * Audio section toolbar — rendered inside Audio group (hidden with section filter).
 * @param {import('../../domain/audio/AudioDirector.js').AudioDirector | null | undefined} audio
 */
function audioSectionToolbarHtml(audio) {
  const masterVal = audio ? Math.round(audio.masterVolume * 100) : 100;
  const masterIcon = audioVolumeIconClass((audio?.masterVolume ?? 1), false);
  const splitOff = !audio?.canSplitAtPlayhead();
  const deleteOff = !audio?.selectedClipId;
  return `<div class="sb-tl-audio-bar sb-tl-sec-audio-toolbar" data-role="audio-bar" data-section="audio" aria-label="Audio editing">
    <label class="sb-tl-audio-field" title="Master volume">
      <span class="sb-tl-audio-master-label${masterVal <= 0 ? ' is-muted' : ''}">
        <i class="${masterIcon}" data-role="audio-master-icon" aria-hidden="true"></i>
        <span>Master</span>
      </span>
      <input type="range" data-role="audio-master" min="0" max="100" value="${masterVal}" aria-label="Master volume" />
    </label>
    <span class="sb-tl-audio-clip-tools" data-role="audio-clip-tools">
      <button type="button" class="sb-tl-btn sb-tl-btn-sm${splitOff ? ' is-off' : ''}" data-act="audio-split" title="Split at playhead (S)">Split</button>
      <button type="button" class="sb-tl-btn sb-tl-btn-sm${deleteOff ? ' is-off' : ''}" data-act="audio-delete" title="Delete selected clip (Del)">Delete</button>
    </span>
    <span class="sb-tl-audio-hint" data-role="audio-hint">Assets Audio + → 새 트랙</span>
  </div>`;
}

/**
 * @param {import('../../domain/timeline/Track.js').Track[]} rows
 * @param {import('../../domain/timeline/TimelineEngine.js').TimelineEngine} engine
 */
function partitionByFolder(rows, engine) {
  /** @type {Map<string, { id: string, meta: { id: string, name: string, collapsed: boolean }, tracks: typeof rows }>} */
  const map = new Map();
  /** @type {typeof rows} */
  const loose = [];
  for (const tr of rows) {
    if (!tr.folderId) {
      loose.push(tr);
      continue;
    }
    let bucket = map.get(tr.folderId);
    if (!bucket) {
      const meta = engine.folders.get(tr.folderId) || {
        id: tr.folderId,
        name: tr.folderId,
        collapsed: false,
      };
      bucket = { id: tr.folderId, meta, tracks: [] };
      map.set(tr.folderId, bucket);
    }
    bucket.tracks.push(tr);
  }
  return { folders: [...map.values()], loose };
}

/** @param {import('../../domain/timeline/Track.js').Track} tr */
function trackLabelHtml(tr, engine, nested, audio) {
  if (tr.kind === 'audio') {
    return audioTrackLabelHtml(
      tr,
      engine,
      nested,
      audio?.selectedClipId ?? null,
      audio?.insertTrackId ?? null,
    );
  }
  const nest = nested ? ' sb-tl-label-nested' : '';
  const accent = tr.color || sectionAccent(tr.section);
  const sel = engine.isTrackSelected?.(tr.id) || engine.selectedTrackId === tr.id ? ' is-selected' : '';
  const hid = tr.hidden ? ' is-hidden' : '';
  const loc = tr.locked ? ' is-locked' : '';
  const eyeIcon = tr.hidden ? 'fas fa-eye-slash' : 'fas fa-eye';
  const lockIcon = tr.locked ? 'fas fa-lock' : 'fas fa-lock-open';
  const keyDisabled = tr.locked ? ' disabled' : '';
  return `<div class="sb-tl-label${nest}${sel}${hid}${loc}"
    data-track="${tr.id}" data-section="${tr.section || 'motion'}"
    style="--track-accent:${escapeAttr(accent)}">
    <i class="sb-tl-swatch" style="background:${escapeAttr(accent)}"></i>
    <span class="sb-tl-label-name">${escapeHtml(tr.name)}</span>
    <span class="sb-tl-label-ctrls" role="group" aria-label="트랙 제어">
      <button type="button" class="sb-tl-hbtn${tr.hidden ? ' is-on' : ''}" data-tl-act="vis"
        title="보이기/숨기기"><i class="${eyeIcon}"></i></button>
      <button type="button" class="sb-tl-hbtn sb-tl-hbtn-key" data-tl-act="key"${keyDisabled}
        title="키프레임 추가 (K)"><span class="sb-tl-kf-diamond" aria-hidden="true"></span></button>
      <button type="button" class="sb-tl-hbtn${tr.locked ? ' is-on' : ''}" data-tl-act="lock"
        title="잠금"><i class="${lockIcon}"></i></button>
    </span>
  </div>`;
}

/** @param {import('../../domain/timeline/Track.js').Track} tr */
function trackRowHtml(tr, engine, secToX, audio) {
  if (tr.kind === 'audio') {
    return audioTrackRowHtml(tr, secToX, audio?.selectedClipId ?? null);
  }
  const accent = tr.color || sectionAccent(tr.section);
  const keys = tr.keys.list().map((kf) => {
    const sel = engine.isKeySelected?.(tr.id, kf.id) ? ' is-selected' : '';
    return `<button type="button" class="sb-tl-key${sel}" data-track="${tr.id}" data-key="${kf.id}"
      style="left:${secToX(kf.timeSec)}px;--key-fill:${escapeAttr(accent)}" title="${kf.timeSec.toFixed(2)}s"></button>`;
  }).join('');
  return `<div class="sb-tl-track" data-track="${tr.id}" data-section="${tr.section || 'motion'}"
    style="--track-accent:${escapeAttr(accent)}">${keys}</div>`;
}

function sectionAccent(section) {
  if (section === 'stage') return '#a67c52';
  if (section === 'light') return '#c9a227';
  if (section === 'audio') return '#4a7ab5';
  return '#3d7a5a';
}

function formatTick(t) {
  if (t >= 60) {
    const m = Math.floor(t / 60);
    const s = Math.round(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return Number.isInteger(t) ? `${t}s` : `${t.toFixed(1)}s`;
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
