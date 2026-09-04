import * as THREE from 'three';
import { INTERPOLATION } from '../timeline/types.js';
import { sampleMotionBag } from '../motion/sampleTracks.js';
import { motionKeyFromObject, asMotionKeyValue } from '../motion/motionKeyValue.js';
import {
  presenceEndSec,
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
/** A last key this dim (or invisible) means the character walked off. */
const EXIT_OPACITY = 0.05;

/**
 * @typedef {{ id: string, name: string, trackId: string, object: import('three').Object3D }} LinkMotionRef
 * @typedef {{ kind: 'follow' | 'exit', fromSec: number, toSec: number }} LinkPhase
 * @typedef {{
 *   ok: true,
 *   motion: LinkMotionRef,
 *   phases: LinkPhase[],
 *   summary: string,
 *   windowStart: number,
 *   windowEnd: number,
 * } | { ok: false, error: string }} LinkDraftResult
 */

/**
 * Build the follow plan for one fixture ↔ character link. The plan is derived
 * entirely from the character's own timing: follow while on stage, fade out
 * over the exit.
 * @param {string} motionTrackId
 * @param {{
 *   engine: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   motions: LinkMotionRef[],
 * }} ctx
 * @returns {LinkDraftResult}
 */
export function buildFixtureLinkDraft(motionTrackId, ctx) {
  const id = String(motionTrackId || '');
  if (!id) return { ok: false, error: '연결할 캐릭터 트랙을 고르세요.' };

  const motion = (ctx.motions || []).find((m) => m?.trackId === id);
  if (!motion) return { ok: false, error: '캐릭터 트랙을 찾을 수 없습니다.' };

  const track = ctx.engine?.getTrack?.(id);
  if (!track) return { ok: false, error: '캐릭터 트랙을 찾을 수 없습니다.' };
  if (!track.keys?.list?.().length) {
    return {
      ok: false,
      error: `${motion.name} 트랙에 모션 키가 없습니다. 캐릭터 패턴/키를 먼저 만드세요.`,
    };
  }

  const range = motionTimeRange(track, ctx.engine);
  /** @type {LinkPhase[]} */
  const phases = [{ kind: 'follow', fromSec: range.startSec, toSec: range.bodyOut }];
  if (range.exit) {
    phases.push({ kind: 'exit', fromSec: range.exit.fromSec, toSec: range.exit.toSec });
  }

  const last = phases[phases.length - 1];
  return {
    ok: true,
    motion,
    phases,
    windowStart: phases[0].fromSec,
    windowEnd: last.toSec,
    summary: [
      motion.name,
      `따라가기 ${fmtSec(phases[0].fromSec)}→${fmtSec(phases[0].toSec)}`,
      ...(range.exit ? [`퇴장 소등 ${fmtSec(last.fromSec)}→${fmtSec(last.toSec)}`] : []),
    ].join(' · '),
  };
}

/**
 * @param {{
 *   engine: import('../timeline/TimelineEngine.js').TimelineEngine,
 *   fixtures: import('./FixtureDirector.js').FixtureDirector,
 *   draft: Extract<LinkDraftResult, { ok: true }>,
 *   fids: number[],
 * }} opts
 */
export function bakeFixtureLinkDraft(opts) {
  const { engine, fixtures, draft, fids } = opts;
  const list = [...new Set((fids || []).map(Number).filter((n) => Number.isFinite(n)))];
  if (!list.length) return { ok: false, error: 'Fixture를 먼저 선택하세요.' };
  if (!draft?.ok) return { ok: false, error: draft?.error || '연결 계획이 없습니다.' };

  fixtures.ensureRig();
  const root = fixtures.fxEngine.root;
  if (!root) return { ok: false, error: 'Fixture 리그가 없습니다.' };
  root.updateWorldMatrix(true, true);

  const motionTrack = engine.getTrack(draft.motion.trackId);
  if (!motionTrack) return { ok: false, error: '대상 캐릭터 트랙을 찾을 수 없습니다.' };

  const motionKeys = motionTrack.keys?.list?.() || [];
  if (!motionKeys.length) {
    return {
      ok: false,
      error: `${draft.motion.name} 트랙에 모션 키가 없습니다. 캐릭터 패턴/키를 먼저 만드세요.`,
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

  // Each add/removeKeyframe emits 'keys' on its own; a 40-key bake would otherwise
  // redraw the timeline ~88 times per fixture.
  engine.beginKeyframeBake();
  try {
    ({ keyCount, trackCount } = bakeIntoLinkTracks({
      engine,
      fixtures,
      draft,
      list,
      sampleMot,
      motionKeys,
      motionObject,
      fallback,
      root,
    }));
  } finally {
    engine.endKeyframeBake();
  }

  if (!trackCount) return { ok: false, error: '기록할 Fixture 트랙을 만들지 못했습니다.' };
  if (!keyCount) return { ok: false, error: '키가 생성되지 않았습니다.' };
  fixtures.apply(engine.playheadSec);
  return { ok: true, keyCount, trackCount };
}

/** Inner bake loop — caller owns the begin/endKeyframeBake pair. */
function bakeIntoLinkTracks(ctx) {
  const {
    engine, fixtures, draft, list, sampleMot, motionKeys, motionObject, fallback, root,
  } = ctx;
  let keyCount = 0;
  let trackCount = 0;

  for (const fid of list) {
    const ch = fixtures.ensureLinkTrackForFid(fid);
    if (!ch) continue;
    const linkTrackId = ch.linkTrackId;
    const fxTrack = engine.getTrack(linkTrackId);
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

    // Linked track stays locked for the user; bake is the only writer
    fxTrack.locked = false;

    // Linked track: always clear existing keys before re-bake
    for (const kf of [...fxTrack.keys.list()]) {
      engine.removeKeyframe(linkTrackId, kf.id);
    }

    const fromLocal = [
      f.obj.grp.position.x,
      f.obj.grp.position.y,
      f.obj.grp.position.z,
    ];
    /** @type {{ pan: number, tilt: number } | null} */
    let lastAim = null;
    let lastPan = base.pan;

    /** Aim at where the character stands at `t`, holding the last aim off stage. */
    const aimAt = (t) => {
      const bagM = sampleMot(t);
      const hasPos = Array.isArray(bagM.position) && bagM.position.length >= 3;
      const offStage = bagM.visible === false && (bagM.opacity ?? 0) <= 0.001;
      let target = null;

      if (hasPos && !offStage) {
        target = bagM.position;
      } else if (!lastAim) {
        target = seedMotionBag(motionKeys, fallback, t)?.position || null;
      }
      if (target) {
        const targetLocal = motionPosToRigLocal(root, motionObject, target, AIM_Y_OFFSET);
        const aim = aimPanTilt(fromLocal, targetLocal);
        lastPan = unwrapPan(lastPan, aim.pan);
        lastAim = { pan: lastPan, tilt: clampTilt(aim.tilt) };
      }
      return lastAim || { pan: base.pan, tilt: base.tilt };
    };

    for (const phase of draft.phases) {
      const times = followSampleTimes(
        phase.fromSec,
        phase.toSec,
        motionKeys,
        engine.fps || 30,
      );
      const span = Math.max(1e-6, phase.toSec - phase.fromSec);
      for (const t of times) {
        const { pan, tilt } = aimAt(t);
        // Exit: keep following the walk-off while dimming to black
        const dim = phase.kind === 'exit'
          ? followDim * Math.max(0, 1 - (t - phase.fromSec) / span)
          : followDim;
        engine.addKeyframe(
          linkTrackId,
          t,
          asFixtureKeyValue({ ...base, pan, tilt, dim }),
          INTERPOLATION.SMOOTH,
        );
        keyCount += 1;
      }
    }

    // Remember what we baked from, so a later character edit shows "needs refresh"
    fixtures.stampLinkSource(fxTrack, draft.motion.trackId);
    fxTrack.locked = true;
  }

  return { keyCount, trackCount };
}

/**
 * Stage window of a character track, plus the exit span when the character
 * walks off at the end.
 * @param {import('../timeline/Track.js').Track} track
 * @param {import('../timeline/TimelineEngine.js').TimelineEngine} engine
 * @returns {{
 *   startSec: number,
 *   bodyOut: number,
 *   exit: { fromSec: number, toSec: number } | null,
 * }}
 */
function motionTimeRange(track, engine) {
  const keys = track.keys?.list?.() || [];
  const durationSec = Math.max(1, Number(engine?.durationSec) || 180);

  if (track.presenceClip && supportsPresenceClip(track)) {
    const out = Math.max(track.presenceClip.startSec, presenceOutSec(track.presenceClip));
    const end = presenceEndSec(track.presenceClip);
    return {
      startSec: track.presenceClip.startSec,
      bodyOut: out,
      // The lead-out is the walk-off; a zero-length one means the character just stops
      exit: end > out + 1e-3 ? { fromSec: out, toSec: end } : null,
    };
  }

  if (!keys.length) return { startSec: 0, bodyOut: durationSec, exit: null };

  const first = keys[0].timeSec;
  const last = keys[keys.length - 1];
  const lastBag = asMotionKeyValue(last.value);
  const isExitKey = lastBag.visible === false || lastBag.opacity <= EXIT_OPACITY;

  if (isExitKey && keys.length >= 2) {
    const prev = keys[keys.length - 2];
    return {
      startSec: first,
      bodyOut: prev.timeSec,
      exit: { fromSec: prev.timeSec, toSec: last.timeSec },
    };
  }
  return { startSec: first, bodyOut: Math.max(first + 0.1, last.timeSec), exit: null };
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
