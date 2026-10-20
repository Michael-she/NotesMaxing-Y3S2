// The shared usage ledger, kept on the amavadata reporting platform. Each person has two report aliases
// on the site's gateway:
//   tokens_<name>  one reading per AI request: the tokens it used (750 000 tokens is one beer)
//   opens_<name>   one reading of 1 per page open
// A person's totals are the sums of their readings. serve_notes.py mirrors this file for local use.
// The files in api/ that start with _ are helpers, not endpoints.
//
// Environment (Vercel project settings, or .env for serve_notes.py):
//   AMAVA_BASE     the platform's base URL, https://amavadata.com
//   AMAVA_GATEWAY  the gateway ID the readings are posted to
export const PER_BEER = 750000;
const TOKENS = 'tokens_', OPENS = 'opens_';

function env() {
  const base = (process.env.AMAVA_BASE || '').replace(/\/+$/, '');
  const gw = process.env.AMAVA_GATEWAY || '';
  return base && gw ? `${base}/api/report/${encodeURIComponent(gw)}` : '';
}
export const configured = () => Boolean(env());

// Names become aliases: letters, digits and underscores only, so they are safe in the platform's IDs and URLs.
function cleanName(name) {
  return String(name || '').normalize('NFKD').replace(/[^\w ]/g, '').trim().replace(/\s+/g, '_').slice(0, 40);
}
export function aliasOf(name, prefix = TOKENS) {
  const c = cleanName(name);
  return c ? prefix + c : '';
}

// Post one reading. Never throws: the ledger must not break the chat or the page.
async function post(alias, value) {
  const url = env();
  if (!url || !alias) return false;
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias, value: String(value) }),
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch (e) { return false; }
}
export const report = (name, tokens) => tokens > 0 ? post(aliasOf(name, TOKENS), Math.round(tokens)) : Promise.resolve(false);
export const countOpen = name => post(aliasOf(name, OPENS), 1);

// The one name allowed to see everyone's usage (compared without case, spacing or punctuation).
// LEDGER_ADMIN in the environment overrides it.
const ADMIN = () => process.env.LEDGER_ADMIN || 'Michael Shepstone';
export const isAdmin = name => Boolean(cleanName(name)) && cleanName(name).toLowerCase() === cleanName(ADMIN()).toLowerCase();

// Everyone's usage, for the admin only: totals per person (largest first), recent requests and tokens per day.
export async function everyone() {
  const url = env();
  if (!url) throw new Error('The usage ledger is not connected yet (AMAVA_BASE and AMAVA_GATEWAY are not set).');
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('The usage ledger returned ' + r.status + '.');
  const types = await r.json();
  const people = {}, recent = [], daily = {};
  const person = n => (people[n] ||= { name: n, tokens: 0, requests: 0, opens: 0, last: '' });
  for (const t of Array.isArray(types) ? types : []) {
    const alias = typeof t.alias === 'string' ? t.alias : '';
    const kind = alias.startsWith(TOKENS) ? 'tokens' : alias.startsWith(OPENS) ? 'opens' : '';
    if (!kind) continue;
    const name = alias.slice(kind === 'tokens' ? TOKENS.length : OPENS.length).replace(/_/g, ' ');
    const p = person(name);
    for (const v of Array.isArray(t.values) ? t.values : []) {
      const value = Number(v.value) || 0, ts = String(v.timestamp || '');
      if (ts > p.last) p.last = ts;
      if (kind === 'opens') { p.opens += 1; continue; }
      p.tokens += value; p.requests += 1;
      recent.push({ name, tokens: value, timestamp: ts });
      const day = ts.slice(0, 10);
      if (day) daily[day] = (daily[day] || 0) + value;
    }
  }
  return {
    people: Object.values(people).map(p => ({ ...p, beers: p.tokens / PER_BEER })).sort((a, b) => b.tokens - a.tokens || b.opens - a.opens),
    recent: recent.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, 25),
    daily: last30(daily),
  };
}
function last30(daily) {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ day: d, tokens: daily[d] || 0 });
  }
  return days;
}

// One person's usage: totals, their most recent requests, and their tokens per day for the last 30 days.
// Only the named person's readings are returned; only the admin (above) can list everyone.
export async function usageOf(name) {
  const url = env();
  if (!url) throw new Error('The usage ledger is not connected yet (AMAVA_BASE and AMAVA_GATEWAY are not set).');
  const tAlias = aliasOf(name, TOKENS), oAlias = aliasOf(name, OPENS);
  if (!tAlias) throw new Error('No name given.');
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('The usage ledger returned ' + r.status + '.');
  const types = await r.json();
  const me = { name: tAlias.slice(TOKENS.length).replace(/_/g, ' '), tokens: 0, requests: 0, opens: 0, last: '' };
  const recent = [], daily = {};
  for (const t of Array.isArray(types) ? types : []) {
    if (t.alias !== tAlias && t.alias !== oAlias) continue;
    for (const v of Array.isArray(t.values) ? t.values : []) {
      const value = Number(v.value) || 0, ts = String(v.timestamp || '');
      if (ts > me.last) me.last = ts;
      if (t.alias === oAlias) { me.opens += 1; continue; }
      me.tokens += value; me.requests += 1;
      recent.push({ tokens: value, timestamp: ts });
      const day = ts.slice(0, 10);
      if (day) daily[day] = (daily[day] || 0) + value;
    }
  }
  me.beers = me.tokens / PER_BEER;
  recent.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ day: d, tokens: daily[d] || 0 });
  }
  return { person: me, recent: recent.slice(0, 25), daily: days };
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
