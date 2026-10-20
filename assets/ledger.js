/* The token ledger: how many tokens each person has used through the site's AI (the chat panel and the
   problem generator), and how many beers that comes to, at 750 000 tokens a beer.

   There are no logins. The first time any page loads on a device, a dialog asks for the reader's name
   and says, once, that using the AI costs beer. Both are remembered on that device. The name is sent
   with every AI request (as "user"), and every page open is counted in the background once the page
   has loaded (api/visit), so the shared ledger on amavadata shows who uses the site (api/_ledger.js).
   Amounts are shown in beers first, with the tokens in brackets.

     notesLedger.ensureName()   resolves with the name, showing the notice first if this device needs it
     notesLedger.add(usage)     records a request's Gemini usageMetadata here; returns the tokens it used
     notesLedger.mine()         {name, tokens, requests} for the current name on this device
     notesLedger.fmt(tokens)    "0.06 beers (42,000 tokens)"
     notesLedger.usageUrl       the usage page */
(function(){
  if (window.notesLedger) return;
  const NAME = 'notes-user-name', LOCAL = 'notes-ledger', OK = 'notes-beer-ok', PER_BEER = 750000;
  const me = document.currentScript;
  const usageUrl = me ? new URL('../usage.html', me.src).href : 'usage.html';
  const visitUrl = me ? new URL('../api/visit', me.src).href : 'api/visit';
  const get = k => { try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const set = (k, v) => { try{ localStorage.setItem(k, v); }catch(e){} };
  const clean = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const listeners = [];

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
  function beerText(t){
    const b = beers(t);
    const s = b === 0 ? '0' : b < 0.1 ? b.toFixed(3) : b < 10 ? b.toFixed(2) : b.toFixed(1);
    return s + (s === '1.00' ? ' beer' : ' beers');
  }
  const fmt = t => beerText(t) + ' (' + Math.round(t).toLocaleString() + ' tokens)';

  // The notice and name prompt, shown once per device before the first request. Cancelling resolves
  // with '' and nothing is sent.
  let asking = null;
  function ask(change){
    if (asking) return asking;
    asking = new Promise(resolve => {
      const d = document.createElement('dialog'); d.className = 'ledger-name';
      d.innerHTML = '<form method="dialog"><h2>' + (change ? 'Change your name' : 'What is your name?') + '</h2>'
        + (change ? '' : '<p><b>Using The Lovely Lady costs beer.</b> Every answer and every generated problem is paid for in API tokens. <b>Each 750 000 tokens you use is one beer owed.</b> A chat question with the notes attached costs roughly a hundredth of a beer, more as the conversation grows; a problem generated from several weeks of notes and past papers can cost a tenth or more.</p>')
        + '<p>Your page opens and AI usage are recorded under your name on the <a href="' + usageUrl + '" target="_blank" rel="noopener">usage page</a>, which everyone can see.</p>'
        + '<label>Your name<input name="n" autocomplete="name" maxlength="40" placeholder="Your name" required></label>'
        + '<div class="row"><button class="btn" value="cancel" type="button">Cancel</button><button class="btn primary" value="ok">' + (change ? 'Save' : 'Continue') + '</button></div></form>';
      document.body.append(d);
      const input = d.querySelector('input'), f = d.querySelector('form');
      input.value = name();
      const done = v => { d.close(); d.remove(); asking = null; resolve(v); };
      d.querySelector('button[value="cancel"]').onclick = () => done('');
      d.addEventListener('cancel', e => { e.preventDefault(); done(''); });
      f.addEventListener('submit', e => {
        e.preventDefault(); const v = clean(input.value); if (!v) return;
        set(OK, '1'); done(setName(v));
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); f.requestSubmit(); } });
      d.showModal(); input.focus();
    });
    return asking;
  }
  async function ensureName(){ return (name() && get(OK)) ? name() : ask(false); }

  // Count this page open under the reader's name. A beacon after the page has loaded and gone idle:
  // it never delays the page, and a failure is ignored.
  function countOpen(){
    const n = name(); if (!n) return;
    const body = JSON.stringify({user: n, page: location.pathname});
    try{
      if (!(navigator.sendBeacon && navigator.sendBeacon(visitUrl, new Blob([body], {type: 'text/plain'}))))
        fetch(visitUrl, {method: 'POST', body, keepalive: true}).catch(() => {});
    }catch(e){}
  }
  function afterLoad(f){
    const idle = () => (window.requestIdleCallback ? requestIdleCallback(f, {timeout: 3000}) : setTimeout(f, 500));
    document.readyState === 'complete' ? idle() : addEventListener('load', idle, {once: true});
  }
  afterLoad(async () => {
    if (location.protocol === 'file:') return;
    if (!(name() && get(OK))) await ask(false);   // a new device: ask who it is, once
    countOpen();
  });

  window.notesLedger = {PER_BEER, usageUrl, name, setName, ask: () => ask(true), ensureName, add, mine, beers, beerText, fmt, tokensOf,
    onChange(f){ listeners.push(f); }};
})();
