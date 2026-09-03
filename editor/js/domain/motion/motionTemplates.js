import { normalizeRotYDeg } from './groupSegments.js';

let _seq = 1;

/** @returns {string} */
export function newMotionTemplateId() {
  return `mtpl_${Date.now().toString(36)}_${(_seq++).toString(36)}`;
}

/**
 * @typedef {{
 *   timeOffset: number,
 *   offsetX: number,
 *   offsetZ: number,
 *   deltaRotY: number,
 *   opacity: number,
 *   visible: boolean,
 *   interpolation?: number,
 *   presetId?: string | null,
 *   kind?: 'move' | 'hold' | 'exit',
 * }} RelativeKeyframe
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   opacity: number,
 *   keyframes: RelativeKeyframe[],
 *   absoluteCoords?: boolean,
 *   startTimeSec?: number,
 *   fromX?: number,
 *   fromZ?: number,
 *   fromRotY?: number,
 *   fromPresetId?: string | null,
 * }} MotionTemplate
 */

/**
 * @param {Partial<MotionTemplate>} raw
 * @returns {MotionTemplate}
 */
export function normalizeMotionTemplate(raw) {
  const p = raw || {};
  const keyframes = Array.isArray(p.keyframes) && p.keyframes.length
    ? p.keyframes.map(normalizeRelativeKeyframe)
    : [];
  /** @type {MotionTemplate} */
  const tpl = {
    id: p.id || newMotionTemplateId(),
    label: String(p.label || '패턴').trim() || '패턴',
    opacity: clamp01(p.opacity ?? keyframes[0]?.opacity ?? 1),
    keyframes,
  };
  if (p.absoluteCoords === true) {
    tpl.absoluteCoords = true;
    if (Number.isFinite(Number(p.startTimeSec))) tpl.startTimeSec = Number(p.startTimeSec);
    if (Number.isFinite(Number(p.fromX))) tpl.fromX = Number(p.fromX);
    if (Number.isFinite(Number(p.fromZ))) tpl.fromZ = Number(p.fromZ);
    if (Number.isFinite(Number(p.fromRotY))) tpl.fromRotY = normalizeRotYDeg(p.fromRotY);
    if (typeof p.fromPresetId === 'string' && p.fromPresetId) tpl.fromPresetId = p.fromPresetId;
  }
  return tpl;
}

/** @param {Partial<RelativeKeyframe>} kf */
function normalizeRelativeKeyframe(kf) {
  /** @type {RelativeKeyframe} */
  const out = {
    timeOffset: Math.max(0, Number(kf?.timeOffset) || 0),
    offsetX: Number.isFinite(Number(kf?.offsetX)) ? Number(kf.offsetX) : 0,
    offsetZ: Number.isFinite(Number(kf?.offsetZ)) ? Number(kf.offsetZ) : 0,
    deltaRotY: normalizeRotYDeg(kf?.deltaRotY ?? 0),
    opacity: clamp01(kf?.opacity ?? 1),
    visible: kf?.visible !== false,
    interpolation: Number.isFinite(Number(kf?.interpolation)) ? Number(kf.interpolation) : undefined,
    presetId: typeof kf?.presetId === 'string' && kf.presetId ? kf.presetId : null,
  };
  if (kf?.kind === 'move' || kf?.kind === 'hold' || kf?.kind === 'exit') {
    out.kind = kf.kind;
  }
  return out;
}

/** @param {MotionTemplate} tpl */
export function templateHasKeyframes(tpl) {
  return (tpl?.keyframes?.length ?? 0) >= 2;
}

/** @param {MotionTemplate} tpl */
export function formatTemplateSummary(tpl) {
  const keys = tpl?.keyframes ?? [];
  if (keys.length < 2) return '키 없음';
  const total = keys[keys.length - 1]?.timeOffset ?? 0;
  return `키 ${keys.length}개 · ${total.toFixed(1)}s`;
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}
