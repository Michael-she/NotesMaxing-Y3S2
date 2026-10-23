/* Pen and text annotations, and saving the page as a PDF. site.js loads this on every notes page (a
   page whose ask-gemini.js script tag has a data-store key).

   Two buttons sit beside the theme button:
     Annotate      opens the annotation bar: pen, highlighter, text note, eraser, four colours, undo,
                   and a menu to export, import or clear annotations. Esc or Done closes it.
     Save as PDF   a picture of the page as it is on screen (theme, opened answers, figures in their
                   current state, annotations), cut into A4 pages between paragraphs, figures and
                   rows. Because the PDF is images of the page, it looks exactly like the screen; its
                   text cannot be selected.

   Annotations stay in this browser (localStorage "notes-annot-<data-store>"). Each mark is pinned to
   the paragraph, figure or heading it was drawn on, so it moves with it when answers are opened or
   the page reflows; a mark on a hidden paragraph (a closed answer) is hidden with it. Export writes
   every page's annotations to one .json file; import merges such a file into this browser. */
(function(){
  const host = document.querySelector('script[data-store]');
  const main = document.querySelector('main');
  if (!host || !main || window.notesAnnotate) return;
  const PREFIX = 'notes-annot-', KEY = PREFIX + host.dataset.store, FORMAT = 'notesmaxing-annotations';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  // A mark is pinned to the smallest of these that it starts on (or to <main> itself).
  const ANCHOR = 'p,li,dt,dd,figure,table,pre,blockquote,h1,h2,h3,h4,.eq,.formula,.qp,summary,header';

  const get = k => { try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const set = (k, v) => { try{ v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); return true; }catch(e){ return false; } };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function el(tag, cls, text){
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const ICON = {
    pen: '<path d="M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20z"/><path d="M14.5 6.5l3 3"/>',
    hl: '<path d="M9 15l-3 3v2h4l3-3"/><path d="M9 15l7.5-7.5a2.1 2.1 0 0 1 3 3L12 18z"/><path d="M4 21h16"/>',
    text: '<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>',
    erase: '<path d="M8 20h12"/><path d="M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H9z"/><path d="M9.5 10.5l5 5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    pdf: '<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19h14"/>',
  };
  const icon = n => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + '</svg>';

  // ---------- storage ----------
  function load(key){
    try{ const d = JSON.parse(get(key) || 'null'); return d && Array.isArray(d.items) ? d.items.filter(ok) : []; }catch(e){ return []; }
  }
  function ok(it){
    return it && typeof it.id === 'string' && (it.k === 'ink' ? Array.isArray(it.p) : it.k === 'note' && typeof it.text === 'string');
  }
  let items = load(KEY);
  let saveTimer = null;
  function save(){ clearTimeout(saveTimer); saveTimer = null; if (!set(KEY, items.length ? JSON.stringify({v: 1, items}) : null)) say('Could not save: browser storage is full or blocked.'); }
  function saveSoon(){ clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
  addEventListener('pagehide', () => { if (saveTimer) save(); });

  // ---------- anchors ----------
  function pathOf(a){
    const p = [];
    while (a && a !== main){ const up = a.parentElement; p.unshift(Array.prototype.indexOf.call(up.children, a)); a = up; }
    return p.join('.');
  }
  function resolve(path){
    let a = main;
    if (path) for (const i of path.split('.')){ a = a && a.children[+i]; }
    return a || null;
  }
  function anchorAt(cx, cy){
    // the innermost one whose box holds the point: descendants come after their ancestors
    let a = main;
    for (const e of main.querySelectorAll(ANCHOR)){
      if (layer.contains(e)) continue;
      const r = e.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) a = e;
    }
    return a;
  }
  // Where an anchor's top-left corner is, in <main>'s coordinates; null if it is hidden.
  function originOf(it, mr){
    const a = resolve(it.a);
    if (!a) return {x: it.o[0], y: it.o[1]};            // the page has changed: fall back to where it was
    // checkVisibility also catches the inside of a closed <details>, which still has a box in Chrome
    if (a.checkVisibility ? !a.checkVisibility() : !a.getClientRects().length) return null;
    const r = a.getBoundingClientRect();
    return {x: r.left - mr.left, y: r.top - mr.top};
  }
  function mainPoint(e){ const mr = main.getBoundingClientRect(); return {x: e.clientX - mr.left, y: e.clientY - mr.top}; }

  // ---------- the layer over <main> ----------
  main.classList.add('annot-host');
  const layer = el('div', 'annot-layer');
  const ink = document.createElementNS(SVGNS, 'svg'); ink.setAttribute('class', 'annot-ink');
  const gHl = document.createElementNS(SVGNS, 'g'), gPen = document.createElementNS(SVGNS, 'g');
  ink.append(gHl, gPen); layer.append(ink);
  main.append(layer);                                  // last, so the anchors' child indices are unchanged
  const nodes = new Map();

  const r1 = v => Math.round(v * 10) / 10;
  function pathD(p){
    if (p.length <= 4) return 'M' + p[0] + ' ' + p[1] + 'L' + (p[2] ?? p[0] + .1) + ' ' + (p[3] ?? p[1]);
    let d = 'M' + p[0] + ' ' + p[1];
    for (let i = 2; i < p.length - 2; i += 2){
      d += 'Q' + p[i] + ' ' + p[i+1] + ' ' + r1((p[i] + p[i+2]) / 2) + ' ' + r1((p[i+1] + p[i+3]) / 2);
    }
    return d + 'L' + p[p.length-2] + ' ' + p[p.length-1];
  }
  function draw(it){
    let n = nodes.get(it.id);
    if (it.k === 'ink'){
      if (!n){ n = document.createElementNS(SVGNS, 'path'); nodes.set(it.id, n); (it.tool === 'hl' ? gHl : gPen).append(n); }
      n.setAttribute('class', (it.tool === 'hl' ? 'hl hc-' : 'pen pc-') + (it.c || 1));
      n.setAttribute('d', pathD(it.p));
      if (it.tool !== 'hl') n.style.strokeWidth = it.w || 2.2;
    } else if (!n){
      n = noteNode(it); nodes.set(it.id, n); layer.append(n);
    }
    return n;
  }
  function undraw(it){ const n = nodes.get(it.id); if (n) n.remove(); nodes.delete(it.id); }

  let placing = 0;
  function place(){
    placing = 0;
    const mr = main.getBoundingClientRect();
    for (const it of items){
      const n = nodes.get(it.id); if (!n) continue;
      const o = originOf(it, mr);
      if (it.k === 'ink'){
        if (o) n.setAttribute('transform', 'translate(' + r1(o.x) + ' ' + r1(o.y) + ')');
        n.style.display = o ? '' : 'none';
      } else {
        n.hidden = !o;
        // kept inside the column, so a note is never cut off on screen or in the PDF
        if (o){ n.style.left = r1(Math.max(0, Math.min(o.x + it.x, mr.width - n.offsetWidth))) + 'px'; n.style.top = r1(o.y + it.y) + 'px'; }
      }
    }
  }
  const placeSoon = () => { if (!placing) placing = requestAnimationFrame(place); };
  function render(){ items.forEach(draw); place(); }

  // ---------- text notes ----------
  function noteNode(it){
    const n = el('div', 'annot-note');
    const bar = el('div', 'annot-bar'); bar.title = 'Drag to move';
    const x = el('button', 'annot-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Delete note'); x.title = 'Delete note';
    const ta = el('textarea'); ta.value = it.text; ta.rows = 1; ta.setAttribute('aria-label', 'Note');
    ta.placeholder = 'Note';
    bar.append(x); n.append(bar, ta);
    const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    ta.addEventListener('input', () => { it.text = ta.value; grow(); saveSoon(); });
    ta.addEventListener('blur', () => { if (!ta.value.trim() && items.includes(it)) remove([it], false); });
    ta.addEventListener('keydown', e => { if (e.key === 'Escape') ta.blur(); });
    x.addEventListener('click', () => remove([it], true));
    requestAnimationFrame(grow);
    // drag by the bar; the note stays pinned to the same anchor
    bar.addEventListener('pointerdown', e => {
      if (e.target === x) return;
      e.preventDefault(); bar.setPointerCapture(e.pointerId);
      const sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y;
      const move = ev => { it.x = r1(ox + ev.clientX - sx); it.y = r1(oy + ev.clientY - sy); place(); };
      const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); save(); };
      bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
    return n;
  }

  // ---------- editing ----------
  const history = [];
  function add(list, record){
    list.forEach(it => { items.push(it); draw(it); });
    place(); save();
    if (record) history.push({add: list});
  }
  function remove(list, record){
    const ids = new Set(list.map(it => it.id));
    items = items.filter(it => !ids.has(it.id));
    list.forEach(undraw); save();
    if (record) history.push({del: list});
  }
  function undo(){
    const h = history.pop(); if (!h) return say('Nothing to undo.');
    if (h.add) remove(h.add, false); else add(h.del, false);
  }

  // ---------- tools ----------
  let mode = '', colour = {pen: 1, hl: 1}, cur = null, erasing = false, open = false;
  const WIDTH = {pen: 2.2};

  function newItem(kind, e){
    const a = anchorAt(e.clientX, e.clientY), mr = main.getBoundingClientRect(), r = a.getBoundingClientRect();
    return {id: uid(), k: kind, a: pathOf(a), o: [r1(r.left - mr.left), r1(r.top - mr.top)]};
  }
  layer.addEventListener('pointerdown', e => {
    if (!mode || (e.target !== layer && e.target !== ink && !ink.contains(e.target))) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (mode === 'text'){
      const it = newItem('note', e), p = mainPoint(e);
      it.x = r1(p.x - it.o[0] - 8); it.y = r1(p.y - it.o[1] - 10); it.text = '';
      add([it], true);
      const ta = nodes.get(it.id).querySelector('textarea'); ta.focus();
      return;
    }
    layer.setPointerCapture(e.pointerId);
    if (mode === 'erase'){ erasing = true; eraseAt(e); return; }
    const it = newItem('ink', e), p = mainPoint(e);
    it.tool = mode; it.c = colour[mode]; if (mode === 'pen') it.w = WIDTH.pen;
    it.p = [r1(p.x - it.o[0]), r1(p.y - it.o[1])];
    cur = it; draw(it);
    nodes.get(it.id).setAttribute('transform', 'translate(' + it.o[0] + ' ' + it.o[1] + ')');
  });
  layer.addEventListener('pointermove', e => {
    if (erasing){ eraseAt(e); return; }
    if (!cur) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const mr = main.getBoundingClientRect();
    for (const ev of (evs.length ? evs : [e])){
      const x = r1(ev.clientX - mr.left - cur.o[0]), y = r1(ev.clientY - mr.top - cur.o[1]);
      const n = cur.p.length;
      if (Math.hypot(x - cur.p[n-2], y - cur.p[n-1]) >= 1.5) cur.p.push(x, y);
    }
    nodes.get(cur.id).setAttribute('d', pathD(cur.p));
  });
  function endStroke(){
    erasing = false;
    if (!cur) return;
    const it = cur; cur = null; undraw(it);
    add([it], true);
  }
  layer.addEventListener('pointerup', endStroke);
  layer.addEventListener('pointercancel', endStroke);

  // The eraser removes whole strokes and notes it passes over.
  function segDist(px, py, ax, ay, bx, by){
    const dx = bx - ax, dy = by - ay, l = dx*dx + dy*dy;
    const t = l ? Math.max(0, Math.min(1, ((px - ax)*dx + (py - ay)*dy) / l)) : 0;
    return Math.hypot(px - ax - t*dx, py - ay - t*dy);
  }
  function eraseAt(e){
    const p = mainPoint(e), mr = main.getBoundingClientRect(), gone = [];
    for (const it of items){
      const o = originOf(it, mr); if (!o) continue;
      if (it.k === 'note'){
        const r = nodes.get(it.id).getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) gone.push(it);
        continue;
      }
      const x = p.x - o.x, y = p.y - o.y, tol = it.tool === 'hl' ? 9 : 7, q = it.p;
      for (let i = 0; i < q.length; i += 2){
        if (segDist(x, y, q[i], q[i+1], q[i+2] ?? q[i], q[i+3] ?? q[i+1]) <= tol){ gone.push(it); break; }
      }
    }
    if (gone.length) remove(gone, true);
  }

  // ---------- buttons and the annotation bar ----------
  const tools = el('div', 'page-tools');
  const annBtn = el('button', 'tool-btn'); annBtn.type = 'button'; annBtn.innerHTML = icon('pen');
  annBtn.title = 'Annotate'; annBtn.setAttribute('aria-label', 'Annotate'); annBtn.setAttribute('aria-pressed', 'false');
  const pdfBtn = el('button', 'tool-btn'); pdfBtn.type = 'button'; pdfBtn.innerHTML = icon('pdf');
  pdfBtn.title = 'Save as PDF'; pdfBtn.setAttribute('aria-label', 'Save as PDF');
  tools.append(pdfBtn, annBtn);

  const bar = el('div', 'annot-tools'); bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Annotation tools'); bar.hidden = true;
  const modeBtns = {};
  [['pen', 'Pen'], ['hl', 'Highlighter'], ['text', 'Text note'], ['erase', 'Eraser']].forEach(([m, label]) => {
    const b = el('button', 'ab'); b.type = 'button'; b.innerHTML = icon(m); b.title = label; b.setAttribute('aria-label', label);
    b.onclick = () => setMode(m); modeBtns[m] = b; bar.append(b);
  });
  bar.append(el('span', 'sep'));
  const swatches = [1, 2, 3, 4].map(c => {
    const b = el('button', 'ab sw'); b.type = 'button'; b.append(el('i'));
    b.onclick = () => { const t = mode === 'hl' ? 'hl' : 'pen'; colour[t] = c; if (mode !== 'pen' && mode !== 'hl') setMode('pen'); paint(); };
    bar.append(b); return b;
  });
  const PEN_NAMES = ['Ink', 'Red', 'Blue', 'Teal'], HL_NAMES = ['Yellow', 'Green', 'Pink', 'Blue'];
  bar.append(el('span', 'sep'));
  const undoBtn = el('button', 'ab'); undoBtn.type = 'button'; undoBtn.innerHTML = icon('undo'); undoBtn.title = 'Undo (Ctrl+Z)'; undoBtn.setAttribute('aria-label', 'Undo');
  undoBtn.onclick = undo;
  const moreBtn = el('button', 'ab'); moreBtn.type = 'button'; moreBtn.innerHTML = icon('more'); moreBtn.title = 'More'; moreBtn.setAttribute('aria-label', 'More');
  moreBtn.setAttribute('aria-haspopup', 'menu'); moreBtn.setAttribute('aria-expanded', 'false');
  const doneBtn = el('button', 'btn primary done', 'Done'); doneBtn.type = 'button'; doneBtn.onclick = () => toggle(false);
  const menu = el('div', 'annot-menu'); menu.setAttribute('role', 'menu'); menu.hidden = true;
  const mItem = (text, f) => { const b = el('button', '', text); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.onclick = () => { showMenu(false); f(); }; menu.append(b); };
  mItem('Export annotations', exportAll);
  mItem('Import annotations', () => picker.click());
  mItem('Clear this page', () => {
    if (!items.length) return say('There are no annotations on this page.');
    if (confirm('Delete every annotation on this page? Undo brings them back until you leave the page.')) remove(items.slice(), true);
  });
  const picker = el('input'); picker.type = 'file'; picker.accept = '.json,application/json'; picker.hidden = true;
  picker.onchange = () => { const f = picker.files[0]; picker.value = ''; if (f) importFile(f); };
  const showMenu = on => { menu.hidden = !on; moreBtn.setAttribute('aria-expanded', String(on)); };
  moreBtn.onclick = () => showMenu(menu.hidden);
  bar.append(undoBtn, moreBtn, doneBtn, menu, picker);

  const msg = el('div', 'page-msg'); msg.setAttribute('role', 'status'); msg.hidden = true;
  let msgTimer = null;
  function say(text, stay){
    msg.textContent = text; msg.hidden = !text; clearTimeout(msgTimer);
    if (text && !stay) msgTimer = setTimeout(() => { msg.hidden = true; }, 3500);
  }

  function paint(){
    for (const m in modeBtns) modeBtns[m].setAttribute('aria-pressed', String(mode === m));
    const t = mode === 'hl' ? 'hl' : 'pen', names = t === 'hl' ? HL_NAMES : PEN_NAMES;
    swatches.forEach((b, i) => {
      b.firstChild.className = (t === 'hl' ? 'hc-' : 'pc-') + (i + 1);
      b.setAttribute('aria-pressed', String(colour[t] === i + 1 && (mode === 'pen' || mode === 'hl')));
      b.title = names[i]; b.setAttribute('aria-label', names[i]);
    });
    layer.classList.toggle('drawing', !!mode);
    layer.dataset.mode = mode;
  }
  function setMode(m){ mode = m; showMenu(false); paint(); }
  function toggle(on){
    open = on; bar.hidden = !on; annBtn.setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('annotating', on);
    if (!on){ showMenu(false); setMode(''); if (document.activeElement && layer.contains(document.activeElement)) document.activeElement.blur(); }
    else setMode(mode || 'pen');
  }
  annBtn.onclick = () => toggle(!open);
  document.addEventListener('keydown', e => {
    if (!open) return;
    const typing = e.target.closest && e.target.closest('textarea,input,select,[contenteditable]');
    if (e.key === 'Escape' && !typing){ menu.hidden ? toggle(false) : showMenu(false); }
    else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing){ e.preventDefault(); undo(); }
  });
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && e.target !== moreBtn && !moreBtn.contains(e.target)) showMenu(false); });

  // ---------- export and import ----------
  function download(name, blob){
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function exportAll(){
    if (saveTimer) save();
    const pages = {}; let count = 0;
    try{
      for (let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if (!k || !k.startsWith(PREFIX)) continue;
        const list = load(k); if (!list.length) continue;
        pages[k.slice(PREFIX.length)] = {items: list}; count += list.length;
      }
    }catch(e){}
    if (!count) return say('There are no annotations to export yet.');
    const data = {format: FORMAT, version: 1, exported: new Date().toISOString(), pages};
    download('notesmaxing-annotations-' + new Date().toISOString().slice(0, 10) + '.json',
      new Blob([JSON.stringify(data)], {type: 'application/json'}));
    const n = Object.keys(pages).length;
    say('Exported ' + count + (count === 1 ? ' annotation' : ' annotations') + ' from ' + n + (n === 1 ? ' page.' : ' pages.'));
  }
  async function importFile(f){
    let data;
    try{ data = JSON.parse(await f.text()); }catch(e){ return say('That file is not an annotations export.'); }
    if (!data || data.format !== FORMAT || !data.pages || typeof data.pages !== 'object') return say('That file is not an annotations export.');
    let added = 0, pages = 0;
    for (const [store, page] of Object.entries(data.pages)){
      const incoming = (page && Array.isArray(page.items) ? page.items : []).filter(ok);
      if (!incoming.length) continue;
      const key = PREFIX + store, have = key === KEY ? items : load(key), byId = new Map(have.map(it => [it.id, it]));
      let n = 0;
      for (const it of incoming){ if (!byId.has(it.id)) n++; byId.set(it.id, it); }
      const merged = [...byId.values()];
      if (key === KEY){ items.forEach(undraw); items = merged; render(); }
      if (!set(key, JSON.stringify({v: 1, items: merged}))) return say('Could not save: browser storage is full or blocked.');
      added += n; pages++;
    }
    say(pages ? 'Imported ' + added + (added === 1 ? ' new annotation' : ' new annotations') + ' for ' + pages + (pages === 1 ? ' page.' : ' pages.')
              : 'That file has no annotations in it.');
  }

  // ---------- Save as PDF ----------
  // The page is copied into an SVG <foreignObject> with the site's styles, drawn to a canvas one A4
  // page at a time, and the pictures are put into a PDF with jsPDF. Media queries are evaluated now,
  // against the real window, so the copy is laid out exactly like the screen.
  let jspdfReady = null;
  function loadJsPDF(){
    if (window.jspdf) return Promise.resolve();
    return jspdfReady ||= new Promise((resolve, reject) => {
      const s = el('script'); s.src = JSPDF; s.async = true;
      s.onload = () => resolve(); s.onerror = () => { jspdfReady = null; reject(new Error('Could not load the PDF library.')); };
      document.head.append(s);
    });
  }
  function rulesText(rules){
    let out = '';
    for (const r of rules){
      if (r.type === CSSRule.MEDIA_RULE){ if (matchMedia(r.media.mediaText).matches) out += rulesText(r.cssRules); }
      else if (r.type === CSSRule.IMPORT_RULE){ try{ if (r.styleSheet) out += rulesText(r.styleSheet.cssRules); }catch(e){} }
      // html and body rules go to the copy's root, so it inherits line-height as a ratio, not as pixels
      else if (r.type === CSSRule.STYLE_RULE && /^(html|body)$/.test(r.selectorText)) out += r.cssText.replace(r.selectorText, '.pdf-root') + '\n';
      else out += r.cssText + '\n';
    }
    return out;
  }
  function pageCSS(){
    let out = '';
    for (const s of document.styleSheets){
      if (s.media && s.media.mediaText && !matchMedia(s.media.mediaText).matches) continue;
      let rules; try{ rules = s.cssRules; }catch(e){ continue; }   // the cross-origin font sheet: see fontCSS
      out += rulesText(rules);
    }
    return out;
  }
  const toDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  // The page's web fonts, embedded, since an SVG image may not fetch anything. Only the subsets the notes use.
  let fontsReady = null;
  function fontCSS(){
    return fontsReady ||= (async () => {
      let out = '';
      for (const link of document.querySelectorAll('link[rel="stylesheet"][href^="https://fonts.googleapis.com"]')){
        try{
          const css = await (await fetch(link.href)).text();
          const faces = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)]
            .filter(m => ['latin', 'latin-ext', 'greek'].includes(m[1])).map(m => m[2]);
          const done = await Promise.all(faces.map(async face => {
            const url = (face.match(/url\(([^)]+)\)/) || [])[1];
            if (!url) return '';
            const data = await toDataURL(await (await fetch(url.replace(/['"]/g, ''))).blob());
            return face.replace(url, data);
          }));
          out += done.join('\n');
        }catch(e){}
      }
      return out;
    })();
  }
  // Where a page may end: between paragraphs, rows, figures and marks, never through one.
  const UNBREAKABLE = 'p,li,dt,dd,tr,figure,pre,blockquote,h1,h2,h3,h4,summary,mjx-container,svg,img,.eq,.formula,.ans,.plan,.fig-ctl,.anim-controls,.annot-note';
  function breaks(height){
    const mr = main.getBoundingClientRect(), spans = [];
    for (const e of main.querySelectorAll(UNBREAKABLE)){
      if (e.closest('.annot-ink') || e === ink) continue;
      const r = e.getBoundingClientRect(); if (!r.height) continue;
      const keep = /^H[1-4]$/.test(e.tagName) ? 60 : 0;          // keep a heading with what follows it
      spans.push([r.top - mr.top, r.bottom - mr.top + keep]);
    }
    for (const n of gPen.children) spans.push(box(n, mr));
    for (const n of gHl.children) spans.push(box(n, mr));
    spans.sort((a, b) => a[0] - b[0]);
    const cuts = []; let end = -Infinity;
    for (const [t, b] of spans){
      if (t > end && end > -Infinity) cuts.push(t - Math.min(10, (t - end) / 2));
      end = Math.max(end, b);
    }
    cuts.push(height);
    return cuts;
  }
  function box(n, mr){ const r = n.getBoundingClientRect(); return r.height ? [r.top - mr.top, r.bottom - mr.top] : [0, 0]; }
  function contentHeight(){
    const mr = main.getBoundingClientRect(); let h = 0;
    for (const c of main.children){ if (c === layer) continue; const r = c.getBoundingClientRect(); if (r.height) h = Math.max(h, r.bottom - mr.top + (parseFloat(getComputedStyle(c).marginBottom) || 0)); }
    for (const n of [...gPen.children, ...gHl.children, ...layer.querySelectorAll('.annot-note')]) h = Math.max(h, box(n, mr)[1]);
    return Math.ceil(h + 16);
  }
  function copyOfMain(width){
    const copy = main.cloneNode(true);
    // what the reader has set: ticks, slider positions, choices and note text
    const from = main.querySelectorAll('input,textarea,select'), to = copy.querySelectorAll('input,textarea,select');
    from.forEach((s, i) => {
      const d = to[i];
      if (s.type === 'checkbox' || s.type === 'radio') d.toggleAttribute('checked', s.checked);
      else if (s.tagName === 'TEXTAREA') d.textContent = s.value;
      else if (s.tagName === 'SELECT') Array.from(d.options).forEach((o, j) => o.toggleAttribute('selected', j === s.selectedIndex));
      else d.setAttribute('value', s.value);
    });
    main.querySelectorAll('canvas').forEach((c, i) => {
      const img = el('img'); try{ img.src = c.toDataURL(); }catch(e){}
      img.width = c.clientWidth; img.height = c.clientHeight; copy.querySelectorAll('canvas')[i].replaceWith(img);
    });
    copy.querySelectorAll('script,.annot-x,.annot-bar').forEach(n => n.remove());
    copy.querySelectorAll('textarea').forEach(t => { if (!t.textContent) t.removeAttribute('placeholder'); });
    copy.style.margin = '0'; copy.style.width = width + 'px'; copy.style.maxWidth = 'none'; copy.style.paddingBottom = '0';
    return copy;
  }
  function loadImage(src){
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('The page could not be drawn.')); i.src = src; });
  }
  async function savePDF(){
    if (pdfBtn.disabled) return;
    pdfBtn.disabled = true; pdfBtn.setAttribute('aria-busy', 'true');
    const wasOpen = open; if (wasOpen) toggle(false);
    try{
      say('Making the PDF…', true);
      await Promise.all([loadJsPDF(), document.fonts ? document.fonts.ready : null,
        window.MathJax && MathJax.startup && MathJax.startup.promise]);
      place();
      const W = main.clientWidth, H = contentHeight();
      const bs = getComputedStyle(document.body), root = document.documentElement;
      const wrap = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      wrap.className = 'pdf-root';                     // gets the html and body rules (see rulesText)
      wrap.style.width = W + 'px'; wrap.style.height = H + 'px'; wrap.style.overflow = 'hidden';
      const style = el('style'); style.textContent = (await fontCSS()) + '\n' + pageCSS();
      wrap.append(style);
      const cache = document.getElementById('MJX-SVG-global-cache');
      if (cache && !main.contains(cache)) wrap.append(cache.cloneNode(true));
      wrap.append(copyOfMain(W));
      const body = encodeURIComponent(new XMLSerializer().serializeToString(wrap));
      const theme = root.dataset.theme ? ' data-theme="' + root.dataset.theme + '"' : '';

      const {jsPDF} = window.jspdf;
      const pdf = new jsPDF({unit: 'mm', format: 'a4', orientation: 'portrait', compress: true});
      const PW = 210, PH = 297, M = 10, mm = (PW - 2*M) / W, pageH = (PH - 2*M) / mm;
      const bg = (bs.backgroundColor.match(/[\d.]+/g) || [255, 255, 255]).slice(0, 3).map(Number);
      const cuts = breaks(H), pages = [];
      for (let y = 0; y < H - 1;){
        let next = H;
        if (H - y > pageH){
          const fit = cuts.filter(c => c > y + pageH * 0.4 && c <= y + pageH);
          next = fit.length ? fit[fit.length - 1] : y + pageH;
        }
        pages.push([y, next - y]); y = next;
      }
      const S = 2, canvas = el('canvas'), ctx = canvas.getContext('2d');
      for (let i = 0; i < pages.length; i++){
        say('Making the PDF: page ' + (i + 1) + ' of ' + pages.length + '…', true);
        const [y, h] = pages[i];
        // a data: URL, not a blob: one, which would taint the canvas; the page copy is encoded once
        const head = '<svg xmlns="http://www.w3.org/2000/svg"' + theme + ' width="' + W*S + '" height="' + Math.ceil(h*S) + '" viewBox="0 ' + y + ' ' + W + ' ' + h + '">'
          + '<foreignObject x="0" y="0" width="' + W + '" height="' + H + '">';
        const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(head) + body + encodeURIComponent('</foreignObject></svg>'));
        canvas.width = W*S; canvas.height = Math.ceil(h*S);
        ctx.fillStyle = bs.backgroundColor; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        if (i) pdf.addPage();
        pdf.setFillColor(bg[0], bg[1], bg[2]); pdf.rect(0, 0, PW, PH, 'F');
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', M, M, PW - 2*M, h * mm, undefined, 'FAST');
      }
      const name = (document.title.split(' · ')[0] || 'notes').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
      pdf.save(name + '.pdf');
      say('Saved ' + name + '.pdf (' + pages.length + (pages.length === 1 ? ' page).' : ' pages).'));
    }catch(e){
      say('Could not make the PDF: ' + (e && e.message ? e.message : e), true);
      setTimeout(() => say(''), 6000);
    }finally{
      pdfBtn.disabled = false; pdfBtn.removeAttribute('aria-busy');
      if (wasOpen) toggle(true);
    }
  }
  pdfBtn.onclick = savePDF;

  // ---------- start ----------
  function start(){
    document.body.append(tools, bar, msg);
    paint(); render();
    new ResizeObserver(placeSoon).observe(main);
    addEventListener('resize', placeSoon);
    document.addEventListener('toggle', placeSoon, true);
    if (document.fonts) document.fonts.ready.then(placeSoon);
  }
  // Pin positions only once the maths is typeset, since MathJax changes the page's elements.
  function go(){
    const mj = window.MathJax;
    const ready = mj && mj.startup && mj.startup.promise ? mj.startup.promise : Promise.resolve();
    ready.then(start, start);
  }
  if (document.readyState === 'complete') go(); else addEventListener('load', go, {once: true});

  window.notesAnnotate = {savePDF, exportAll, toggle, refresh: place};
})();
