import * as THREE from 'three';
import { INTERPOLATION } from '../timeline/types.js';
import { sampleMotionBag } from '../motion/sampleTracks.js';
import { motionKeyFromObject, asMotionKeyValue } from '../motion/motionKeyValue.js';
import {
  presenceEndSec,
  presenceInSec,
  presenceOutSec,
  samplePresenceMotion,
  supportsPresenceClip,
} from '../timeline/presenceClip.js';
import { aimPanTilt } from './fixtureRig.js';
import { asFixtureKeyValue, emptyFixtureKeyValue } from './fixtureKeyValue.js';

/** Aim slightly above feet (chest). */
const AIM_Y_OFFSET = 1.15;
/** Max gap between follow samples (seconds) — denser only when motion keys are sparse. */
const FOLLOW_MAX_GAP_SEC = 1.0;
const DEFAULT_FOLLOW_DIM = 0.85;
const MAX_FOLLOW_KEYS = 40;

const TIME_TOK = '([0-9]+(?:\\.[0-9]+)?\\s*분(?:\\s*[0-9]+(?:\\.[0-9]+)?\\s*초)?|[0-9]+(?:\\.[0-9]+)?\\s*초)';

/**
 * @typedef {{ id: string, name: string, trackId: string, object: import('three').Object3D }} FollowMotionRef
 * @typedef {{ kind: 'follow' | 'hold' | 'off', fromSec: number, toSec: number }} FollowPhase
 * @typedef {{
 *   ok: true,
 *   motion: FollowMotionRef,
 *   phases: FollowPhase[],
 *   summary: string,
 *   windowStart: number,
 *   windowEnd: number,
 * } | { ok: false, error: string }} FollowParseResult
 */

/**
 * @param {string} prompt
 * @param {{
 *   engine: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   motions: FollowMotionRef[],
 * }} ctx
 * @returns {FollowParseResult}
 */
export function buildFixtureFollowDraft(prompt, ctx) {
  const text = String(prompt || '').trim();
  if (!text) return { ok: false, error: '문장을 입력하세요.' };

  const motions = (ctx.motions || []).filter((m) => m?.name && m?.trackId);
  if (!motions.length) return { ok: false, error: '캐릭터/스테이지 트랙이 없습니다.' };

  const motion = resolveMotionMention(text, motions);
  if (!motion) {
    return {
      ok: false,
      error: '@캐릭터이름 으로 트랙을 지정하세요. (예: @주인공 따라가줘)',
    };
  }

  const range = motionTimeRange(ctx.engine, motion, text);
  const phases = parseFollowPhases(text, range);
  if (!phases.length) {
    return {
      ok: false,
      error: '「따라가」「머무르다」「사라져」 등 동작을 넣어 주세요.',
    };
  }

  const labels = { follow: '따라가기', hold: '머물기', off: '끄기' };
  return {
    ok: true,
    motion,
    phases,
    windowStart: phases[0].fromSec,
    windowEnd: phases[phases.length - 1].toSec,
    summary: [
      `@${motion.name}`,
      ...phases.map((p) => `${labels[p.kind]} ${fmtSec(p.fromSec)}→${fmtSec(p.toSec)}`),
    ].join(' · '),
  };
}

/**
 * @param {{
 *   engine: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   fixtures: import('./FixtureDirector.js').FixtureDirector,
 *   draft: Extract<FollowParseResult, { ok: true }>,
 *   fids: number[],
 *   clearExisting?: boolean,
 *   prompt?: string,
 * }} opts
 */
export function bakeFixtureFollowDraft(opts) {
  const { engine, fixtures, draft, fids } = opts;
  const promptText = String(opts.prompt || '').trim() || null;
  const list = [...new Set((fids || []).map(Number).filter((n) => Number.isFinite(n)))];
  if (!list.length) return { ok: false, error: 'Fixture를 먼저 선택하세요.' };
  if (!draft?.ok) return { ok: false, error: draft?.error || '초안이 없습니다.' };

  fixtures.ensureRig();
  const root = fixtures.fxEngine.root;
  if (!root) return { ok: false, error: 'Fixture 리그가 없습니다.' };
  root.updateWorldMatrix(true, true);

  const motionTrack = engine.getTrack(draft.motion.trackId);
  if (!motionTrack) return { ok: false, error: '대상 모션 트랙을 찾을 수 없습니다.' };

  const motionKeys = motionTrack.keys?.list?.() || [];
  if (!motionKeys.length) {
    return {
      ok: false,
      error: `@${draft.motion.name} 트랙에 모션 키가 없습니다. 캐릭터 패턴/키를 먼저 만든 뒤 다시 적용하세요.`,
    };
  }

  const motionObject = draft.motion.object;
  const fallback = motionKeyFromObject(motionObject);
  const feetY = motionObject.position.y;
  /** @param {number} t */
  const sampleMot = (t) => {
    if (motionTrack.presenceClip && supportsPresenceClip(motionTrack)) {
      return samplePresenceMotion(
        motionTrack.keys,
        motionTrack.presenceClip,
        t,
        fallback,
        feetY,
      );
    }
    return sampleMotionBag(motionTrack.keys, t, fallback);
  };

  let keyCount = 0;
  let trackCount = 0;

  for (const fid of list) {
    const ch = fixtures.ensureAiTrackForFid(fid);
    if (!ch) continue;
    const aiTrackId = ch.aiTrackId;
    const fxTrack = engine.getTrack(aiTrackId);
    if (!fxTrack) continue;
    const f = fixtures.fxEngine.getFixture(fid);
    if (!f?.obj?.grp) continue;

    trackCount += 1;
    const live = fixtures.liveBagForFid(fid) || emptyFixtureKeyValue();
    const followDim = live.dim > 0.05 ? live.dim : DEFAULT_FOLLOW_DIM;
    const base = asFixtureKeyValue({
      ...live,
      dim: followDim,
      zoom: live.zoom >= 5 ? live.zoom : 16,
    });

    // AI track stays locked for the user; bake is the only writer
    fxTrack.locked = false;

    // AI track: always clear existing keys before re-bake
    for (const kf of [...fxTrack.keys.list()]) {
      engine.removeKeyframe(aiTrackId, kf.id);
    }
    if (promptText) fxTrack.fixtureFollowPrompt = promptText;

    const fromLocal = [
      f.obj.grp.position.x,
      f.obj.grp.position.y,
      f.obj.grp.position.z,
    ];
    /** @type {{ pan: number, tilt: number } | null} */
    let lastAim = null;
    let lastPan = base.pan;

    for (const phase of draft.phases) {
      if (phase.kind === 'follow') {
        const times = followSampleTimes(
          phase.fromSec,
          phase.toSec,
          motionKeys,
          engine.fps || 30,
        );
        for (const t of times) {
          const bagM = sampleMot(t);
          const hasPos = Array.isArray(bagM.position) && bagM.position.length >= 3;
          const outside = bagM.visible === false && (bagM.opacity ?? 0) <= 0.001;
          let pan = lastAim?.pan ?? base.pan;
          let tilt = lastAim?.tilt ?? base.tilt;
          const dim = followDim;

          if (hasPos && !outside) {
            const targetLocal = motionPosToRigLocal(
              root,
              motionObject,
              bagM.position,
              AIM_Y_OFFSET,
            );
            const aim = aimPanTilt(fromLocal, targetLocal);
            pan = unwrapPan(lastPan, aim.pan);
            tilt = clampTilt(aim.tilt);
            lastAim = { pan, tilt };
            lastPan = pan;
          } else if (!lastAim) {
            const seed = seedMotionBag(motionKeys, fallback, t);
            if (seed) {
              const targetLocal = motionPosToRigLocal(
                root,
                motionObject,
                seed.position,
                AIM_Y_OFFSET,
              );
              const aim = aimPanTilt(fromLocal, targetLocal);
              pan = unwrapPan(lastPan, aim.pan);
              tilt = clampTilt(aim.tilt);
              lastAim = { pan, tilt };
              lastPan = pan;
            }
          }

          engine.addKeyframe(
            aiTrackId,
            t,
            asFixtureKeyValue({ ...base, pan, tilt, dim }),
            INTERPOLATION.SMOOTH,
          );
          keyCount += 1;
        }
      } else if (phase.kind === 'hold') {
        if (!lastAim) continue;
        const pan = lastAim.pan;
        const tilt = lastAim.tilt;
        for (const t of uniqueTimes([phase.fromSec, phase.toSec], engine.fps || 30)) {
          engine.addKeyframe(
            aiTrackId,
            t,
            asFixtureKeyValue({ ...base, pan, tilt, dim: followDim }),
            INTERPOLATION.SMOOTH,
          );
          keyCount += 1;
        }
        lastPan = pan;
      } else if (phase.kind === 'off') {
        const pan = lastAim?.pan ?? base.pan;
        const tilt = lastAim?.tilt ?? base.tilt;
        for (const [t, dim] of [
          [phase.fromSec, lastAim ? followDim : 0],
          [phase.toSec, 0],
        ]) {
          engine.addKeyframe(
            aiTrackId,
            t,
            asFixtureKeyValue({ ...base, pan, tilt, dim }),
            INTERPOLATION.SMOOTH,
          );
          keyCount += 1;
        }
      }
    }

    fxTrack.locked = true;
  }

  if (!trackCount) return { ok: false, error: '기록할 Fixture 트랙을 만들지 못했습니다.' };
  if (!keyCount) return { ok: false, error: '키가 생성되지 않았습니다.' };
  fixtures.apply(engine.playheadSec);
  return { ok: true, keyCount, trackCount };
}

/**
 * @param {import('../timeline/TimelineEngine.js').TimelineEngine} engine
 * @param {FollowMotionRef} motion
 * @param {string} prompt
 */
function motionTimeRange(engine, motion, prompt) {
  const durationSec = Math.max(1, Number(engine?.durationSec) || 180);
  const track = engine?.getTrack?.(motion.trackId);
  let bodyIn = 0;
  let bodyOut = durationSec;
  let startSec = 0;
  let endSec = durationSec;

  if (track?.presenceClip && supportsPresenceClip(track)) {
    startSec = track.presenceClip.startSec;
    bodyIn = presenceInSec(track.presenceClip);
    bodyOut = Math.max(bodyIn + 0.1, presenceOutSec(track.presenceClip));
    endSec = presenceEndSec(track.presenceClip);
  } else if (track?.keys?.length) {
    const keys = track.keys.list();
    bodyIn = keys[0].timeSec;
    bodyOut = Math.max(bodyIn + 0.1, keys[keys.length - 1].timeSec);
    startSec = bodyIn;
    endSec = bodyOut;
  }

  // 「시작부터 퇴장까지」→ presence 전체(등장~퇴장 리드 포함)
  if (/(시작|등장)\s*부터/.test(prompt) && /(퇴장|끝)\s*까지/.test(prompt)) {
    return { bodyIn: startSec, bodyOut: endSec, startSec, endSec, durationSec };
  }
  return { bodyIn, bodyOut, startSec, endSec, durationSec };
}

/**
 * @param {string} text
 * @param {{ bodyIn: number, bodyOut: number, startSec: number, endSec: number, durationSec: number }} range
 * @returns {FollowPhase[]}
 */
function parseFollowPhases(text, range) {
  /** @type {FollowPhase[]} */
  const follows = [];
  const t = text;

  const followWinRe = new RegExp(
    `${TIME_TOK}\\s*부터\\s*${TIME_TOK}\\s*까지\\s*(?:따라|비추|추적)`,
    'giu',
  );
  let m;
  while ((m = followWinRe.exec(t))) {
    const a = parseKoreanTimeSpan(m[1]);
    const b = parseKoreanTimeSpan(m[2]);
    if (a >= 0 && b > a) follows.push({ kind: 'follow', fromSec: a, toSec: b });
  }

  if (/(시작|등장)\s*부터\s*(퇴장|끝)\s*까지\s*(?:따라|비추|추적)/u.test(t)) {
    follows.push({ kind: 'follow', fromSec: range.bodyIn, toSec: range.bodyOut });
  }

  const followFromRe = new RegExp(`${TIME_TOK}\\s*부터\\s*(?:따라|비추|추적)`, 'giu');
  while ((m = followFromRe.exec(t))) {
    const window = t.slice(m.index, m.index + m[0].length + 12);
    if (new RegExp(`${TIME_TOK}\\s*부터\\s*${TIME_TOK}\\s*까지`).test(window)) continue;
    const a = parseKoreanTimeSpan(m[1]);
    if (a >= 0) {
      follows.push({
        kind: 'follow',
        fromSec: a,
        toSec: Math.max(a + 0.5, range.bodyOut),
      });
    }
  }

  if (!follows.length && /따라(?:가|다녀|다)|비춰|추적|follow/i.test(t)) {
    // 등장 리드(start)부터 퇴장 끝까지 — body만 쓰면 초반에 키가 없어 조명이 늦게 켜짐
    follows.push({ kind: 'follow', fromSec: range.startSec, toSec: range.endSec });
  }

  follows.sort((a, b) => a.fromSec - b.fromSec);
  /** @type {FollowPhase[]} */
  const out = [];
  for (const p of follows) {
    if (out.some((q) => !(p.toSec <= q.fromSec || p.fromSec >= q.toSec))) continue;
    out.push({ ...p });
  }

  let cursor = out.length ? out[out.length - 1].toSec : range.bodyIn;

  const holdRe = new RegExp(
    `${TIME_TOK}\\s*까지\\s*(?:머물|머무르|대기|홀드|hold)`,
    'giu',
  );
  while ((m = holdRe.exec(t))) {
    // skip 「T까지 따라」 absolute end mistaken as hold — require 머물/대기 keyword (already in re)
    const until = parseKoreanTimeSpan(m[1]);
    if (until > cursor + 1e-3) {
      out.push({ kind: 'hold', fromSec: cursor, toSec: until });
      cursor = until;
    }
  }

  if (/사라(?:져|지)|꺼져|오프|꺼\s*줘|소등/i.test(t)) {
    out.push({ kind: 'off', fromSec: cursor, toSec: cursor + 0.5 });
  }

  return out;
}

/**
 * @param {string} text
 * @param {FollowMotionRef[]} motions
 */
function resolveMotionMention(text, motions) {
  const byLen = [...motions].sort((a, b) => String(b.name).length - String(a.name).length);
  let best = null;
  let bestLen = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@') continue;
    const after = text.slice(i + 1);
    for (const mot of byLen) {
      const label = String(mot.name);
      if (!label) continue;
      if (after.startsWith(label) && label.length > bestLen) {
        best = mot;
        bestLen = label.length;
        continue;
      }
      const mTok = after.match(/^([^\s@.,，]+)/u);
      if (!mTok) continue;
      let tok = mTok[1].replace(/(에서|으로|까지|부터|에게|을|를|이|가|은|는)$/u, '');
      if (tok === label && label.length > bestLen) {
        best = mot;
        bestLen = label.length;
      }
    }
  }
  return best;
}

/** @param {string} span */
function parseKoreanTimeSpan(span) {
  const s = String(span || '').trim();
  if (!s) return -1;
  const minSec = s.match(/([0-9]+(?:\.[0-9]+)?)\s*분\s*([0-9]+(?:\.[0-9]+)?)\s*초/);
  if (minSec) {
    const min = Number(minSec[1]);
    const sec = Number(minSec[2]);
    if (Number.isFinite(min) && Number.isFinite(sec)) return min * 60 + sec;
  }
  const onlyMin = s.match(/([0-9]+(?:\.[0-9]+)?)\s*분/);
  if (onlyMin) {
    const min = Number(onlyMin[1]);
    if (Number.isFinite(min)) return min * 60;
  }
  const onlySec = s.match(/([0-9]+(?:\.[0-9]+)?)\s*초/);
  if (onlySec) {
    const sec = Number(onlySec[1]);
    if (Number.isFinite(sec)) return sec;
  }
  return -1;
}

/**
 * Prefer motion key at/after t, else last key, for pre-roll aim.
 * @param {Array<{ timeSec: number, value: any }>} motionKeys
 * @param {import('../motion/motionKeyValue.js').MotionKeyValue} fallback
 * @param {number} t
 */
function seedMotionBag(motionKeys, fallback, t) {
  if (!motionKeys?.length) return asMotionKeyValue(fallback);
  let best = motionKeys[0];
  for (const kf of motionKeys) {
    if (kf.timeSec + 1e-6 >= t) {
      best = kf;
      break;
    }
    best = kf;
  }
  return asMotionKeyValue(best.value, fallback);
}

/** @param {number[]} times @param {number} fps */
function uniqueTimes(times, fps) {
  const snap = (t) => Math.round(Math.max(0, t) * fps) / fps;
  return [...new Set(times.map(snap))].sort((a, b) => a - b);
}

/**
 * Prefer motion key times; fill gaps so pan/tilt can interpolate smoothly.
 * @param {number} fromSec
 * @param {number} toSec
 * @param {Array<{ timeSec: number }>} motionKeys
 * @param {number} fps
 */
function followSampleTimes(fromSec, toSec, motionKeys, fps = 30) {
  const start = Math.max(0, fromSec);
  const end = Math.max(start, toSec);
  const snap = (t) => Math.round(t * fps) / fps;
  /** @type {Set<number>} */
  const set = new Set([snap(start), snap(end)]);
  for (const kf of motionKeys || []) {
    const t = Number(kf.timeSec);
    if (!Number.isFinite(t)) continue;
    if (t >= start - 1e-4 && t <= end + 1e-4) set.add(snap(t));
  }
  let sorted = [...set].sort((a, b) => a - b);
  /** @type {number[]} */
  const filled = [];
  for (let i = 0; i < sorted.length; i++) {
    filled.push(sorted[i]);
    if (i >= sorted.length - 1) continue;
    const a = sorted[i];
    const b = sorted[i + 1];
    const gap = b - a;
    if (gap <= FOLLOW_MAX_GAP_SEC + 1e-6) continue;
    const n = Math.min(8, Math.ceil(gap / FOLLOW_MAX_GAP_SEC));
    for (let k = 1; k < n; k++) filled.push(snap(a + (gap * k) / n));
  }
  sorted = [...new Set(filled)].sort((a, b) => a - b);
  if (sorted.length <= MAX_FOLLOW_KEYS) return sorted;
  const out = [];
  const step = (sorted.length - 1) / (MAX_FOLLOW_KEYS - 1);
  for (let i = 0; i < MAX_FOLLOW_KEYS; i++) {
    out.push(sorted[Math.round(i * step)]);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/**
 * Motion bag position is parent-local → fixture-rig local for aimPanTilt.
 * @param {import('three').Object3D} root
 * @param {import('three').Object3D} motionObject
 * @param {number[]} position
 * @param {number} yOff
 */
function motionPosToRigLocal(root, motionObject, position, yOff) {
  const world = new THREE.Vector3(
    Number(position[0]) || 0,
    (Number(position[1]) || 0) + yOff,
    Number(position[2]) || 0,
  );
  const parent = motionObject?.parent;
  if (parent) {
    parent.updateWorldMatrix(true, false);
    parent.localToWorld(world);
  }
  root.updateWorldMatrix(true, false);
  root.worldToLocal(world);
  return [world.x, world.y, world.z];
}

function unwrapPan(prev, next) {
  let p = next;
  while (p - prev > 180) p -= 360;
  while (p - prev < -180) p += 360;
  return Math.max(-270, Math.min(270, p));
}

function clampTilt(t) {
  return Math.max(-120, Math.min(120, Number(t) || 0));
}

function fmtSec(s) {
  const n = Number(s) || 0;
  if (n >= 60) {
    const min = Math.floor(n / 60);
    const r = n - min * 60;
    return r < 0.05 ? `${min}분` : `${min}분${r.toFixed(r % 1 ? 1 : 0)}초`;
  }
  return `${n.toFixed(n % 1 ? 1 : 0)}초`;
}
