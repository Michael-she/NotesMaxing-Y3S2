// Everyone's token totals and the beers they owe, read from the shared ledger (see _ledger.js).
export const config = { runtime: 'edge' };
import { totals, PER_BEER } from './_ledger.js';

export default async function handler() {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  try {
    return new Response(JSON.stringify({ perBeer: PER_BEER, people: await totals() }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ perBeer: PER_BEER, error: String(e.message || e) }), { status: 503, headers });
  }
}
