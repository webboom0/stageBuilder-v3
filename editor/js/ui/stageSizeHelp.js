import { getProfileLimits } from '../domain/stage/stageFloorLayout.js';
import { STAGE_TYPES } from '../domain/stage/StageTypes.js';
import {
  GRAND_HALL_DEFAULT,
  STAGE_PROFILE_PRESETS,
  V3_FBX_REFERENCE,
} from '../domain/stage/StageProfile.js';

/**
 * @param {number} widthM
 * @param {number} depthM
 * @param {import('../domain/stage/StageTypes.js').StageTypeId | string} stageType
 */
export function checkStageSizeInput(widthM, depthM, stageType) {
  const limits = getProfileLimits(stageType);
  const overWidth = widthM > limits.maxWidthM;
  const overDepth = depthM > limits.maxDepthM;
  const underWidth = widthM < limits.minWidthM;
  const underDepth = depthM < limits.minDepthM;

  return {
    limits,
    overWidth,
    overDepth,
    underWidth,
    underDepth,
    isOver: overWidth || overDepth,
    isUnder: underWidth || underDepth,
    isOutOfRange: overWidth || overDepth || underWidth || underDepth,
    message: buildWarningMessage({ widthM, depthM, limits, overWidth, overDepth, underWidth, underDepth }),
  };
}

function buildWarningMessage({ widthM, depthM, limits, overWidth, overDepth, underWidth, underDepth }) {
  const parts = [];
  if (overWidth) parts.push(`가로 ${widthM}m → 최대 ${limits.maxWidthM}m`);
  if (overDepth) parts.push(`세로 ${depthM}m → 최대 ${limits.maxDepthM}m`);
  if (underWidth) parts.push(`가로 ${widthM}m → 최소 ${limits.minWidthM}m`);
  if (underDepth) parts.push(`세로 ${depthM}m → 최소 ${limits.minDepthM}m`);
  if (!parts.length) return '';
  return `한도 초과: ${parts.join(', ')}`;
}

/** @param {import('../domain/stage/StageTypes.js').StageTypeId | string} stageType */
export function buildStageSizeHelpHtml(stageType) {
  const limits = getProfileLimits(stageType);
  const typeLabel = STAGE_TYPES[stageType]?.label ?? stageType;
  const base = GRAND_HALL_DEFAULT;
  const fbxRef = V3_FBX_REFERENCE;

  const presetRows = STAGE_PROFILE_PRESETS.map(
    (p) =>
      `<tr><td>${p.name}</td><td>${p.widthM}m</td><td>${p.depthM}m</td><td>${Math.round(p.widthM * p.depthM)}㎡</td><td>${p.heightM ?? '—'}m</td></tr>`,
  ).join('');

  return `
    <p class="sb-help-lead">국내 대공연장 일반 규격(가로 15~20m, 깊이 10~14.5m, 프로시니엄高 8~10m)을 기준으로 합니다. <strong>건물·바닥·그리드</strong>가 함께 스케일됩니다.</p>
    <table class="sb-help-table">
      <thead><tr><th>규격</th><th>가로 W</th><th>깊이 D</th><th>면적</th><th>프로시니엄 H</th></tr></thead>
      <tbody>${presetRows}</tbody>
    </table>
    <table class="sb-help-table">
      <thead><tr><th></th><th>가로 W</th><th>깊이 D</th><th>면적</th></tr></thead>
      <tbody>
        <tr><td>에디터 기본</td><td>${base.widthM}m</td><td>${base.depthM}m</td><td>${base.areaM2}㎡</td></tr>
        <tr><td>${typeLabel} 조절 한도</td><td>${limits.minWidthM}–${limits.maxWidthM}m</td><td>${limits.minDepthM}–${limits.maxDepthM}m</td><td>—</td></tr>
        <tr><td>v3 FBX 1.0×</td><td>${fbxRef.widthM}m</td><td>${fbxRef.depthM}m</td><td>${fbxRef.widthM * fbxRef.depthM}㎡</td></tr>
      </tbody>
    </table>
    <ul class="sb-help-list">
      <li><strong>규격 W×D</strong>: 무대 바닥 판 크기 (v3 FBX 20×22.5m = 스케일 1× 기준)</li>
      <li><strong>건물</strong>: 가·세로만 조절하고 <em>높이는 FBX 원본 비율 유지</em> (늘리면 관객석·벽이 찌그러짐)</li>
      <li><strong>사람</strong>: UI 170cm · 1m 그리드 대비 ~40% 크기(216㎡ 100~200명 밀집 감각) · 줄 간격 ~0.7m</li>
      <li><strong>아레나</strong>: 건물 여유는 크지만 왜곡 방지를 위해 최대 +5% 캡</li>
      <li>한도를 넘기면 <strong>적용 시 자동 보정</strong>되며 상태바에 표시됩니다</li>
    </ul>
  `;
}
