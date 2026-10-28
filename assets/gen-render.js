/* Rendering for answers written by The Lovely Lady on the practice pages (problems.html, tuts.html):
   Markdown with MathJax maths, and diagrams drawn from ```plot and ```svg blocks.

     notesRender.render(text)    Markdown -> sanitised HTML, with maths kept for MathJax and diagrams drawn
     notesRender.typeset(node)   typesets the maths in node (a promise)
     notesRender.DIAGRAMS        what the model is told about diagrams, for its instructions

   Needs marked and DOMPurify (from cdnjs) loaded first. */
(function(){
// What the model is told about diagrams. The page draws them (see the diagrams section below).
const DIAGRAMS = [
  'Diagrams: add one only where the question needs it (a circuit, block diagram, mechanism, free-body diagram, or a graph the student must read values from) or where it makes the solution clearer (a sketch the question asks for, a Bode plot, a load line, a root locus). Never add one for decoration. Put each diagram where it belongs in the problem or the solution, in one of two fenced blocks:',
  '1. A graph of curves or data: a ```plot block holding JSON. The page computes and draws it, so give formulas rather than points where you can. Fields: ' +
    '"title" (a short caption), "x" and "y" axes as {"label": "t (s)", "min": 0, "max": 10, "log": false}, ' +
    '"series": a list of {"label": "...", "fn": "5*(1-exp(-x/2))"} or {"label": "...", "points": [[x, y], ...]}, each optionally with "dash": true; ' +
    'optional "marks": [{"x": .., "y": .., "label": ".."}], "vlines" and "hlines": [{"at": .., "label": ".."}]. ' +
    'In "fn" the variable is always x; use + - * / ^, parentheses, comparisons with ? : for piecewise curves, pi, e, and sin cos tan asin acos atan atan2 sinh cosh tanh exp log (natural) log10 sqrt abs pow min max floor ceil sign step (unit step). ' +
    'With "log": true on x, x is the actual value (for example ω in rad/s); for dB write 20*log10(...). Every value drawn must follow from the numbers in the problem.',
  '2. Anything else (circuits, block diagrams, mechanisms): an ```svg block holding one <svg> with a viewBox about 640 wide and no width or height. Do not set colours, fill, stroke or style. Instead use these classes: ' +
    '"ln" for a line or wire (add "thin" for a lighter one, "dash" for dashed), colours "c1" blue, "c2" green, "c3" amber, "c4" black; filled shapes "c1f", "c3f", "c4f"; ' +
    '"blk" for a box with an outline; "hollow" for an open circle; text "lab" (normal), "tk" (small grey), "b" (bold). Lines and shapes without a class are drawn as thin black outlines. ' +
    'Draw resistors as zigzags or boxes, sources as circles, ground as three short lines, arrowheads as small "c4f" polygons. Label every component with its name and value in plain text (Unicode subscripts or <tspan class="sub" dy="4">, no LaTeX inside SVG). Leave space so no labels overlap.',
].join('\n');

// ---------- diagrams ----------
const escX = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const figNote = msg => `<p class="none">A diagram could not be drawn: ${escX(msg)}</p>`;

// A formula from a plot block, as a function of x. Only numbers, x, operators and the listed
// functions are accepted, so nothing else can run.
const FN = {sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, log: Math.log, ln: Math.log, log10: Math.log10, sqrt: Math.sqrt,
  abs: Math.abs, pow: Math.pow, min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, sign: Math.sign,
  step: v => v >= 0 ? 1 : 0, pi: Math.PI, e: Math.E};
function formula(src){
  const toks = String(src).match(/\d*\.?\d+(?:e[+-]?\d+)?|[A-Za-z_]\w*|<=|>=|==|!=|&&|\|\||[-+*/^(),<>?:!%]|\S/gi) || [];
  const js = toks.map((t, i) => {
    // JavaScript refuses -x**2, so a leading minus becomes (-1)* (which keeps -x^2 = -(x^2))
    if (t === '-' && (i === 0 || /^([-+*/(,<>?:!%]|<=|>=|==|!=|&&|\|\|)$/.test(toks[i - 1]))) return '(-1)*';
    if (/^\d|^\./.test(t) || /^[-+*/(),<>?:!%]$|^(<=|>=|==|!=|&&|\|\|)$/.test(t)) return t;
    if (t === '^') return '**';
    if (t === 'x') return 'x';
    if (Object.prototype.hasOwnProperty.call(FN, t)) return 'F.' + t;
    throw new Error('"' + t + '" is not allowed in a formula');
  }).join(' ');
  const f = new Function('F', 'x', '"use strict"; return (' + js + ');');
  f(FN, 1);   // throws now on a syntax error
  return x => { const v = f(FN, x); return typeof v === 'number' ? v : (v ? 1 : 0); };
}
// Tick values: decades on a log axis, otherwise 1, 2 or 5 times a power of ten
function ticks(a, log){
  if (log){ const out = []; for (let k = Math.ceil(Math.log10(a.min) - 1e-9); k <= Math.floor(Math.log10(a.max) + 1e-9); k++) out.push(10 ** k); return out; }
  const raw = (a.max - a.min) / 6, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  const st = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p, out = [];
  for (let v = Math.ceil(a.min / st - 1e-9) * st; v <= a.max + st * 1e-9; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v);
  return out;
}
const tickText = v => { const a = Math.abs(v); return a !== 0 && (a >= 1e5 || a < 1e-3) ? v.toExponential(0).replace('e+', 'e') : String(+v.toPrecision(6)); };
let figN = 0;
function plotSvg(spec){
  const ax = (a, name) => {
    if (!a || !isFinite(a.min) || !isFinite(a.max) || a.max <= a.min) throw new Error('the ' + name + ' axis needs a min below its max');
    if (a.log && a.min <= 0) throw new Error('a log axis must start above zero');
    const lo = a.log ? Math.log10(a.min) : a.min, hi = a.log ? Math.log10(a.max) : a.max;
    return {a, lo, hi, t: v => ((a.log ? Math.log10(v) : v) - lo) / (hi - lo)};
  };
  const xa = ax(spec.x, 'x'), ya = ax(spec.y, 'y');
  const L = 64, T = 16, W = 546, H = 230, id = 'gclip' + (++figN);
  const X = v => L + W * xa.t(v), Y = v => T + H * (1 - ya.t(v));
  const n = v => (+v).toFixed(1);
  const s = [`<defs><clipPath id="${id}"><rect x="${L}" y="${T}" width="${W}" height="${H}"/></clipPath></defs>`];
  ticks(spec.x, spec.x.log).forEach(v => { s.push(`<line class="grid" x1="${n(X(v))}" y1="${T}" x2="${n(X(v))}" y2="${T + H}"/>`, `<text class="tk" x="${n(X(v))}" y="${T + H + 16}" text-anchor="middle">${tickText(v)}</text>`); });
  ticks(spec.y, spec.y.log).forEach(v => { s.push(`<line class="grid" x1="${L}" y1="${n(Y(v))}" x2="${L + W}" y2="${n(Y(v))}"/>`, `<text class="tk" x="${L - 6}" y="${n(Y(v) + 4)}" text-anchor="end">${tickText(v)}</text>`); });
  // the axes themselves where zero is on the plot
  if (!spec.y.log && spec.y.min < 0 && spec.y.max > 0) s.push(`<line class="axis" x1="${L}" y1="${n(Y(0))}" x2="${L + W}" y2="${n(Y(0))}"/>`);
  if (!spec.x.log && spec.x.min < 0 && spec.x.max > 0) s.push(`<line class="axis" x1="${n(X(0))}" y1="${T}" x2="${n(X(0))}" y2="${T + H}"/>`);
  s.push(`<rect class="frame" x="${L}" y="${T}" width="${W}" height="${H}"/>`);
  const g = [], top = [], leg = [];
  const span = H * 20;   // keep runaway values inside a range the browser can draw
  const yc = v => Math.max(T - span, Math.min(T + H + span, Y(v)));
  (spec.series || []).forEach((sr, i) => {
    const cls = 'ln c' + [1, 3, 2, 4][i % 4] + (sr.dash ? ' dash' : '');
    let pts = [];
    if (sr.fn != null){
      const f = formula(sr.fn), N = 500;
      for (let k = 0; k <= N; k++){
        const u = xa.lo + (xa.hi - xa.lo) * k / N, x = spec.x.log ? 10 ** u : u;
        pts.push([x, f(x)]);
      }
    } else if (Array.isArray(sr.points)) pts = sr.points.filter(p => Array.isArray(p) && p.length >= 2).map(p => [+p[0], +p[1]]);
    else throw new Error('series ' + (i + 1) + ' has no fn or points');
    // break the line at gaps (NaN, infinity, or a log of zero)
    let run = [];
    const flush = () => { if (run.length > 1) g.push(`<polyline class="${cls}" points="${run.join(' ')}"/>`); run = []; };
    pts.forEach(([x, y]) => {
      if (!isFinite(x) || !isFinite(y) || (spec.x.log && x <= 0) || (spec.y.log && y <= 0)) return flush();
      run.push(n(X(x)) + ',' + n(yc(y)));
    });
    flush();
    if (sr.label) leg.push([cls, sr.label]);
  });
  (spec.vlines || []).forEach(v => { if (!isFinite(v.at)) return; g.push(`<line class="ln c4 thin dash" x1="${n(X(v.at))}" y1="${T}" x2="${n(X(v.at))}" y2="${T + H}"/>`);
    if (v.label) top.push(`<text class="tk halo" x="${n(X(v.at) + 4)}" y="${T + 14}">${escX(v.label)}</text>`); });
  (spec.hlines || []).forEach(v => { if (!isFinite(v.at)) return; g.push(`<line class="ln c4 thin dash" x1="${L}" y1="${n(Y(v.at))}" x2="${L + W}" y2="${n(Y(v.at))}"/>`);
    if (v.label) top.push(`<text class="tk halo" x="${L + W - 4}" y="${n(Y(v.at) - 5)}" text-anchor="end">${escX(v.label)}</text>`); });
  (spec.marks || []).forEach(m => { if (!isFinite(m.x) || !isFinite(m.y)) return; g.push(`<circle class="c4f" cx="${n(X(m.x))}" cy="${n(Y(m.y))}" r="4"/>`);
    if (m.label) top.push(`<text class="lab halo" x="${n(X(m.x) + 8)}" y="${n(Y(m.y) - 8)}">${escX(m.label)}</text>`); });
  s.push(`<g clip-path="url(#${id})">${g.join('')}</g>`, ...top);
  if (leg.length > 1 || (leg.length && !spec.title)){
    const w = 34 + 7.2 * Math.max(...leg.map(l => l[1].length)), x0 = L + W - w - 8;
    s.push(`<rect class="legbg" x="${n(x0)}" y="${T + 8}" width="${n(w)}" height="${10 + 18 * leg.length}" rx="3"/>`);
    leg.forEach(([cls, lab], k) => { const y = T + 22 + 18 * k;
      s.push(`<line class="${cls}" x1="${n(x0 + 8)}" y1="${y - 4}" x2="${n(x0 + 26)}" y2="${y - 4}"/>`, `<text class="tk" x="${n(x0 + 32)}" y="${y}">${escX(lab)}</text>`); });
  }
  s.push(`<text class="lab" x="${L + W / 2}" y="${T + H + 36}" text-anchor="middle">${escX(spec.x.label || '')}</text>`,
    `<text class="lab" transform="translate(16 ${T + H / 2}) rotate(-90)" text-anchor="middle">${escX(spec.y.label || '')}</text>`);
  return `<svg class="fig" viewBox="0 0 640 ${T + H + 46}" role="img" aria-label="${escX(spec.title || 'Graph')}">${s.join('')}</svg>`;
}
// An SVG the model wrote: sanitised, with its colours and sizes removed so the site's classes draw it.
function ownSvg(src){
  if (!window.DOMPurify) throw new Error('the sanitiser did not load');
  const frag = DOMPurify.sanitize(src, {USE_PROFILES: {svg: true}, FORBID_TAGS: ['style', 'foreignObject', 'image', 'a'], FORBID_ATTR: ['style'], RETURN_DOM_FRAGMENT: true});
  const svg = frag.querySelector('svg');
  if (!svg) throw new Error('the SVG was not complete');
  if (!svg.getAttribute('viewBox')){
    const w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height'));
    if (!(w > 0 && h > 0)) throw new Error('the SVG has no viewBox');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
  svg.removeAttribute('width'); svg.removeAttribute('height');
  svg.querySelectorAll('*').forEach(e => ['fill', 'stroke', 'color'].forEach(a => { if (e.hasAttribute(a) && e.getAttribute(a) !== 'none') e.removeAttribute(a); }));
  svg.setAttribute('class', 'fig'); svg.setAttribute('role', 'img');
  return svg.outerHTML;
}
function diagram(kind, body){
  try{
    if (kind === 'svg') return `<figure class="gen-fig">${ownSvg(body)}</figure>`;
    const spec = JSON.parse(body);
    return `<figure class="gen-fig">${plotSvg(spec)}${spec.title ? `<figcaption>${escX(spec.title)}</figcaption>` : ''}</figure>`;
  }catch(e){ return figNote(kind === 'plot' && e instanceof SyntaxError ? 'its data is not valid JSON' : e.message); }
}

// ---------- rendering ----------
function render(text){
  const stash = [], figs = [];
  const keep = m => { stash.push(m); return `@@MATH${stash.length-1}@@`; };
  const src = text
    .replace(/^[ \t]*```(svg|plot)[^\n]*\n([\s\S]*?)\n[ \t]*```[ \t]*$/gm, (m, kind, body) => { figs.push(diagram(kind, body)); return `\n\n@@FIG${figs.length-1}@@\n\n`; })
    .replace(/\$\$[\s\S]+?\$\$/g, keep)
    .replace(/\\\[[\s\S]+?\\\]/g, keep)
    .replace(/\\\([\s\S]+?\\\)/g, keep)
    .replace(/(^|[^\\$])\$(?!\s)([^\n$]+?)\$/g, (m, pre, body) => pre + keep('$' + body + '$'));
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let html = window.marked ? marked.parse(src, {breaks:false, gfm:true}) : '<p>' + esc(src).replace(/\n\n/g, '</p><p>') + '</p>';
  if (window.DOMPurify) html = DOMPurify.sanitize(html);
  return html.replace(/@@MATH(\d+)@@/g, (m, i) => esc(stash[+i]))
    .replace(/(?:<p>)?@@FIG(\d+)@@(?:<\/p>)?/g, (m, i) => figs[+i]);
}
function typeset(node){
  if (window.MathJax && MathJax.typesetPromise) return MathJax.typesetPromise([node]).catch(() => {});
  return Promise.resolve();
}

window.notesRender = {render, typeset, DIAGRAMS};
})();
