// Tells the Ask Gemini panel whether the deployed site has a key, and which model it uses.
export const config = { runtime: 'edge' };

export default function handler() {
  return new Response(JSON.stringify({
    ok: true,
    hasKey: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
