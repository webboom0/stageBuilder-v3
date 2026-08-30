/**
 * Optional LLM pattern-draft endpoint.
 * Set OPENAI_API_KEY (and optionally OPENAI_BASE_URL, OPENAI_MODEL) to enable.
 *
 * POST /api/ai/pattern-draft
 * body: { prompt, presets?, current? }
 */

/**
 * @param {import('express').Express} app
 * @param {{ requireAuth: import('express').RequestHandler }} deps
 */
function mountAiPatternRoutes(app, deps) {
  const { requireAuth } = deps;

  app.get('/api/ai/status', requireAuth, (_req, res) => {
    const enabled = !!process.env.OPENAI_API_KEY;
    res.json({
      enabled,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      localFallback: true,
    });
  });

  app.post('/api/ai/pattern-draft', requireAuth, async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'OPENAI_API_KEY 없음 — 클라이언트 로컬 파서를 사용하세요.',
        code: 'NO_LLM',
      });
    }

    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'prompt 필요' });

    const presets = Array.isArray(req.body?.presets) ? req.body.presets : [];
    const current = req.body?.current && typeof req.body.current === 'object'
      ? req.body.current
      : {};
    const pattern = req.body?.pattern && typeof req.body.pattern === 'object'
      ? req.body.pattern
      : null;

    const presetLines = presets.map((p) => (
      `- id=${p.id} label="${p.label}" x=${p.x} z=${p.z} rotY=${p.rotY ?? 0} opacity=${p.opacity ?? 1}`
    )).join('\n') || '(없음)';

    const system = `You are a stage-motion assistant for StageBuilder.
Return ONLY valid JSON (no markdown) matching the Properties panel pattern editor:
{
  "startTime": number,
  "fromX": number, "fromZ": number, "fromRotY": number,
  "opacity": number,
  "fromPresetId": string|null,
  "segments": [
    { "kind": "move"|"hold"|"exit", "duration": number, "anchorX": number, "anchorZ": number, "toRotY": number, "anchorPresetId": string|null, "presetLabel": string|null, "easing": "smooth"|"linear" }
  ]
}
Pattern sequence rules (like manual segment steps):
1. Start pose = enter preset if user says 등장/등장위치 (opacity 0).
2. move → center preset (default 3s if unstated).
3. Separate move at same XZ for in-place rotation if user says 중앙에서 N도 회전 (default 3s).
4. hold duration: 「N초/N분 대기」= hold that many seconds. 「N분까지 대기」= ABSOLUTE timeline time — hold duration = N*60 − (startTime + prior segment durations). Example: start 0 + move 3s + 「1분까지 대기」→ hold 57s.
5. Do NOT put 「1분까지」onto the move duration. Move uses default (3s) unless user says 「3초 이동」explicitly.
6. exit → exit preset (default 3s, opacity fades to 0 on last key).
7. startTime: 「1분부터」「30초에 시작」→ seconds (1분=60).
- Match position presets by label (등장, 중앙, 퇴장, 왼쪽…).
- duration and startTime fields are ALWAYS in seconds.
- toRotY is absolute target Y rotation in degrees (snap 30°).
- Korean prompts are common.`;

    const patternLine = pattern?.startConfigured
      ? `Existing pattern start: preset=${pattern.fromPresetId || 'none'} x=${pattern.fromX} z=${pattern.fromZ} rotY=${pattern.fromRotY} opacity=${pattern.opacity}`
      : 'Existing pattern: (none — use enter/center/exit presets or coordinates)';

    const user = `User request:
${prompt}

${patternLine}
Current stage pose: x=${current.x ?? 0}, z=${current.z ?? 50}, rotY=${current.rotY ?? 0}, startTime=${current.startTime ?? 0}

Position presets (use id + coordinates when label matches):
${presetLines}`;

    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    try {
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        return res.status(502).json({
          error: data?.error?.message || `LLM HTTP ${r.status}`,
          code: 'LLM_ERROR',
        });
      }
      const content = data?.choices?.[0]?.message?.content;
      let parsed;
      try {
        parsed = typeof content === 'string' ? JSON.parse(content) : content;
      } catch {
        return res.status(502).json({ error: 'LLM JSON 파싱 실패', code: 'LLM_PARSE' });
      }
      return res.json({ ok: true, draft: parsed, source: 'llm', model });
    } catch (err) {
      console.error('[ai/pattern-draft]', err);
      return res.status(502).json({
        error: err.message || 'LLM 요청 실패',
        code: 'LLM_FETCH',
      });
    }
  });
}

module.exports = { mountAiPatternRoutes };
