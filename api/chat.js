// Vercel function behind the Ask Gemini panel and the problem generator on the deployed site. It does the same job as
// do_POST in serve_notes.py: add the API key (kept in the project's environment variables,
// never sent to the browser), forward the conversation to Gemini, and stream the answer back.
export const config = { runtime: 'edge' };

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_BODY = 4_400_000; // characters; Vercel refuses bodies over 4.5 MB. Room for the PDFs the problem generator attaches

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });

  // Only the notes pages themselves may use the key.
  const origin = req.headers.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch (e) {}
    if (host !== req.headers.get('host')) return json(403, { error: 'Requests must come from the notes site.' });
  }

  const key = process.env.GEMINI_API_KEY || '';
  if (!key) return json(400, { error: 'The site has no Gemini API key. Set GEMINI_API_KEY in the Vercel project settings and redeploy.' });
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const base = (process.env.GEMINI_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');

  let body;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json(413, { error: 'That request is too large. Start a new chat, or attach less.' });
    body = JSON.parse(raw || '{}');
  } catch (e) {
    return json(400, { error: 'Bad request body.' });
  }

  const payload = {
    contents: Array.isArray(body.contents) ? body.contents : [],
    generationConfig: { temperature: 0.4 },
  };
  // The problem generator asks for more variety than the chat's default.
  if (typeof body.temperature === 'number') payload.generationConfig.temperature = Math.min(2, Math.max(0, body.temperature));
  if (body.system) payload.systemInstruction = { parts: [{ text: String(body.system) }] };

  let upstream;
  try {
    upstream = await fetch(`${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json(502, { error: 'Could not reach The Lovely Lady.' });
  }
  if (!upstream.ok) {
    let detail = await upstream.text();
    try { detail = JSON.parse(detail).error.message; } catch (e) {}
    return json(upstream.status, { error: `The Lovely Lady returned ${upstream.status}: ${detail}` });
  }

  // Relay the server-sent events stream to the page as it arrives.
  return new Response(upstream.body, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
