import { apiUrl } from '../../config/app-config.js';
import {
  draftMatchesPrompt,
  normalizeAiPatternDraft,
  parsePatternPromptLocal,
} from './aiPatternDraft.js';

/**
 * Try LLM server, then local parser.
 * @param {string} prompt
 * @param {{
 *   presets?: Array<{ id: string, label: string, x: number, z: number, rotY?: number, opacity?: number }>,
 *   current?: { x?: number, z?: number, rotY?: number, opacity?: number, startTime?: number },
 *   pattern?: { startConfigured?: boolean, startTime?: number, fromX?: number, fromZ?: number, fromRotY?: number, fromPresetId?: string | null, opacity?: number } | null,
 *   defaultDurations?: Partial<import('./aiPatternDefaults.js').AiPatternDefaults>,
 * }} [ctx]
 */
export async function requestAiPatternDraft(prompt, ctx = {}) {
  const presets = ctx.presets || [];
  const current = ctx.current || {};
  const pattern = ctx.pattern || null;
  const local = parsePatternPromptLocal(prompt, {
    presets,
    current,
    pattern,
    defaultDurations: ctx.defaultDurations,
  });

  try {
    const res = await fetch(apiUrl('/api/ai/pattern-draft'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, presets, current, pattern }),
    });
    if (res.ok) {
      const data = await res.json();
      const normalized = normalizeAiPatternDraft(data.draft, { presets });
      if (normalized.ok && draftMatchesPrompt(prompt, normalized.draft)) {
        return { ...normalized, source: 'llm' };
      }
    }
    // 503 NO_LLM / LLM 품질 미달 → 로컬
  } catch {
    // offline / no server
  }

  return local;
}
