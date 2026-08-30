import { computeFormationOffsets, FORMATION_LABELS } from '../domain/motion/groupFormation.js';
import { normalizeRotYDeg } from './rotYChips.js';

/** @returns {string} */
export function formationMiniPreviewHtml() {
  return `
    <div class="sb-seg-formation-preview" data-role="fmt-preview">
      <div class="sb-seg-formation-preview-head">
        <span class="sb-seg-formation-preview-title">대열 미리보기</span>
        <span class="sb-seg-formation-preview-meta" data-role="fmt-preview-meta"></span>
      </div>
      <svg class="sb-seg-formation-preview-svg" viewBox="0 0 200 120" aria-hidden="true" data-role="fmt-preview-svg"></svg>
      <p class="sb-seg-formation-preview-hint" data-role="fmt-preview-hint"></p>
    </div>`;
}

/**
 * @param {{
 *   memberCount?: number,
 *   formation?: string,
 *   rotY?: number,
 *   spacing?: number,
 *   centerX?: number,
 *   centerZ?: number,
 *   stageHint?: string,
 * }} state
 */
export function updateFormationMiniPreview(root, state) {
  const svg = root?.querySelector('[data-role="fmt-preview-svg"]');
  const meta = root?.querySelector('[data-role="fmt-preview-meta"]');
  const hint = root?.querySelector('[data-role="fmt-preview-hint"]');
  if (!svg) return;

  const count = Math.max(1, Math.min(32, Number(state.memberCount) || 1));
  const formation = state.formation || 'line';
  const spacing = Math.max(0.5, Number(state.spacing) || 30);
  const rotY = normalizeRotYDeg(state.rotY ?? 0);
  const cx = Number(state.centerX) || 0;
  const cz = Number(state.centerZ) || 0;
  const rad = THREE_DEG_TO_RAD(rotY);

  const offsets = computeFormationOffsets(count, formation, spacing);
  const worldPts = offsets.map((o) => ({
    x: cx + o.x,
    z: cz + o.z,
  }));

  let minX = cx;
  let maxX = cx;
  let minZ = cz;
  let maxZ = cz;
  worldPts.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  });
  const pad = Math.max(spacing * 0.75, 8);
  minX -= pad;
  maxX += pad;
  minZ -= pad;
  maxZ += pad;
  const spanX = Math.max(maxX - minX, 1);
  const spanZ = Math.max(maxZ - minZ, 1);

  const W = 200;
  const H = 120;
  const margin = 14;
  const mapW = W - margin * 2;
  const mapH = H - margin * 2;
  const scale = Math.min(mapW / spanX, mapH / spanZ);

  const toSvg = (x, z) => ({
    sx: margin + (x - minX) * scale,
    sy: margin + (maxZ - z) * scale,
  });

  const center = toSvg(cx, cz);
  const arrowLen = Math.min(22, spacing * scale * 0.45 + 10);
  const ax = center.sx + Math.sin(rad) * arrowLen;
  const ay = center.sy - Math.cos(rad) * arrowLen;

  const dots = worldPts.map((p) => {
    const { sx, sy } = toSvg(p.x, p.z);
    return `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4.5" class="sb-fmt-prev-dot" />`;
  }).join('');

  svg.innerHTML = `
    <rect x="0" y="0" width="${W}" height="${H}" class="sb-fmt-prev-bg" rx="4" />
    <line x1="${margin}" y1="${H - margin}" x2="${W - margin}" y2="${H - margin}" class="sb-fmt-prev-axis" />
    <line x1="${margin}" y1="${margin}" x2="${margin}" y2="${H - margin}" class="sb-fmt-prev-axis" />
    <circle cx="${center.sx.toFixed(1)}" cy="${center.sy.toFixed(1)}" r="3" class="sb-fmt-prev-center" />
    <line x1="${center.sx.toFixed(1)}" y1="${center.sy.toFixed(1)}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" class="sb-fmt-prev-heading" />
    <polygon points="${arrowHeadPoints(ax, ay, rad)}" class="sb-fmt-prev-heading-head" />
    ${dots}`;

  if (meta) {
    meta.textContent = `${count}명 · ${FORMATION_LABELS[formation] || formation} · Y ${rotY}°`;
  }
  if (hint) {
    hint.textContent = state.stageHint
      || `중심 X ${cx.toFixed(1)} · Z ${cz.toFixed(1)} — 위에서 본 대열`;
  }
}

function THREE_DEG_TO_RAD(deg) {
  return (deg * Math.PI) / 180;
}

/** @param {number} tipX @param {number} tipY @param {number} rad */
function arrowHeadPoints(tipX, tipY, rad) {
  const back = 7;
  const spread = 4;
  const bx = tipX - Math.sin(rad) * back;
  const by = tipY + Math.cos(rad) * back;
  const lx = bx + Math.cos(rad) * spread;
  const ly = by + Math.sin(rad) * spread;
  const rx = bx - Math.cos(rad) * spread;
  const ry = by - Math.sin(rad) * spread;
  return `${tipX.toFixed(1)},${tipY.toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)} ${rx.toFixed(1)},${ry.toFixed(1)}`;
}
