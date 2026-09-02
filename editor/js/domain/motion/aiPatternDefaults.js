/** @typedef {{ move: number, hold: number, exit: number }} AiPatternDefaults */

const STORAGE_KEY = 'sb_ai_pattern_defaults_v1';

/** @type {AiPatternDefaults} */
export const AI_PATTERN_DEFAULT_DUR = {
  move: 3,
  hold: 10,
  exit: 3,
};

/** @returns {AiPatternDefaults} */
export function loadAiPatternDefaults() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...AI_PATTERN_DEFAULT_DUR, ...sanitizeAiPatternDefaults(raw) };
  } catch {
    return { ...AI_PATTERN_DEFAULT_DUR };
  }
}

/** @param {Partial<AiPatternDefaults>} next */
export function saveAiPatternDefaults(next) {
  const merged = { ...loadAiPatternDefaults(), ...sanitizeAiPatternDefaults(next) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

/** @param {Partial<AiPatternDefaults>} raw */
export function sanitizeAiPatternDefaults(raw) {
  /** @type {Partial<AiPatternDefaults>} */
  const out = {};
  for (const key of /** @type {(keyof AiPatternDefaults)[]} */ (['move', 'hold', 'exit'])) {
    const n = Number(raw?.[key]);
    if (Number.isFinite(n) && n >= 0.5 && n <= 120) out[key] = n;
  }
  return out;
}
