/* The token ledger: how many tokens each person has used through the site's AI (the chat panel and the
   problem generator), and how many beers that comes to, at 750 000 tokens a beer.

   There are no logins. The first time someone sends a request from a device, they are asked for their
   name; it is remembered on that device and sent with every request (as "user"), so the server can keep
   the shared totals. This file also keeps this device's own running total per name.

     notesLedger.ensureName()   resolves with the name, asking for it if this device has none yet
     notesLedger.add(usage)     records a request's Gemini usageMetadata; returns the tokens it used
     notesLedger.mine()         {name, tokens, requests} for the current name on this device
     notesLedger.beers(tokens)  tokens / 750 000 */
(function(){
  if (window.notesLedger) return;
  const NAME = 'notes-user-name', LOCAL = 'notes-ledger', PER_BEER = 750000;
  const get = k => { try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const set = (k, v) => { try{ localStorage.setItem(k, v); }catch(e){} };
  const clean = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40);

  function all(){ try{ return JSON.parse(get(LOCAL) || '{}') || {}; }catch(e){ return {}; } }
  function name(){ return clean(get(NAME)); }
  function setName(n){ n = clean(n); if (n) set(NAME, n); listeners.forEach(f => f()); return n; }
  function tokensOf(u){
    if (!u) return 0;
    return u.totalTokenCount || ((u.promptTokenCount || 0) + (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0));
  }
  function add(usage){
    const t = tokensOf(usage), n = name();
    if (!t || !n) return t;
    const a = all(); const r = a[n] || {tokens: 0, requests: 0};
    r.tokens += t; r.requests += 1; a[n] = r;
    set(LOCAL, JSON.stringify(a));
    listeners.forEach(f => f());
    return t;
  }
  function mine(){ const n = name(); const r = all()[n] || {tokens: 0, requests: 0}; return {name: n, tokens: r.tokens, requests: r.requests}; }
  const beers = t => t / PER_BEER;
  const fmtBeers = t => { const b = beers(t); return (b < 10 ? b.toFixed(2) : b.toFixed(1)) + (b === 1 ? ' beer' : ' beers'); };

  // The name prompt: a small dialog, asked once per device. Cancelling resolves with '' and nothing is sent.
  let asking = null;
  function ask(){
    if (asking) return asking;
    asking = new Promise(resolve => {
      const d = document.createElement('dialog'); d.className = 'ledger-name';
      d.innerHTML = '<form method="dialog"><h2>Who is asking?</h2>'
        + '<p>Your name keeps track of the tokens you use through The Lovely Lady, so the beers owed go to the right person (one beer per 750 000 tokens). It is asked once on this device.</p>'
        + '<input name="n" autocomplete="name" maxlength="40" placeholder="Your name" required>'
        + '<div class="row"><button class="btn" value="cancel" type="button">Cancel</button><button class="btn primary" value="ok">Save</button></div></form>';
      document.body.append(d);
      const input = d.querySelector('input'), f = d.querySelector('form');
      input.value = name();
      const done = v => { d.close(); d.remove(); asking = null; resolve(v); };
      d.querySelector('button[value="cancel"]').onclick = () => done('');
      d.addEventListener('cancel', e => { e.preventDefault(); done(''); });
      f.addEventListener('submit', e => { e.preventDefault(); const v = clean(input.value); if (v) done(setName(v)); });
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); f.requestSubmit(); } });
      d.showModal(); input.focus();
    });
    return asking;
  }
  async function ensureName(){ return name() || ask(); }

  const listeners = [];
  window.notesLedger = {PER_BEER, name, setName, ask, ensureName, add, mine, beers, fmtBeers, tokensOf,
    onChange(f){ listeners.push(f); }};
})();
