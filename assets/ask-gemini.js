/* Ask Gemini panel for notes pages. Same panel as the CS354 Week 12 page, packaged so a page
   only needs one tag at the end of <body>:

     <script src="../assets/ask-gemini.js" data-store="da344-w2"
             data-course="Data Analytics 344" data-topic="Week 2: Data Exploration"></script>

   data-store   localStorage key for this page's conversation
   data-course  module name, used in the tutor prompt
   data-topic   what the page covers, used in the tutor prompt

   The page needs a <main> element holding the notes. Chat requests go to api/chat relative to
   the page, which serve_notes.py answers at any depth. */
(function(){
  const me = document.currentScript;
  const CFG = {
    store: (me.dataset.store || location.pathname) + '-gemini-chat',
    course: me.dataset.course || 'their course',
    topic: me.dataset.topic || document.title,
  };

  document.body.insertAdjacentHTML('beforeend', `
<button id="askBtn" type="button" aria-controls="chat" aria-expanded="false">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>
  Ask Gemini
</button>

<aside id="chat" hidden aria-label="Ask Gemini about these notes">
  <div class="bar">
    <h2>Ask Gemini</h2>
    <span class="model" id="modelName"></span>
    <button class="iconbtn" id="newChat" type="button" title="Clear the conversation">New chat</button>
    <button class="iconbtn" id="closeChat" type="button" title="Close (Esc)">Close</button>
  </div>
  <div class="status" id="chatStatus" hidden></div>
  <p class="hint" id="chatHint">While this panel is open, select any text in the notes (equations included) and it is attached as context for your next question.</p>
  <div id="msgs" aria-live="polite"></div>
  <div id="ctx" aria-label="Attached excerpts"></div>
  <form id="composer">
    <textarea id="q" rows="2" placeholder="Ask about the notes, or about what you selected. Ctrl+Enter to send."></textarea>
    <div class="row">
      <label for="fullNotes"><input type="checkbox" id="fullNotes" checked> Send the full notes as background</label>
      <button id="sendBtn" type="submit" title="Send (Ctrl+Enter)">Send</button>
    </div>
  </form>
</aside>
<div class="toast" id="toast" role="status"></div>
`);

  function loadScript(src){
    const s = document.createElement('script'); s.src = src; s.async = true; document.head.append(s);
  }
  // Pages without equations do not load MathJax themselves; Gemini's answers still need it.
  // typeset:false leaves the notes alone, so a literal $ in the text is never read as maths.
  if (!window.MathJax){
    window.MathJax = {tex:{inlineMath:[['\\(','\\)'],['$','$']],displayMath:[['\\[','\\]'],['$$','$$']],tags:'none'},
      svg:{fontCache:'global'}, startup:{typeset:false}};
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.js');
  }
  if (!window.marked) loadScript('https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js');
  if (!window.DOMPurify) loadScript('https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js');

  const $ = s => document.querySelector(s);
  const chat = $('#chat'), askBtn = $('#askBtn'), msgsEl = $('#msgs'), ctxEl = $('#ctx'),
        qEl = $('#q'), sendBtn = $('#sendBtn'), statusEl = $('#chatStatus'), toastEl = $('#toast'),
        mainEl = document.querySelector('main');
  const STORE = CFG.store;
  let history = [];          // [{role:'user'|'model', text, quotes?:[{section,text}]}]
  let attached = [];         // [{section,text}]
  let busy = false, serverOK = null;

  // ---------- TeX lookup for MathJax-rendered equations ----------
  const texOf = new WeakMap();
  function indexMath(){
    try{
      for (const item of MathJax.startup.document.math){
        if (item.typesetRoot) texOf.set(item.typesetRoot, {tex:item.math, display:item.display});
      }
    }catch(e){}
  }
  function waitMath(){
    if (window.MathJax && MathJax.startup && MathJax.startup.promise) MathJax.startup.promise.then(indexMath);
    else setTimeout(waitMath, 300);
  }
  waitMath();

  // Walk a DOM range and rebuild its text, swapping rendered equations for their TeX source.
  function rangeText(range, opts={}){
    const root = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode;
    const out = [];
    const startMath = root.closest && root.closest('mjx-container');
    if (startMath){ const t = texOf.get(startMath); return t ? `\\(${t.tex}\\)` : startMath.textContent; }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n){
        if (!range.intersectsNode(n)) return NodeFilter.FILTER_REJECT;
        if (n.nodeType === 1){
          if (n.tagName === 'MJX-CONTAINER') return NodeFilter.FILTER_ACCEPT;
          if (opts.skipFigures && n.tagName.toLowerCase() === 'svg') return NodeFilter.FILTER_REJECT;
          if (n.tagName === 'STYLE' || n.tagName === 'SCRIPT') return NodeFilter.FILTER_REJECT;
          if (n.namespaceURI === 'http://www.w3.org/2000/svg'){ if (n.tagName === 'text') out.push(' '); }
          else if (getComputedStyle(n).display !== 'inline' && n.tagName !== 'BR') out.push('\n');
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())){
      if (n.nodeType === 1){ // equation
        const t = texOf.get(n);
        if (t) out.push(t.display ? `\n\\[${t.tex}\\]\n` : `\\(${t.tex}\\)`);
        else out.push(n.textContent);
        // skip its children
        let last = n; while (last.lastChild) last = last.lastChild;
        walker.currentNode = last;
      } else {
        let s = n.nodeValue;
        const ps = n.previousSibling;
        if (ps && ps.nodeType === 1 && ps.namespaceURI !== 'http://www.w3.org/2000/svg' && getComputedStyle(ps).display !== 'inline') out.push('\n');
        if (n === range.endContainer) s = s.slice(0, range.endOffset);
        if (n === range.startContainer) s = s.slice(range.startOffset - (0));
        if (n === range.startContainer && n === range.endContainer) s = n.nodeValue.slice(range.startOffset, range.endOffset);
        out.push(s);
      }
    }
    return out.join('').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').replace(/[ \t]{2,}/g,' ').trim();
  }

  function sectionName(node){
    const el = node.nodeType === 1 ? node : node.parentNode;
    const ex = el.closest('.ex, .qa'); const sec = el.closest('section');
    let name = sec ? (sec.querySelector('h2')?.textContent || '').replace(/^\d+/, '').trim() : 'Notes';
    if (ex){ const hd = ex.querySelector('.hd, .qnum'); if (hd) name += ' / ' + hd.textContent.replace(/\s+/g,' ').trim(); }
    else {
      const fig = el.closest('figure'); const cap = fig && fig.querySelector('figcaption b');
      if (cap) name += ' / ' + cap.textContent.trim();
    }
    return name;
  }

  let fullNotesCache = null;
  function fullNotes(){
    if (fullNotesCache) return fullNotesCache;
    const r = document.createRange(); r.selectNodeContents(mainEl);
    fullNotesCache = rangeText(r, {skipFigures:true});
    return fullNotesCache;
  }

  // ---------- attaching selections ----------
  let selTimer = null;
  function onSelect(){
    clearTimeout(selTimer);
    selTimer = setTimeout(() => {
      if (chat.hidden) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (!mainEl.contains(range.commonAncestorContainer) && !range.intersectsNode(mainEl)) return;
      if (chat.contains(range.commonAncestorContainer)) return;
      const text = rangeText(range);
      if (text.length < 2) return;
      if (attached.some(a => a.text === text)) return;
      const section = sectionName(range.startContainer);
      attached.push({section, text});
      renderChips();
      const rect = range.getBoundingClientRect();
      toast('Attached from ' + section.split(' / ')[0], rect);
    }, 220);
  }
  document.addEventListener('mouseup', onSelect);
  document.addEventListener('touchend', onSelect);
  document.addEventListener('keyup', e => { if (e.shiftKey || e.key === 'Shift') onSelect(); });

  function renderChips(){
    ctxEl.innerHTML = '';
    attached.forEach((a, i) => {
      const c = document.createElement('div'); c.className = 'chip';
      const s = document.createElement('span');
      const b = document.createElement('b'); b.textContent = a.section.split(' / ').pop() + ': ';
      s.append(b, document.createTextNode(a.text.replace(/\s+/g,' ')));
      s.title = a.text;
      const x = document.createElement('button'); x.type = 'button'; x.textContent = '×';
      x.setAttribute('aria-label', 'Remove this excerpt');
      x.onclick = () => { attached.splice(i,1); renderChips(); };
      c.append(s, x); ctxEl.append(c);
    });
  }

  function toast(text, rect){
    toastEl.textContent = text;
    const x = rect && rect.width ? Math.min(rect.left, window.innerWidth - 260) : 20;
    const y = rect && rect.width ? Math.max(8, rect.top - 34) : 20;
    toastEl.style.left = Math.max(8, x) + 'px'; toastEl.style.top = y + 'px';
    toastEl.classList.add('on'); clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('on'), 1400);
  }

  // ---------- rendering messages ----------
  function renderMarkdownWithMath(text){
    const stash = [];
    const keep = m => { stash.push(m); return `@@MATH${stash.length-1}@@`; };
    let src = text
      .replace(/\$\$[\s\S]+?\$\$/g, keep)
      .replace(/\\\[[\s\S]+?\\\]/g, keep)
      .replace(/\\\([\s\S]+?\\\)/g, keep)
      .replace(/(^|[^\\$])\$(?!\s)([^\n$]+?)\$/g, (m, pre, body) => pre + keep('$' + body + '$'));
    let html;
    if (window.marked){ html = marked.parse(src, {breaks:false, gfm:true}); }
    else { html = '<p>' + src.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n\n/g,'</p><p>') + '</p>'; }
    if (window.DOMPurify) html = DOMPurify.sanitize(html);
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return html.replace(/@@MATH(\d+)@@/g, (m, i) => esc(stash[+i]));
  }

  function bubble(m){
    const d = document.createElement('div');
    if (m.role === 'user'){
      d.className = 'msg user';
      (m.quotes||[]).forEach(q => {
        const qd = document.createElement('div'); qd.className = 'quote';
        const b = document.createElement('b'); b.textContent = q.section.split(' / ').pop() + '\n';
        qd.append(b, document.createTextNode(q.text)); d.append(qd);
      });
      const t = document.createElement('div'); t.textContent = m.text; t.style.whiteSpace = 'pre-wrap'; d.append(t);
    } else if (m.role === 'model'){
      d.className = 'msg model';
      d.innerHTML = '<div class="who">Gemini</div><div class="body"></div>';
      d.querySelector('.body').innerHTML = renderMarkdownWithMath(m.text);
    } else { d.className = 'msg err'; d.textContent = m.text; }
    return d;
  }
  function typeset(el){
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([el]).catch(()=>{});
  }
  function renderAll(){
    msgsEl.innerHTML = '';
    history.forEach(m => { const b = bubble(m); msgsEl.append(b); typeset(b); });
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  function save(){ try{ localStorage.setItem(STORE, JSON.stringify(history.slice(-40))); }catch(e){} }
  function load(){ try{ const v = JSON.parse(localStorage.getItem(STORE) || '[]'); if (Array.isArray(v)) history = v; }catch(e){} }

  // ---------- server status ----------
  const RUN_HELP = 'Ask Gemini cannot be reached from here. Reload the page, or if you opened this file straight from disk, use the deployed site instead.';
  async function checkServer(){
    statusEl.hidden = true;
    if (location.protocol === 'file:'){ setStatus(RUN_HELP); serverOK = false; return; }
    try{
      const r = await fetch('api/health', {cache:'no-store'});
      if (!r.ok) throw new Error();
      const h = await r.json();
      $('#modelName').textContent = h.model || '';
      if (!h.hasKey){ setStatus('The server has no Gemini API key yet (<code>GEMINI_API_KEY</code>).'); }
      serverOK = true;
    }catch(e){ setStatus(RUN_HELP); serverOK = false; }
  }
  function setStatus(html){ statusEl.innerHTML = html; statusEl.hidden = false; }

  // ---------- sending ----------
  function buildSystem(){
    let s = 'You are a patient tutor helping a third-year Stellenbosch University student study ' + CFG.course + ' (' + CFG.topic + '). '
      + 'Ground answers in the course notes when they cover the question, and say so when you go beyond them. '
      + 'Use LaTeX for maths: $...$ inline and $$...$$ for display. Show working step by step for calculations and check the arithmetic. '
      + 'Be concise. Do not use em-dashes. The student may attach excerpts from the notes; treat those as the focus of the question.';
    if ($('#fullNotes').checked) s += '\n\n=== COURSE NOTES (' + CFG.topic + ') ===\n' + fullNotes();
    return s;
  }
  function toContents(){
    return history.filter(m => m.role === 'user' || m.role === 'model').map(m => {
      let text = m.text;
      if (m.role === 'user' && m.quotes && m.quotes.length){
        text = m.quotes.map((q,i) => `Excerpt ${i+1} (from: ${q.section}):\n"""\n${q.text}\n"""`).join('\n\n') + '\n\nQuestion: ' + (m.text || 'Explain these excerpts.');
      }
      return {role: m.role, parts: [{text}]};
    });
  }

  async function send(){
    if (busy) return;
    const text = qEl.value.trim();
    if (!text && !attached.length) return;
    if (serverOK === false){ await checkServer(); if (serverOK === false) return; }
    history.push({role:'user', text: text || 'Explain this.', quotes: attached.slice()});
    attached = []; renderChips(); qEl.value = ''; autosize();
    { const ub = bubble(history[history.length-1]); msgsEl.append(ub); typeset(ub); }
    const live = {role:'model', text:''};
    const liveEl = bubble(live); liveEl.querySelector('.body').innerHTML = '<span class="typing"></span>';
    msgsEl.append(liveEl); msgsEl.scrollTop = msgsEl.scrollHeight;
    busy = true; sendBtn.disabled = true;
    try{
      const r = await fetch('api/chat', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({system: buildSystem(), contents: toContents()})});
      if (!r.ok){
        let msg = 'Request failed (' + r.status + ').';
        try{ msg = (await r.json()).error || msg; }catch(e){}
        throw new Error(msg);
      }
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '', lastPaint = 0;
      for(;;){
        const {done, value} = await reader.read();
        if (done) break;
        buf += dec.decode(value, {stream:true});
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0){
          const line = buf.slice(0, idx).trim(); buf = buf.slice(idx+1);
          if (!line.startsWith('data:')) continue;
          try{
            const j = JSON.parse(line.slice(5));
            const parts = j.candidates?.[0]?.content?.parts || [];
            for (const p of parts) if (p.text && !p.thought) live.text += p.text;
            if (j.promptFeedback?.blockReason) live.text += '\n\n(Blocked by Gemini: ' + j.promptFeedback.blockReason + ')';
          }catch(e){}
        }
        const now = performance.now();
        if (now - lastPaint > 120){
          liveEl.querySelector('.body').innerHTML = renderMarkdownWithMath(live.text) + '<span class="typing"></span>';
          msgsEl.scrollTop = msgsEl.scrollHeight; lastPaint = now;
        }
      }
      if (!live.text) live.text = '(No answer came back. Try again or rephrase.)';
      liveEl.querySelector('.body').innerHTML = renderMarkdownWithMath(live.text);
      typeset(liveEl);
      history.push(live); save();
    }catch(err){
      liveEl.remove();
      const e = {role:'error', text: String(err.message || err)};
      msgsEl.append(bubble(e));
      if (/Failed to fetch|NetworkError|Load failed/i.test(e.text)) { serverOK = false; setStatus(RUN_HELP); }
      // let the user retry: put their question back
      const last = history.pop(); qEl.value = last.text; attached = last.quotes || []; renderChips();
    }finally{
      busy = false; sendBtn.disabled = false; msgsEl.scrollTop = msgsEl.scrollHeight;
    }
  }

  // ---------- open / close ----------
  function openChat(){
    chat.hidden = false; document.body.classList.add('chat-open'); askBtn.setAttribute('aria-expanded','true');
    if (serverOK === null) checkServer();
    renderAll(); setTimeout(() => qEl.focus(), 30);
    onSelect(); // attach anything already selected
  }
  function closeChat(){
    chat.hidden = true; document.body.classList.remove('chat-open'); askBtn.setAttribute('aria-expanded','false'); askBtn.focus();
  }
  function autosize(){ qEl.style.height = 'auto'; qEl.style.height = Math.min(180, qEl.scrollHeight + 2) + 'px'; }

  askBtn.onclick = openChat;
  $('#closeChat').onclick = closeChat;
  $('#newChat').onclick = () => { history = []; attached = []; save(); renderChips(); renderAll(); qEl.focus(); };
  $('#composer').addEventListener('submit', e => { e.preventDefault(); send(); });
  qEl.addEventListener('input', autosize);
  qEl.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); send(); } });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !chat.hidden) closeChat();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.shiftKey){ e.preventDefault(); chat.hidden ? openChat() : qEl.focus(); }
  });
  load();
})();
