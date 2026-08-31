/** @param {Record<string, string>} env @param {Request} request */
export async function handleAiRoutes(env, request) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === '/api/ai/status' && request.method === 'GET') {
    const enabled = !!env.OPENAI_API_KEY;
    return Response.json({
      enabled,
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
      localFallback: true,
    });
  }

  if (pathname === '/api/ai/pattern-draft' && request.method === 'POST') {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({
        error: 'OPENAI_API_KEY 없음 — 클라이언트 로컬 파서를 사용하세요.',
        code: 'NO_LLM',
      }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const prompt = String(body?.prompt || '').trim();
    if (!prompt) return Response.json({ error: 'prompt 필요' }, { status: 400 });

    const presets = Array.isArray(body?.presets) ? body.presets : [];
    const current = body?.current && typeof body.current === 'object' ? body.current : {};
    const pattern = body?.pattern && typeof body.pattern === 'object' ? body.pattern : null;

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
}`;

    const patternLine = pattern?.startConfigured
      ? `Existing pattern start: preset=${pattern.fromPresetId || 'none'} x=${pattern.fromX} z=${pattern.fromZ} rotY=${pattern.fromRotY} opacity=${pattern.opacity}`
      : 'Existing pattern: (none — use enter/center/exit presets or coordinates)';

    const user = `User request:
${prompt}

${patternLine}
Current stage pose: x=${current.x ?? 0}, z=${current.z ?? 50}, rotY=${current.rotY ?? 0}, startTime=${current.startTime ?? 0}

Position presets (use id + coordinates when label matches):
${presetLines}`;

    const baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = env.OPENAI_MODEL || 'gpt-4o-mini';

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
        return Response.json({
          error: data?.error?.message || `LLM HTTP ${r.status}`,
          code: 'LLM_ERROR',
        }, { status: 502 });
      }
      const content = data?.choices?.[0]?.message?.content;
      let parsed;
      try {
        parsed = typeof content === 'string' ? JSON.parse(content) : content;
      } catch {
        return Response.json({ error: 'LLM JSON 파싱 실패', code: 'LLM_PARSE' }, { status: 502 });
      }
      return Response.json({ ok: true, draft: parsed, source: 'llm', model });
    } catch (err) {
      return Response.json({
        error: err.message || 'LLM 요청 실패',
        code: 'LLM_FETCH',
      }, { status: 502 });
    }
  }

  return null;
}
