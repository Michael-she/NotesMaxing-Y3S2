// Everyone's usage: beers owed (tokens), AI requests, page opens, recent requests and tokens per day,
// read from the shared ledger (see _ledger.js). Used by usage.html.
export const config = { runtime: 'edge' };
import { totals, PER_BEER } from './_ledger.js';

export default async function handler() {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  try {
    return new Response(JSON.stringify({ perBeer: PER_BEER, ...(await totals()) }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ perBeer: PER_BEER, error: String(e.message || e) }), { status: 503, headers });
  }
}
