/* Behaviour shared by every page. Loaded in <head> next to site.css:

     <link rel="stylesheet" href="../assets/site.css">
     <script src="../assets/site.js"></script>

   0. Maths: the MathJax settings every page shares.
   1. Theme: light by default, whatever the system setting, until the reader picks dark with the
      theme button; the choice is remembered. Applied before the page paints, hence the <head> load.
   2. Theme button: a light/dark switch at the top right of the page. There is no site header;
      pages link to each other through their own back links.
   3. Collapsible side menu: "Hide menu" on the page's <nav class="toc"> (or <nav class="rail">) and a floating "Menu" button to bring it back. Remembered across pages.
   4. Formula annotations: a formula box (.eq or .formula) that ends with

        <label class="annot"><input type="checkbox"> Annotate terms</label>
        <dl class="terms"><dt>term</dt><dd>meaning</dd>...</dl>

      shows the list only while its checkbox is ticked. Always starts unticked.
   5. Figure line toggles: checkboxes that show or hide families of lines on a figure.
   6. Wide inline maths: an equation inside a sentence that is wider than its column becomes its
      own scrollable line, so a narrow screen never scrolls sideways.
   7. Usage ledger: loads ledger.js (next to this file), which asks a new device for a name once and
      counts page opens in the background after the page has loaded.
   8. Annotations and PDF: on a notes page (one with a chat panel), loads annotate.js, which adds the
      Annotate and Save as PDF buttons beside the theme button. */
(function(){
  // ---------- 7. usage ledger ----------
  // Loaded async and run after the page loads, so it never delays drawing the page.
  if (!window.notesLedger && document.currentScript){
    const lg = document.createElement('script'); lg.async = true;
    lg.src = new URL('ledger.js', document.currentScript.src).href; document.head.append(lg);
  }

  const here = document.currentScript ? document.currentScript.src : '';

  const store = {
    get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
    set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} },
  };

  // ---------- 0. maths ----------
  // One MathJax configuration for the site. A page with equations loads MathJax after this
  // file; pages without them get it on demand from ask-gemini.js. The scale is below 1 because
  // MathJax's maths font runs visibly larger than IBM Plex Sans at the same font size.
  if (!window.MathJax) window.MathJax = {
    tex: {inlineMath: [['\\(','\\)'], ['$','$']], displayMath: [['\\[','\\]'], ['$$','$$']], tags: 'none'},
    svg: {fontCache: 'global', matchFontHeight: false, scale: 0.92, mtextInheritFont: true},
    options: {skipHtmlTags: ['script','noscript','style','textarea','pre','code']},
  };

  // ---------- 1. theme ----------
  const THEME = 'notes-theme';
  const saved = store.get(THEME);
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  const isDark = () => document.documentElement.dataset.theme === 'dark';

  const ICON = {
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  };

  function el(tag, cls, text){
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------- 2. theme button ----------
  function buildThemeButton(){
    const theme = el('button', 'theme-btn'); theme.type = 'button';
    function paint(){
      theme.innerHTML = isDark() ? ICON.sun : ICON.moon;
      theme.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
      theme.title = theme.getAttribute('aria-label');
    }
    theme.onclick = () => {
      const next = isDark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = next; store.set(THEME, next); paint();
    };
    paint();
    document.body.prepend(theme);
  }

  // ---------- 3. collapsible side menu ----------
  function buildMenuToggle(){
    const rail = document.querySelector('nav.toc, nav.rail');
    if (!rail) return;
    const KEY = 'notes-menu-collapsed';
    const hide = el('button', 'rail-toggle', '‹ Hide menu'); hide.type = 'button';
    rail.prepend(hide);
    const show = el('button', 'rail-toggle', '☰ Menu'); show.type = 'button'; show.id = 'railShow';
    document.body.append(show);
    function set(collapsed, focus){
      document.body.classList.toggle('rail-collapsed', collapsed);
      hide.setAttribute('aria-expanded', String(!collapsed));
      show.setAttribute('aria-expanded', String(!collapsed));
      store.set(KEY, collapsed ? '1' : '0');
      if (focus) (collapsed ? show : hide).focus();
    }
    hide.onclick = () => set(true, true);
    show.onclick = () => set(false, true);
    set(store.get(KEY) === '1', false);
  }

  // ---------- 4. formula annotations ----------
  function wireAnnotations(){
    function sync(cb){
      const box = cb.closest('.eq, .formula');
      const list = box && box.querySelector('.terms');
      if (list){ list.classList.toggle('on', cb.checked); list.setAttribute('aria-hidden', String(!cb.checked)); }
    }
    document.querySelectorAll('.annot input').forEach(cb => { cb.checked = false; sync(cb); });
    document.addEventListener('change', e => {
      if (e.target.matches && e.target.matches('.annot input')) sync(e.target);
    });
  }

  // ---------- 5. figure line toggles ----------
  // <input type="checkbox" data-toggle="zeta"> inside a <figure data-group="g"> shows or hides the
  // elements with class req-zeta in every figure of that group, and keeps the group's checkboxes in step.
  function wireFigureToggles(){
    function apply(cb){
      const fig = cb.closest('figure[data-group]');
      if (!fig) return;
      document.querySelectorAll('figure[data-group="' + fig.dataset.group + '"]').forEach(f => {
        f.classList.toggle('hide-' + cb.dataset.toggle, !cb.checked);
        // works for any family name, so a new page needs no stylesheet rule of its own
        f.querySelectorAll('.req-' + cb.dataset.toggle).forEach(x => { x.style.display = cb.checked ? '' : 'none'; });
        f.querySelectorAll('input[data-toggle="' + cb.dataset.toggle + '"]').forEach(other => { other.checked = cb.checked; });
      });
    }
    document.querySelectorAll('input[data-toggle]').forEach(cb => { cb.checked = cb.defaultChecked; });
    document.addEventListener('change', e => {
      if (e.target.matches && e.target.matches('input[data-toggle]')) apply(e.target);
    });
  }

  // ---------- 6. wide inline maths ----------
  // MathJax cannot break an inline equation across lines. When one is wider than the space it has, it
  // gets the class wide-math (site.css makes it a block that scrolls). Re-measured when the window is resized.
  function fitMath(){
    const all = document.querySelectorAll('main mjx-container:not([display="true"])');
    all.forEach(m => m.classList.remove('wide-math'));
    all.forEach(m => {
      const box = m.closest('p,li,dd,dt,td,th,div,figcaption,h3,h4');
      if (!box) return;
      const cs = getComputedStyle(box);
      const room = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (room > 0 && m.getBoundingClientRect().width > room + 1) m.classList.add('wide-math');
    });
  }
  function wireMathFit(){
    let timer = null;
    const later = () => { clearTimeout(timer); timer = setTimeout(fitMath, 80); };
    addEventListener('resize', later);
    function start(){
      const mj = window.MathJax;
      if (mj && mj.startup && mj.startup.promise) mj.startup.promise.then(later);
    }
    if (document.readyState === 'complete') start(); else addEventListener('load', start);
  }

  // ---------- 8. annotations and PDF ----------
  function loadAnnotate(){
    if (!here || !document.querySelector('script[data-store]') || !document.querySelector('main')) return;
    const s = document.createElement('script'); s.async = true; s.src = new URL('annotate.js', here).href; document.head.append(s);
  }

  function init(){ buildThemeButton(); buildMenuToggle(); wireAnnotations(); wireFigureToggles(); wireMathFit(); loadAnnotate(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
