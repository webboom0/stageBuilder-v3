/** Stage gel / MA console color swatches */
export const MA_COLOR_SWATCHES = [
  { r: 1, g: 0.12, b: 0.1 },
  { r: 1, g: 0.28, b: 0.12 },
  { r: 1, g: 0.48, b: 0.1 },
  { r: 1, g: 0.72, b: 0.2 },
  { r: 1, g: 0.92, b: 0.35 },
  { r: 0.55, g: 1, b: 0.28 },
  { r: 0.2, g: 0.85, b: 0.45 },
  { r: 0.15, g: 0.72, b: 0.95 },
  { r: 0.22, g: 0.42, b: 1 },
  { r: 0.45, g: 0.22, b: 1 },
  { r: 0.75, g: 0.28, b: 1 },
  { r: 1, g: 0.35, b: 0.82 },
  { r: 0.95, g: 0.95, b: 0.95 },
  { r: 0.72, g: 0.72, b: 0.78 },
  { r: 0.42, g: 0.42, b: 0.48 },
  { r: 0.18, g: 0.18, b: 0.22 },
  { r: 1, g: 0.55, b: 0.65 },
  { r: 0.62, g: 0.38, b: 0.22 },
  { r: 0.35, g: 0.55, b: 0.28 },
  { r: 0.05, g: 0.35, b: 0.55 },
];

export function rgbToFixture(rgb) {
  return { r: rgb.r, g: rgb.g, b: rgb.b };
}

export function liveToRgb255(f) {
  const o = f?.live || f?.attr || f?.home || {};
  return {
    r: Math.round((o.r ?? 1) * 255),
    g: Math.round((o.g ?? 1) * 255),
    b: Math.round((o.b ?? 1) * 255),
  };
}
