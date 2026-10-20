// One person's usage (GET api/ledger?user=Name): beers owed (tokens), AI requests, page opens, their recent
// requests and tokens per day, read from the shared ledger (see _ledger.js). Used by usage.html.
// For the admin name only, the reply also carries everyone's usage.
export const config = { runtime: 'edge' };
import { usageOf, everyone, isAdmin, PER_BEER } from './_ledger.js';

export default async function handler(req) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  const user = (new URL(req.url).searchParams.get('user') || '').slice(0, 60);
  if (!user) return new Response(JSON.stringify({ perBeer: PER_BEER, error: 'No name given.' }), { status: 400, headers });
  try {
    const out = { perBeer: PER_BEER, ...(await usageOf(user)) };
    if (isAdmin(user)) out.everyone = await everyone();
    return new Response(JSON.stringify(out), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ perBeer: PER_BEER, error: String(e.message || e) }), { status: 503, headers });
  }
}
