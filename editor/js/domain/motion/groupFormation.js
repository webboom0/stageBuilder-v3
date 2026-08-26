/** 그룹 중심 기준 멤버별 오프셋 (x, z) — v3 groupFormation.js */

export const FORMATION_LABELS = {
  grid: '격자',
  line: '횡대 (X)',
  lineZ: '종렬 (Z)',
  circle: '원형',
  scatter: '산개',
};

export const FORMATION_TYPES = ['grid', 'line', 'lineZ', 'circle', 'scatter'];

/**
 * @param {number} count
 * @param {string} [type]
 * @param {number} [spacing]
 * @returns {{ x: number, z: number }[]}
 */
export function computeFormationOffsets(count, type = 'grid', spacing = 30) {
  const n = Math.max(0, Number(count) || 0);
  if (n === 0) return [];
  const s = Math.max(0.5, Number(spacing) || 30);

  if (type === 'line' || type === 'lineX') {
    return Array.from({ length: n }, (_, i) => ({
      x: (i - (n - 1) / 2) * s,
      z: 0,
    }));
  }

  if (type === 'lineZ') {
    return Array.from({ length: n }, (_, i) => ({
      x: 0,
      z: (i - (n - 1) / 2) * s,
    }));
  }

  if (type === 'circle') {
    const radius = Math.max(s, (n * s) / (Math.PI * 2));
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(a) * radius, z: Math.sin(a) * radius };
    });
  }

  if (type === 'scatter') {
    return Array.from({ length: n }, (_, i) => {
      const ang = (i * 2.399963) % (Math.PI * 2);
      const rad = s * (0.55 + (i % 4) * 0.28);
      return { x: Math.cos(ang) * rad, z: Math.sin(ang) * rad };
    });
  }

  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return {
      x: (col - (cols - 1) / 2) * s,
      z: (row - (rows - 1) / 2) * s,
    };
  });
}
