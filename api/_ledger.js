// The shared token ledger, kept on the amavadata reporting platform. Each person is one report alias,
// "tokens_<name>", on the site's gateway, and every AI request posts the tokens it used as one reading.
// A person's total is the sum of their readings; 750 000 tokens is one beer.
// The files in api/ that start with _ are helpers, not endpoints.
//
// Environment (Vercel project settings, or .env for serve_notes.py):
//   AMAVA_BASE     the platform's base URL, for example https://example.com (no trailing /api)
//   AMAVA_GATEWAY  the gateway ID the readings are posted to
export const PER_BEER = 750000;
const PREFIX = 'tokens_';

function env() {
  const base = (process.env.AMAVA_BASE || '').replace(/\/+$/, '');
  const gw = process.env.AMAVA_GATEWAY || '';
  return base && gw ? `${base}/api/report/${encodeURIComponent(gw)}` : '';
}
export const configured = () => Boolean(env());

// Names become aliases: letters, digits and underscores only, so they are safe in the platform's IDs and URLs.
export function aliasOf(name) {
  const clean = String(name || '').normalize('NFKD').replace(/[^\w ]/g, '').trim().replace(/\s+/g, '_').slice(0, 40);
  return clean ? PREFIX + clean : '';
}
const nameOf = alias => alias.slice(PREFIX.length).replace(/_/g, ' ');

// Post one request's tokens. Never throws: the ledger must not break the chat.
export async function report(name, tokens) {
  const url = env(), alias = aliasOf(name);
  if (!url || !alias || !(tokens > 0)) return false;
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias, value: String(Math.round(tokens)) }),
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch (e) { return false; }
}

// Everyone's totals, largest first.
export async function totals() {
  const url = env();
  if (!url) throw new Error('The ledger is not connected yet (AMAVA_BASE and AMAVA_GATEWAY are not set).');
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('The ledger store returned ' + r.status + '.');
  const types = await r.json();
  return (Array.isArray(types) ? types : [])
    .filter(t => typeof t.alias === 'string' && t.alias.startsWith(PREFIX))
    .map(t => {
      const values = Array.isArray(t.values) ? t.values : [];
      const tokens = values.reduce((s, v) => s + (Number(v.value) || 0), 0);
      const last = values.reduce((m, v) => (v.timestamp > m ? v.timestamp : m), '');
      return { name: nameOf(t.alias), tokens, requests: values.length, beers: tokens / PER_BEER, last };
    })
    .sort((a, b) => b.tokens - a.tokens);
}

// Read the final usageMetadata out of Gemini's server-sent events as they stream past.
export function usageWatcher() {
  const dec = new TextDecoder();
  let buf = '', usage = null;
  return {
    feed(chunk) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:') || !line.includes('usageMetadata')) continue;
        try { const j = JSON.parse(line.slice(5)); if (j.usageMetadata) usage = j.usageMetadata; } catch (e) {}
      }
    },
    tokens() {
      const u = usage || {};
      return u.totalTokenCount || ((u.promptTokenCount || 0) + (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0));
    },
  };
}
