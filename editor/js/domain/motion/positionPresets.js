import { normalizeRotYDeg } from './groupSegments.js';

let _seq = 1;

/** @returns {string} */
export function newPositionPresetId() {
  return `pos_${Date.now().toString(36)}_${(_seq++).toString(36)}`;
}

/**
 * @param {Partial<PositionPreset>} raw
 * @returns {PositionPreset}
 */
export function normalizePositionPreset(raw) {
  const p = raw || {};
  return {
    id: p.id || newPositionPresetId(),
    label: String(p.label || '위치').trim() || '위치',
    x: roundCoord(p.x),
    z: roundCoord(p.z),
    rotY: normalizeRotYDeg(p.rotY ?? 0),
    opacity: clamp01(p.opacity ?? 1),
  };
}

/**
 * @typedef {{ id: string, label: string, x: number, z: number, rotY: number, opacity: number }} PositionPreset
 */

/**
 * @param {PositionPreset} preset
 */
export function formatPresetLabel(preset) {
  return `${preset.label} · X ${fmt(preset.x)} · Z ${fmt(preset.z)}`;
}

/**
 * @param {{ x?: number, z?: number, rotY?: number, opacity?: number }} pose
 */
export function formatPoseSummary(pose) {
  const x = fmt(pose.x ?? 0);
  const z = fmt(pose.z ?? 0);
  const rot = normalizeRotYDeg(pose.rotY ?? 0);
  const op = clamp01(pose.opacity ?? 1);
  return `X ${x} · Z ${z} · Y° ${rot}${op < 1 ? ` · α ${op.toFixed(2)}` : ''}`;
}

/**
 * @param {{ startTime?: number, fromX?: number, fromZ?: number, fromRotY?: number, opacity?: number }} start
 */
export function formatStartStepSummary(start) {
  const t = Number(start.startTime ?? 0);
  const pose = formatPoseSummary({
    x: start.fromX,
    z: start.fromZ,
    rotY: start.fromRotY,
    opacity: start.opacity,
  });
  return `${t.toFixed(1)}s · ${pose}`;
}

/**
 * @param {import('./groupSegments.js').SegmentLike} seg
 */
export function formatSegmentStepSummary(seg) {
  const kind = seg.kind || 'move';
  const dur = fmt(seg.duration ?? 3);
  if (kind === 'hold') return `${dur}s · 대기`;
  const ax = fmt(seg.anchorX ?? 0);
  const az = fmt(seg.anchorZ ?? 0);
  const rot = normalizeRotYDeg(seg.toRotY ?? 0);
  const kindLabel = kind === 'exit' ? '퇴장' : '이동';
  return `${dur}s · ${kindLabel} · X ${ax} · Z ${az} · Y° ${rot}`;
}

function fmt(n) {
  return String(roundCoord(n));
}

function roundCoord(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.min(1, Math.max(0, v));
}
