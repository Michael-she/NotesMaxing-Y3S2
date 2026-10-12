/* Behaviour shared by every page. Pairs with page.css.

   1. Collapsible side menu: adds a "Hide menu" button to the page's <nav class="toc"> (or
      <nav class="rail"> on the hub) and a floating "Menu" button to bring it back. The choice
      is remembered across pages.
   2. Formula annotations: a formula box (.eq or .formula) that ends with

        <label class="annot"><input type="checkbox"> Annotate terms</label>
        <dl class="terms"><dt>term</dt><dd>meaning</dd>...</dl>

      shows the list only while its checkbox is ticked. Always starts unticked. */
(function(){
  // ---------- collapsible side menu ----------
  const rail = document.querySelector('nav.toc, nav.rail');
  if (rail){
    const KEY = 'notes-menu-collapsed';
    const hide = document.createElement('button');
    hide.type = 'button'; hide.className = 'rail-toggle'; hide.textContent = '‹ Hide menu';
    rail.prepend(hide);
    const show = document.createElement('button');
    show.type = 'button'; show.className = 'rail-toggle'; show.id = 'railShow'; show.textContent = '☰ Menu';
    document.body.append(show);

    function set(collapsed, focus){
      document.body.classList.toggle('rail-collapsed', collapsed);
      hide.setAttribute('aria-expanded', String(!collapsed));
      show.setAttribute('aria-expanded', String(!collapsed));
      try{ localStorage.setItem(KEY, collapsed ? '1' : '0'); }catch(e){}
      if (focus) (collapsed ? show : hide).focus();
    }
    hide.onclick = () => set(true, true);
    show.onclick = () => set(false, true);
    let saved = null;
    try{ saved = localStorage.getItem(KEY); }catch(e){}
    set(saved === '1', false);
  }

  // ---------- formula annotations ----------
  function sync(cb){
    const box = cb.closest('.eq, .formula');
    const list = box && box.querySelector('.terms');
    if (list){ list.classList.toggle('on', cb.checked); list.setAttribute('aria-hidden', String(!cb.checked)); }
  }
  document.querySelectorAll('.annot input').forEach(cb => { cb.checked = false; sync(cb); });
  document.addEventListener('change', e => {
    if (e.target.matches && e.target.matches('.annot input')) sync(e.target);
  });
})();
