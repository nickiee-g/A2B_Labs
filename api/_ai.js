const MODEL_PATTERN = /^[A-Za-z0-9._-]+$/;

export function activeProvider() {
  return (process.env.A2B_PROVIDER || 'gemini').trim().toLowerCase();
}

export function activeModel(provider = activeProvider()) {
  const explicit = (process.env.A2B_MODEL || '').trim();
  if (explicit) return explicit;
  return provider === 'openai' ? 'gpt-4.1-mini' : 'gemini-3.8-flash';
}

export function apiKey(provider = activeProvider()) {
  if (provider === 'openai') {
    return (process.env.OPENAI_API_KEY || '').trim();
  }
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

export function jsonResponse(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

export function verifySameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const reqHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host;
    return Boolean(reqHost) && originHost === reqHost;
  } catch {
    return false;
  }
}

export async function readJsonBody(request) {
  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return { errorResponse: jsonResponse(415, { error: 'JSON required.' }) };
  }
  const raw = await request.text();
  if (raw.length < 1 || raw.length > 100000) {
    return { errorResponse: jsonResponse(400, { error: 'Request must be between 1 and 100,000 bytes.' }) };
  }
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { errorResponse: jsonResponse(400, { error: 'Invalid input: Request must be an object.' }) };
    }
    return { data };
  } catch (err) {
    return { errorResponse: jsonResponse(400, { error: `Invalid JSON body: ${String(err.message || err).slice(0, 160)}` }) };
  }
}

export async function callStructuredModel({ instruction, context }) {
  const provider = activeProvider();
  const model = activeModel(provider);
  const key = apiKey(provider);

  if (provider !== 'openai' && provider !== 'gemini') {
    return jsonResponse(503, { error: 'Set A2B_PROVIDER to gemini or openai.' });
  }
  if (!key) {
    return jsonResponse(503, {
      error:
        provider === 'gemini'
          ? 'Gemini API key is not configured. Set GEMINI_API_KEY in Vercel Environment Variables.'
          : 'OpenAI API key is not configured. Set OPENAI_API_KEY in Vercel Environment Variables.'
    });
  }
  if (!MODEL_PATTERN.test(model)) {
    return jsonResponse(400, { error: 'Invalid model name.' });
  }

  try {
    let text = '';
    if (provider === 'openai') {
      const upstream = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
          instructions: instruction,
          input: context,
          text: { format: { type: 'json_object' } },
          store: false
        }),
        signal: AbortSignal.timeout(90000)
      });

      if (!upstream.ok) {
        const errBody = await upstream.json().catch(() => ({}));
        const msg = errBody?.error?.message ? ` ${String(errBody.error.message).slice(0, 220)}` : '';
        console.error('OpenAI API HTTP error:', upstream.status, msg);
        return jsonResponse(502, {
          error: `AI request failed (HTTP ${upstream.status}).${msg || ' Check your key, model access and billing.'}`
        });
      }

      const result = await upstream.json();
      for (const item of result.output || []) {
        if (item?.type === 'message') {
          for (const c of item.content || []) {
            if (c?.type === 'output_text' && c.text) text += c.text;
          }
        }
      }
    } else {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instruction }] },
            contents: [{ parts: [{ text: context }] }],
            generationConfig: { responseMimeType: 'application/json' }
          }),
          signal: AbortSignal.timeout(90000)
        }
      );

      if (!upstream.ok) {
        const errBody = await upstream.json().catch(() => ({}));
        const msg = errBody?.error?.message ? ` ${String(errBody.error.message).slice(0, 220)}` : '';
        console.error('Gemini API HTTP error:', upstream.status, msg);
        return jsonResponse(502, {
          error: `AI request failed (HTTP ${upstream.status}).${msg || ' Check your key, model access and billing.'}`
        });
      }

      const result = await upstream.json();
      const parts = result?.candidates?.[0]?.content?.parts || [];
      text = parts
        .filter((p) => p && !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('');
    }

    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*|\s*```$/gs, '').trim();
    }
    const output = JSON.parse(cleaned);
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      return jsonResponse(400, { error: 'Model returned an unexpected response.' });
    }
    return jsonResponse(200, output);
  } catch (err) {
    console.error('A2B AI invocation error:', err);
    if (err instanceof SyntaxError) {
      return jsonResponse(400, { error: `Invalid AI JSON response: ${String(err.message).slice(0, 200)}` });
    }
    return jsonResponse(502, { error: 'Could not reach the AI service. Check your connection and try again.' });
  }
}
