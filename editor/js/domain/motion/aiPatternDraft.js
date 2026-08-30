import { SEGMENT_KIND, normalizeSegment, newSegmentId, normalizeRotYDeg } from './groupSegments.js';
import { ensureMotionAnim } from './motionAnim.js';
import { AI_PATTERN_DEFAULT_DUR } from './aiPatternDefaults.js';

/**
 * @typedef {{
 *   startTime: number,
 *   fromX: number,
 *   fromZ: number,
 *   fromRotY: number,
 *   opacity: number,
 *   fromPresetId?: string | null,
 *   startConfigured: boolean,
 *   segments: ReturnType<typeof normalizeSegment>[],
 * }} AiPatternDraft
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   x: number,
 *   z: number,
 *   rotY?: number,
 *   opacity?: number,
 * }} AiPresetRef
 */

/**
 * Apply a draft onto MotionItem.anim (replaces segments).
 * @param {import('./MotionDirector.js').MotionItem} item
 * @param {AiPatternDraft} draft
 */
export function applyAiPatternDraftToMotion(item, draft) {
  const anim = ensureMotionAnim(item);
  anim.startTime = Number(draft.startTime) || 0;
  anim.fromX = Number(draft.fromX) || 0;
  anim.fromZ = Number(draft.fromZ) || 0;
  anim.fromRotY = normalizeRotYDeg(Number(draft.fromRotY) || 0);
  anim.opacity = Number.isFinite(Number(draft.opacity)) ? Number(draft.opacity) : 1;
  anim.fromPresetId = draft.fromPresetId ?? null;
  anim.startConfigured = true;
  anim.segments = (draft.segments || []).map((s) => normalizeSegment({
    ...s,
    id: s.id || newSegmentId(),
    formation: 'line',
    formationSpacing: 1,
  }, {
    formation: 'line',
    formationSpacing: 1,
    toX: anim.fromX,
    toZ: anim.fromZ + 5,
  }));
  anim.selectedSegmentId = anim.segments[0]?.id ?? null;
  return anim;
}

/**
 * Local Korean/English NL → pattern draft (no network).
 * Uses position presets by label when mentioned.
 *
 * @param {string} prompt
 * @param {{
 *   presets?: AiPresetRef[],
 *   current?: { x?: number, z?: number, rotY?: number, opacity?: number, startTime?: number },
 * }} [ctx]
 * @returns {{ ok: true, draft: AiPatternDraft, summary: string, source: 'local' }
 *   | { ok: false, error: string }}
 */
const DEFAULT_DUR = { ...AI_PATTERN_DEFAULT_DUR };

export function parsePatternPromptLocal(prompt, ctx = {}) {
  const text = String(prompt || '').trim();
  if (!text) return { ok: false, error: '설명을 입력하세요.' };

  const presets = Array.isArray(ctx.presets) ? ctx.presets : [];
  const cur = ctx.current || {};
  const pattern = ctx.pattern || null;
  const defs = { ...DEFAULT_DUR, ...(ctx.defaultDurations || {}) };
  const intents = parsePromptIntents(text);
  const startTime = pickStartTime(text, cur.startTime ?? pattern?.startTime);

  const at = resolveAtPresets(text, presets);
  if (at.enter) intents.enter = true;
  if (at.center) intents.center = true;
  if (at.exit) intents.exit = true;

  const enterPreset = at.enter || findPreset(presets, text, [
    '등장위치', '등장', '입구', '입장', 'enter', 'entrance', '왼쪽', '좌측', 'left',
  ]) || findPresetByKeyword(presets, ['등장', '등장위치', '입구', '입장', 'enter']);

  const centerPreset = at.center || findPreset(presets, text, [
    '중앙', '가운데', '센터', 'center', '무대중앙',
  ]) || findPresetByKeyword(presets, ['중앙', '가운데', 'center']);

  const exitPreset = at.exit || findPreset(presets, text, [
    '퇴장', '퇴장위치', '출구', 'exit', '오른쪽', '우측', 'right',
  ]) || findPresetByKeyword(presets, ['퇴장', '출구', 'exit']);

  // 「1분까지 대기」= 절대 시각(타임라인 1:00)까지 대기 — duration이 아님
  const holdUntilSec = pickHoldUntilAbsoluteSec(text);
  const holdSecRaw = holdUntilSec > 0
    ? 0
    : (pickHoldDuration(text) || (intents.hold ? defs.hold : 0));
  const moveSec = pickMoveDuration(text) || defs.move;
  const rotateSec = pickRotateDuration(text) || defs.rotate;
  const exitSec = pickExitDuration(text) || defs.exit;

  /** @type {AiPresetRef} */
  let startPose;
  if (intents.enter) {
    startPose = enterPreset || { id: '', label: '등장', x: -40, z: 50, rotY: 0, opacity: 0 };
  } else if (pattern?.startConfigured && pattern.fromPresetId) {
    const linked = presets.find((p) => p.id === pattern.fromPresetId);
    startPose = linked || {
      id: '',
      label: '시작',
      x: Number(pattern.fromX ?? cur.x) || 0,
      z: Number(pattern.fromZ ?? cur.z) || 50,
      rotY: Number(pattern.fromRotY ?? cur.rotY) || 0,
      opacity: pattern.opacity ?? 1,
    };
  } else {
    startPose = {
      id: '',
      label: '현재',
      x: Number(cur.x) || 0,
      z: Number(cur.z) || 50,
      rotY: Number(cur.rotY) || 0,
      opacity: 1,
    };
  }

  /** @type {ReturnType<typeof normalizeSegment>[]} */
  const segments = [];

  let lastX = Number(startPose.x) || 0;
  let lastZ = Number(startPose.z) || 0;
  let lastRot = normalizeRotYDeg(Number(startPose.rotY) || 0);

  const centerTarget = centerPreset || {
    id: '', label: '중앙', x: 0, z: 30, rotY: lastRot, opacity: 1,
  };

  const segDefaults = { formation: 'line', formationSpacing: 1 };

  /** @param {number} ax @param {number} az @param {number} rot @param {number} dur @param {string|null} presetId */
  function pushMove(ax, az, rot, dur, presetId = null) {
    segments.push(normalizeSegment({
      id: newSegmentId(),
      kind: SEGMENT_KIND.move,
      duration: Math.max(0.5, dur),
      anchorX: ax,
      anchorZ: az,
      toRotY: normalizeRotYDeg(rot),
      anchorPresetId: presetId,
      easing: 'smooth',
      formation: 'line',
      formationSpacing: 1,
    }, segDefaults));
    lastX = ax;
    lastZ = az;
    lastRot = normalizeRotYDeg(rot);
  }

  /** @param {number} rot @param {number} dur */
  function pushRotateInPlace(rot, dur) {
    const target = normalizeRotYDeg(rot);
    if (Math.abs(target - lastRot) < 0.01) return;
    pushMove(lastX, lastZ, target, dur, null);
  }

  /** @param {number} dur */
  function pushHold(dur) {
    segments.push(normalizeSegment({
      id: newSegmentId(),
      kind: SEGMENT_KIND.hold,
      duration: Math.max(0.5, dur),
      anchorX: lastX,
      anchorZ: lastZ,
      toRotY: lastRot,
      easing: 'linear',
      formation: 'line',
      formationSpacing: 1,
    }, segDefaults));
  }

  const needCenter = intents.center || intents.enter
    || /중앙(?:으로|에|에서)/i.test(text)
    || (intents.move && centerPreset);

  // 「중앙에서 회전」— 도착 후 제자리 회전 (이동·회전 분리)
  const rotateAtCenter = intents.rotate && (
    intents.center || /중앙(?:에|에서)/i.test(text)
  );

  if (needCenter) {
    const ax = Number(centerTarget.x);
    const az = Number(centerTarget.z);
    const posChange = Math.abs(ax - lastX) > 0.01 || Math.abs(az - lastZ) > 0.01;
    const moveRot = rotateAtCenter
      ? lastRot
      : (intents.rotate
        ? pickTargetRotY(text, lastRot, centerTarget)
        : normalizeRotYDeg(Number(centerTarget.rotY) || lastRot));
    if (posChange || intents.center || intents.enter) {
      pushMove(ax, az, moveRot, moveSec, centerTarget.id || null);
    }
  }

  if (rotateAtCenter) {
    pushRotateInPlace(pickTargetRotY(text, lastRot, centerTarget), rotateSec);
  } else if (intents.rotate && !needCenter) {
    pushRotateInPlace(pickTargetRotY(text, lastRot, centerTarget), rotateSec);
  }

  let holdSec = holdSecRaw;
  if (holdUntilSec > 0) {
    // 시작+이동(+회전) 이후 → 절대 시각(예: 1분)까지 남은 시간을 대기로
    let elapsed = startTime;
    for (const s of segments) elapsed += Number(s.duration) || 0;
    holdSec = Math.max(0.5, holdUntilSec - elapsed);
  }
  if (intents.hold || holdSec > 0 || holdUntilSec > 0) {
    pushHold(holdSec > 0 ? holdSec : defs.hold);
  }

  if (intents.exit) {
    const ex = exitPreset || {
      id: '', label: '퇴장', x: lastX + 40, z: lastZ, rotY: lastRot, opacity: 0,
    };
    segments.push(normalizeSegment({
      id: newSegmentId(),
      kind: SEGMENT_KIND.exit,
      duration: Math.max(0.5, exitSec),
      anchorX: Number(ex.x),
      anchorZ: Number(ex.z),
      toRotY: normalizeRotYDeg(Number(ex.rotY) || lastRot),
      anchorPresetId: ex.id || null,
      easing: 'smooth',
      formation: 'line',
      formationSpacing: 1,
    }, segDefaults));
  }

  if (!segments.length) {
    const c = centerPreset || { x: 0, z: 30, rotY: 0, id: '', label: '중앙' };
    const e = exitPreset || { x: 40, z: 50, rotY: 0, id: '', label: '퇴장' };
    pushMove(Number(c.x), Number(c.z), Number(c.rotY) || 0, defs.move, c.id || null);
    pushHold(defs.hold);
    segments.push(normalizeSegment({
      id: newSegmentId(),
      kind: SEGMENT_KIND.exit,
      duration: defs.exit,
      anchorX: Number(e.x),
      anchorZ: Number(e.z),
      toRotY: 0,
      anchorPresetId: e.id || null,
      easing: 'smooth',
    }, segDefaults));
    if (intents.enter) {
      startPose = enterPreset || {
        id: '', label: '등장', x: -40, z: 50, rotY: 0, opacity: 0,
      };
    }
  }

  /** @type {AiPatternDraft} */
  const draft = {
    startTime,
    fromX: Number(startPose.x) || 0,
    fromZ: Number(startPose.z) || 0,
    fromRotY: normalizeRotYDeg(Number(startPose.rotY) || 0),
    opacity: intents.enter ? 0 : 1,
    fromPresetId: startPose.id || null,
    startConfigured: true,
    segments,
  };

  const summary = summarizeDraft(draft, presets);
  return { ok: true, draft, summary, source: 'local' };
}

/**
 * @ 프리셋 멘션 파싱 — @등장에서 @중앙으로 @퇴장
 * @param {string} text
 * @param {AiPresetRef[]} presets
 * @returns {{ enter: AiPresetRef | null, center: AiPresetRef | null, exit: AiPresetRef | null, ordered: AiPresetRef[] }}
 */
export function resolveAtPresets(text, presets) {
  /** @type {{ preset: AiPresetRef, index: number }[]} */
  const tokens = [];
  const re = /@([^\s@.,]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const p = matchPresetByLabel(presets, m[1]);
    if (p) tokens.push({ preset: p, index: m.index });
  }

  /** @type {AiPresetRef | null} */
  let enter = null;
  /** @type {AiPresetRef | null} */
  let center = null;
  /** @type {AiPresetRef | null} */
  let exit = null;

  for (const t of tokens) {
    const tail = text.slice(t.index, t.index + 48);
    if (/에서|부터/.test(tail)) {
      if (!enter) enter = t.preset;
      else if (!center) center = t.preset;
    } else if (/으로\s*(?:퇴|나가)|(?:퇴장|나가)/.test(tail)) {
      exit = t.preset;
    } else if (/으로|까지/.test(tail)) {
      center = t.preset;
    }
  }

  if (tokens.length >= 1 && !enter) {
    const tail = text.slice(tokens[0].index, tokens[0].index + 24);
    if (/에서|부터/.test(tail)) enter = tokens[0].preset;
  }
  if (tokens.length >= 2 && !center) {
    const mid = tokens.find((t, i) => i > 0 && t.preset.id !== enter?.id);
    if (mid) center = mid.preset;
  }
  if (tokens.length >= 2 && !exit && /퇴장|exit|나가/.test(text)) {
    const last = tokens[tokens.length - 1].preset;
    if (last.id !== center?.id || tokens.length >= 3) exit = last;
  }

  return {
    enter,
    center,
    exit,
    ordered: tokens.map((t) => t.preset),
  };
}

/**
 * @param {AiPresetRef[]} presets
 * @param {string} label
 * @returns {AiPresetRef | null}
 */
export function matchPresetByLabel(presets, label) {
  const q = String(label || '').trim();
  if (!q) return null;
  // `@등장에서` / `@중앙으로` — 조사 제거 후 라벨 매칭
  const stripped = q.replace(/(에서|으로|까지|부터|에게)$/u, '').replace(/(에|로)$/u, '');
  const candidates = stripped && stripped !== q ? [q, stripped] : [q];
  for (const c of candidates) {
    const exact = presets.find((p) => p.label === c);
    if (exact) return exact;
    const lower = c.toLowerCase();
    const hit = presets.find((p) => p.label.toLowerCase() === lower)
      ?? presets.find((p) => p.label.toLowerCase().startsWith(lower));
    if (hit) return hit;
  }
  return null;
}

/**
 * LLM 초안이 프롬프트 의도(퇴장·이동·회전 등)를 반영했는지 검사.
 * @param {string} prompt
 * @param {AiPatternDraft} draft
 */
export function draftMatchesPrompt(prompt, draft) {
  const intents = parsePromptIntents(prompt);
  const segs = draft?.segments || [];
  if (!segs.length) return false;

  const kinds = new Set(segs.map((s) => s.kind));
  if (intents.exit && !kinds.has(SEGMENT_KIND.exit)) return false;

  if (intents.hold && !kinds.has(SEGMENT_KIND.hold)) return false;

  if ((intents.center || intents.move || intents.enter) && !kinds.has(SEGMENT_KIND.move)) {
    return false;
  }

  if (intents.rotate) {
    const fromR = normalizeRotYDeg(draft.fromRotY ?? 0);
    let rot = fromR;
    let changed = false;
    for (const s of segs) {
      if (Math.abs(normalizeRotYDeg(s.toRotY) - rot) > 0.01) {
        changed = true;
        break;
      }
      rot = normalizeRotYDeg(s.toRotY);
    }
    if (!changed) return false;
  }

  return true;
}

/** @param {string} text */
function parsePromptIntents(text) {
  const t = text.toLowerCase();
  return {
    enter: /등장(?:위치)?|입장|들어와|들어|나타|enter|appear|페이드.?인|왼쪽\s*에서/i.test(t),
    exit: /퇴장(?:위치|해)?|나가|exit|페이드.?아웃|사라/i.test(t),
    center: /중앙|가운데|센터|center|무대\s*중앙/i.test(t),
    move: /이동|위치|가서|향해|move|walk|걸어|와서|오다|진입|들어가|올라|으로/i.test(t),
    hold: /대기|머무르|머물|홀드|hold|기다리|잠시/i.test(t),
    rotate: /회전|돌아|돌려|rotate|turn|빙글|\d+\s*도/i.test(t),
  };
}

/**
 * @param {string} text
 * @param {number} baseRot
 * @param {{ rotY?: number }} [preset]
 */
function pickTargetRotY(text, baseRot, preset = {}) {
  const presetRot = Number(preset.rotY);
  // 「90도 회전」「회전 90도」— 절대 목표 각도(현재+Δ)
  const abs = text.match(/([0-9]+)\s*도\s*(?:회전|돌)/i)
    || text.match(/(?:회전|돌)[^\d]{0,8}([0-9]+)\s*도/i);
  if (abs) return normalizeRotYDeg(baseRot + Number(abs[1]));
  const rel = text.match(/([0-9]+)\s*도/);
  if (rel) return normalizeRotYDeg(baseRot + Number(rel[1]));
  if (/반\s*시계|counter.?clockwise|ccw/i.test(text)) return normalizeRotYDeg(baseRot + 90);
  if (/시계\s*방향|clockwise|\bcw\b/i.test(text)) return normalizeRotYDeg(baseRot - 90);
  if (/180|뒤돌|반대/i.test(text)) return normalizeRotYDeg(baseRot + 180);
  if (Number.isFinite(presetRot) && presetRot !== 0 && /중앙|center/i.test(text)) {
    return normalizeRotYDeg(presetRot);
  }
  if (/회전|돌아|rotate|turn/i.test(text)) return normalizeRotYDeg(baseRot + 90);
  return normalizeRotYDeg(baseRot);
}

/**
 * 「2분」「30초」「1분 30초」「1분30초」→ 초 단위.
 * @param {string} span
 * @returns {number} 0 if not found
 */
function parseKoreanTimeSpan(span) {
  const s = String(span || '').trim();
  if (!s) return 0;
  // 1분 30초 / 1분30초
  const minSec = s.match(
    /([0-9]+(?:\.[0-9]+)?)\s*분\s*([0-9]+(?:\.[0-9]+)?)\s*초/,
  );
  if (minSec) {
    const m = Number(minSec[1]);
    const sec = Number(minSec[2]);
    if (Number.isFinite(m) && Number.isFinite(sec) && (m > 0 || sec > 0)) {
      return m * 60 + sec;
    }
  }
  const onlyMin = s.match(/([0-9]+(?:\.[0-9]+)?)\s*분/);
  if (onlyMin) {
    const m = Number(onlyMin[1]);
    if (Number.isFinite(m) && m > 0) return m * 60;
  }
  const onlySec = s.match(/([0-9]+(?:\.[0-9]+)?)\s*초/);
  if (onlySec) {
    const sec = Number(onlySec[1]);
    // 「90도」오인 방지 — 매치 직후가 도이면 무시
    const afterIdx = onlySec.index + onlySec[0].length;
    const after = s.slice(afterIdx, afterIdx + 1);
    if (after === '도' || after === '°') return 0;
    if (Number.isFinite(sec) && sec > 0) return sec;
  }
  return 0;
}

const TIME_TOK = '([0-9]+(?:\\.[0-9]+)?\\s*분(?:\\s*[0-9]+(?:\\.[0-9]+)?\\s*초)?|[0-9]+(?:\\.[0-9]+)?\\s*초)';

/**
 * 키워드 앞·뒤에서 분/초 구간을 찾아 초로 변환.
 * 「이동하고 1분까지 대기」처럼 다른 동작의 절대시각을 훔치지 않음.
 * @param {string} text
 * @param {RegExp} keywordRe — 대기|이동|회전|퇴장 등
 */
function pickDurationNearKeyword(text, keywordRe) {
  const t = String(text || '');
  // 「2분 30초간 대기」「10초 동안 이동」— 시간 → 키워드 (「까지」제외)
  const before = new RegExp(
    `${TIME_TOK}\\s*(?:간|동안)\\s*(?:${keywordRe.source})`,
    'i',
  );
  // 「대기 1분」「이동 3초」— 키워드 직후 시간 (하고·까지 건너뛰지 않음)
  const after = new RegExp(
    `(?:${keywordRe.source})(?:\\s*(?:을|를|은|는))?\\s*${TIME_TOK}`,
    'i',
  );
  // 「1분 대기」(간/동안 없음, 까지 아님)
  const tightBefore = new RegExp(
    `${TIME_TOK}\\s*(?:${keywordRe.source})`,
    'i',
  );

  for (const re of [before, after, tightBefore]) {
    const m = re.exec(t);
    if (!m) continue;
    const span = m[1] || '';
    const sec = parseKoreanTimeSpan(span);
    if (sec <= 0) continue;
    // 「1분까지 대기」— 절대 시각이므로 duration으로 쓰지 않음
    const window = t.slice(m.index, m.index + m[0].length + 6);
    if (/까지/.test(window)) continue;
    return sec;
  }
  return 0;
}

/**
 * 「1분까지 대기」「60초까지 기다려」→ 타임라인 절대 초.
 * @param {string} text
 * @returns {number} 0 if none
 */
function pickHoldUntilAbsoluteSec(text) {
  const t = String(text || '');
  const patterns = [
    new RegExp(`${TIME_TOK}\\s*까지\\s*(?:대기|홀드|hold|머물|있|기다)`, 'i'),
    new RegExp(`(?:대기|홀드|hold|머물|기다)[^\\d]{0,10}${TIME_TOK}\\s*까지`, 'i'),
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (!m) continue;
    const sec = parseKoreanTimeSpan(m[1] || '');
    if (sec > 0) return sec;
  }
  return 0;
}

/** @param {string} text */
function pickHoldDuration(text) {
  return pickDurationNearKeyword(text, /대기|홀드|hold|머물/);
}

/** @param {string} text */
function pickMoveDuration(text) {
  return pickDurationNearKeyword(text, /이동|move|걸어/);
}

/** @param {string} text */
function pickRotateDuration(text) {
  return pickDurationNearKeyword(text, /회전|rotate|turn|돌/);
}

/** @param {string} text */
function pickExitDuration(text) {
  return pickDurationNearKeyword(text, /퇴장|exit/);
}

/**
 * Validate / normalize a draft from LLM JSON.
 * @param {any} raw
 * @param {{ presets?: AiPresetRef[] }} [ctx]
 * @returns {{ ok: true, draft: AiPatternDraft, summary: string, source: 'llm' }
 *   | { ok: false, error: string }}
 */
export function normalizeAiPatternDraft(raw, ctx = {}) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'AI 응답이 비어 있습니다.' };
  const presets = ctx.presets || [];
  const segsIn = Array.isArray(raw.segments) ? raw.segments : [];
  if (!segsIn.length) return { ok: false, error: '구간(segments)이 없습니다.' };

  const resolvePresetPose = (presetId, label, fallback) => {
    if (presetId) {
      const p = presets.find((x) => x.id === presetId);
      if (p) return p;
    }
    if (label) {
      const p = findPresetByKeyword(presets, [String(label)]);
      if (p) return p;
    }
    return fallback;
  };

  let fromPreset = resolvePresetPose(raw.fromPresetId, raw.fromPresetLabel, null);
  const draft = {
    startTime: Number(raw.startTime) || 0,
    fromX: fromPreset ? Number(fromPreset.x) : (Number(raw.fromX) || 0),
    fromZ: fromPreset ? Number(fromPreset.z) : (Number(raw.fromZ) || 50),
    fromRotY: normalizeRotYDeg(
      fromPreset ? Number(fromPreset.rotY) || 0 : (Number(raw.fromRotY) || 0),
    ),
    opacity: Number.isFinite(Number(raw.opacity)) ? Number(raw.opacity) : 1,
    fromPresetId: fromPreset?.id ?? raw.fromPresetId ?? null,
    startConfigured: true,
    segments: segsIn.map((s) => {
      const kind = String(s.kind || 'move').toLowerCase();
      const k = kind === 'hold' || kind === 'exit' ? kind : 'move';
      const pose = resolvePresetPose(s.anchorPresetId, s.presetLabel, null);
      return normalizeSegment({
        id: s.id || newSegmentId(),
        kind: k,
        duration: Math.max(0.1, Number(s.duration) || (k === 'hold' ? 2 : 3)),
        anchorX: pose ? Number(pose.x) : Number(s.anchorX) || 0,
        anchorZ: pose ? Number(pose.z) : Number(s.anchorZ) || 0,
        toRotY: normalizeRotYDeg(
          pose ? Number(pose.rotY) || 0 : (Number(s.toRotY) || 0),
        ),
        anchorPresetId: pose?.id ?? s.anchorPresetId ?? null,
        easing: k === 'hold' ? 'linear' : (s.easing === 'linear' ? 'linear' : 'smooth'),
        formation: 'line',
        formationSpacing: 1,
      }, { formation: 'line', formationSpacing: 1 });
    }),
  };

  return {
    ok: true,
    draft,
    summary: summarizeDraft(draft, presets),
    source: 'llm',
  };
}

/** @param {string} text @param {number|undefined} fallback */
function pickStartTime(text, fallback) {
  const t = String(text || '');
  // 「시작 1분 30초」「2분부터」「10초에 시작」「시작 10초」
  const timeTok = '([0-9]+(?:\\.[0-9]+)?\\s*분(?:\\s*[0-9]+(?:\\.[0-9]+)?\\s*초)?|[0-9]+(?:\\.[0-9]+)?\\s*초)';
  const patterns = [
    new RegExp(`(?:시작|start)\\s*${timeTok}`, 'i'),
    new RegExp(`${timeTok}\\s*(?:부터|에\\s*시작)`, 'i'),
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (!m) continue;
    const sec = parseKoreanTimeSpan(m[1]);
    if (sec > 0) return sec;
  }
  // 「시작 10」단위 없음 → 초
  const bare = t.match(/(?:시작|start)\s*([0-9]+(?:\.[0-9]+)?)\b/i);
  if (bare) {
    const n = Number(bare[1]);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
}

/**
 * @param {AiPresetRef[]} presets
 * @param {string} text
 * @param {string[]} keys
 */
function findPreset(presets, text, keys) {
  const lower = text.toLowerCase();
  // 키워드(중앙·등장·퇴장)가 문장에 있을 때만 해당 프리셋 연결
  for (const key of keys) {
    if (!lower.includes(key.toLowerCase())) continue;
    const hit = findPresetByKeyword(presets, [key]);
    if (hit) return hit;
  }
  // 프리셋 라벨 전체가 문장에 있고, keys 와 관련 있을 때만
  const sorted = [...presets].sort(
    (a, b) => (String(b.label || '').length) - (String(a.label || '').length),
  );
  for (const p of sorted) {
    const label = String(p.label || '').toLowerCase();
    if (!label || !lower.includes(label)) continue;
    if (keys.some((k) => {
      const kk = k.toLowerCase();
      return label.includes(kk) || kk.includes(label);
    })) {
      return p;
    }
  }
  return null;
}

/** @param {AiPresetRef[]} presets @param {string[]} keys */
function findPresetByKeyword(presets, keys) {
  for (const p of presets) {
    const label = String(p.label || '').toLowerCase();
    if (keys.some((k) => label.includes(k.toLowerCase()))) return p;
  }
  return null;
}

/** @param {AiPatternDraft} draft @param {AiPresetRef[]} presets */
function summarizeDraft(draft, presets) {
  const labelOf = (id, xy) => {
    const p = id && presets.find((x) => x.id === id);
    if (p) return p.label;
    return `(${Number(xy.x).toFixed(0)}, ${Number(xy.z).toFixed(0)})`;
  };
  const parts = [
    `시작 ${Number(draft.startTime).toFixed(1)}s @ ${labelOf(draft.fromPresetId, { x: draft.fromX, z: draft.fromZ })}`,
  ];
  for (const s of draft.segments) {
    const kind = s.kind === 'hold' ? '대기' : s.kind === 'exit' ? '퇴장' : '이동';
    const rot = Math.abs(Number(s.toRotY)) > 0.01 ? ` Y${Number(s.toRotY).toFixed(0)}°` : '';
    const dest = s.kind === 'hold'
      ? '(제자리)'
      : labelOf(s.anchorPresetId, { x: s.anchorX, z: s.anchorZ });
    parts.push(`${kind} ${Number(s.duration).toFixed(1)}s → ${dest}${rot}`);
  }
  return parts.join(' · ');
}
