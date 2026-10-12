/* Behaviour shared by every page. Loaded in <head> next to site.css:

     <link rel="stylesheet" href="../assets/site.css">
     <script src="../assets/site.js"></script>

   0. Maths: the MathJax settings every page shares.
   1. Theme: follows the system setting until the reader picks light or dark with the header
      button; the choice is remembered. Applied before the page paints, hence the <head> load.
   2. Site header: a link to the module list, one to each module (from manifest.js), and the
      theme button. No logo or branding.
   3. Collapsible side menu: "Hide menu" on the page's <nav class="toc"> (or <nav class="rail">) and a floating "Menu" button to bring it back. Remembered across pages.
   4. Formula annotations: a formula box (.eq or .formula) that ends with

        <label class="annot"><input type="checkbox"> Annotate terms</label>
        <dl class="terms"><dt>term</dt><dd>meaning</dd>...</dl>

      shows the list only while its checkbox is ticked. Always starts unticked. */
(function(){
  const ROOT = new URL('..', document.currentScript.src).href;   // the site's top folder
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
  const isDark = () => (document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';

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

  // ---------- 2. site header ----------
  function buildHeader(){
    const head = el('header', 'site-head'), inner = el('div', 'in');
    const home = el('a', 'home', 'Modules'); home.href = ROOT + 'index.html';
    const nav = el('nav', 'site-nav'); nav.setAttribute('aria-label', 'Modules');
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
    inner.append(home, nav, theme); head.append(inner); document.body.prepend(head);

    function fillNav(){
      const modules = (window.NOTES_MANIFEST && window.NOTES_MANIFEST.modules) || [];
      const here = decodeURIComponent(location.pathname);
      modules.forEach(m => {
        const on = here.includes('/' + m.folder + '/') || new URLSearchParams(location.search).get('m') === m.id;
        const a = el('a', on ? 'on' : '', m.name);
        a.href = ROOT + 'module.html?m=' + encodeURIComponent(m.id);
        nav.append(a);
      });
    }
    if (window.NOTES_MANIFEST) fillNav();
    else {
      const s = el('script'); s.src = ROOT + 'manifest.js'; s.onload = fillNav; document.head.append(s);
    }
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

  function init(){ buildHeader(); buildMenuToggle(); wireAnnotations(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
