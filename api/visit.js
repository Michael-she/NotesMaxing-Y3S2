// Counts one page open under the reader's name in the shared ledger (see _ledger.js). The page sends
// it as a beacon after it has loaded, so nothing waits on this.
export const config = { runtime: 'edge' };
import { countOpen } from './_ledger.js';

export default async function handler(req) {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const origin = req.headers.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch (e) {}
    if (host !== req.headers.get('host')) return new Response(null, { status: 403 });
  }
  let user = '';
  try { const raw = await req.text(); if (raw.length < 2000) user = String(JSON.parse(raw).user || '').slice(0, 60); } catch (e) {}
  if (user) await countOpen(user);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
