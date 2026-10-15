# Notes page specification

This document is complete on its own. Give it to a person or a language model together with the source
material for one week of a course (slides, readings, tutorials, transcripts). Following it produces one
HTML file that drops straight into the study site. Nothing else about the site needs to be known.

Part A is the brief for whoever writes the page. Part B is for the person adding the file to the site.

---

# Part A: writing the page

## A1. The task

Produce **one complete, self-contained HTML file** containing study notes for one week (or one tutorial,
lab or revision set) of one module. A student should be able to learn the week's examinable material
from this page alone, without the slides.

Output only the file contents, starting at `<!doctype html>`. Name the file as in A2. If you cannot attach
a file, give the file name on the first line and the HTML in one code block after it.

## A2. File name

```
<MODULE>_Week<NN>[_<track>]_<Kind>_<Topic>.html
```

| Part | Rule | Examples |
| --- | --- | --- |
| `<MODULE>` | The module code from the table in A3 (or its id if it has no code). | `CS354`, `EL245`, `vibration` |
| `Week<NN>` | The teaching week, always two digits. A page covering several weeks takes the last of them. | `Week03`, `Week10` |
| `<track>` | Only for modules split into tracks (A3). Lower case, hyphens between words. Leave the part out otherwise. | `theory`, `programming` |
| `<Kind>` | Exactly one of `Notes`, `Tutorial`, `Lab`, `Revision`, `Summary`. | `Notes` |
| `<Topic>` | 1 to 6 words in Title Case, joined by hyphens. Letters, digits and hyphens only: no spaces, underscores, accents or punctuation. | `State-Space`, `BJT-Biasing`, `Tut9-Tut10-Solutions` |

Underscores separate the parts and appear nowhere else.

```
CS354_Week07_Notes_State-Space.html
EL245_Week10_Tutorial_Tut9-Tut10-Solutions.html
CS245_Week03_theory_Notes_Pipelining.html
vibration_Week02_Notes_Single-Degree-of-Freedom.html
```

Past papers (PDFs, not written by you) follow the same idea:

```
<MODULE>_<YYYY>_<Assessment>[_Memo][_<Variant>].pdf
CS354_2026_A1.pdf    CS354_2026_A1_Memo.pdf    DA344_2023_Exam_Practice.pdf
```

`<Assessment>` is one token such as `A1`, `A2`, `T1`, `Exam`, `Supp`. Add `_Memo` to a memorandum or
solution set.

## A3. Modules

| Module | Code | Id |
| --- | --- | --- |
| Control Systems | `CS354` | `cs354` |
| Vibration and Noise | (none) | `vibration` |
| Data Analytics | `DA344` | `da344` |
| Computer Systems | `CS245` | `cs245` |
| Electronics | `EL245` | `electronics` |

Computer Systems has two tracks, `theory` and `programming`. The others have none. For a module that is
not listed, ask for its code and id before writing.

The values used inside the page (A4) come from this table and the file name:

| Placeholder | Meaning | Example |
| --- | --- | --- |
| `{ID}` | module id | `cs354` |
| `{CODE}` | module code, or the module name if it has none | `CS354` |
| `{NAME}` | module name | `Control Systems` |
| `{N}` | week number without leading zero | `7` |
| `{STORE}` | `{ID}-w{N}`, plus `-{track}` if there is a track, plus `-{kind}` in lower case if the kind is not `Notes` | `cs354-w7`, `electronics-w10-tutorial` |

## A4. Page skeleton

Copy this exactly and fill in the placeholders. The page has **no `<style>` block, no `style=""`
attributes and no colours of its own**: the shared stylesheet does all of it, so use only the classes in
this document. Paths start with `../` (the page is filed one folder below the site root. The ingest
script corrects this if it ends up deeper).

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Week {N}: {Short topic} · {CODE} · notesmaxing</title>
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap">
<link rel="stylesheet" href="../assets/site.css">
<script src="../assets/site.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.js"></script>
</head>
<body>
<div class="wrap">
<nav class="toc" aria-label="Contents">
  <a class="home" href="../module.html?m={ID}">&larr; {NAME}</a>
  <div class="k">{CODE} · Week {N}</div>
  <ol>
    <li><a href="#s1">1. First section</a></li>
    <li class="sub"><a href="#s1-detail">An important subsection</a></li>
    <li><a href="#s2">2. Second section</a></li>
  </ol>
</nav>

<main>
<header class="top">
  <div class="kicker">{NAME IN CAPITALS} · {CHAPTER, UNIT OR TUTORIAL REFERENCE}</div>
  <h1>Topic of the week</h1>
  <p class="lede">One or two sentences: what this page covers and what it lets the student do.</p>
</header>

<section id="s1">
<h2><span class="n">01</span>First section</h2>
<p>…</p>
<h3 id="s1-detail">An important subsection</h3>
<p>…</p>
</section>

<section id="s2">
<h2><span class="n">02</span>Second section</h2>
<p>…</p>
</section>

<footer>
<p>Sources: the file names of the slides, readings and tutorials used. Say here if any source could not be
read (a video, a scanned page, a missing slide).</p>
</footer>
</main>
</div>

<script src="../assets/ask-gemini.js" data-store="{STORE}" data-course="{CODE} {NAME}"
        data-topic="Week {N}: a one-line list of the topics on this page"></script>
</body>
</html>
```

Rules for the skeleton:

- The `<h1>` is the page's title in the module list. Do not start it with "Week 7:"; the week is shown
  separately.
- One `<section id="…">` per `<h2>`, numbered `01`, `02`, … in `<span class="n">`. Every section has a
  line in the side menu, and every `<h3>` worth jumping to has a `class="sub"` line.
- Ids are lower case with hyphens and unique on the page.
- Leave out the MathJax `<script>` only if the page has no maths at all.
- No site header, logo, branding or extra navigation. The only link off the page is the back link in the
  side menu.

## A5. Content

- Cover everything examinable in the sources, in the order it is taught. Nothing examinable is left out
  because it is hard to typeset or draw.
- For each idea: plain words first, then the formula or rule, then a worked example that uses it.
- Say why a result matters and when to use it, not only what it is.
- Worked examples are **new problems** with different numbers or data, never copies of the slides or
  tutorials. A `Tutorial` page is the exception: it works the given questions, in order, and shows every
  step.
- Compute every number, table and plot from the stated values and check it. Never estimate by eye.
- Keep the lecturer's notation, symbols and terminology. Where the slides and a textbook differ, follow the
  slides and say so.
- Do not invent content. If something in the sources is unclear or looks wrong, say so in a
  `Watch out` box rather than guessing silently.
- A `Notes` page ends with a section of practice problems with worked solutions, then a formula sheet
  (or, for a non-mathematical module, a summary of the key points and definitions).

## A6. Writing style

- Plain, direct sentences addressed to the reader. Define each term the first time it is used.
- Short paragraphs. Use a list only for things that are a list.
- British spelling, SI units, a space between a number and its unit (`5 ms`, `20 dB`).
- No filler: no "In this section we will…", no closing summaries that repeat the section.

## A7. Maths

- Inline maths is `\( … \)` and displayed maths is `\[ … \]`. Never use `$`.
- Inside maths write `\lt` and `\gt` for `<` and `>`.
- Keep inline maths short. A long expression goes on its own line as displayed maths, otherwise it
  overflows on a phone.
- Every formula a student must know sits in a formula box, and **every formula box ends with an
  annotation list** that defines each symbol once, in order of appearance, with its meaning and unit. The
  checkbox is off by default.

```html
<div class="eq"><span class="tag">Name of the result</span>\[ v = u + at \]
<label class="annot"><input type="checkbox" autocomplete="off"> Annotate terms</label>
<dl class="terms">
  <dt>\(v\)</dt><dd>Final velocity (m/s).</dd>
  <dt>\(u\)</dt><dd>Initial velocity (m/s).</dd>
  <dt>\(a\)</dt><dd>Constant acceleration (m/s²).</dd>
  <dt>\(t\)</dt><dd>Elapsed time (s).</dd>
</dl>
</div>
```

The `tag` is optional. Intermediate algebra inside a worked example needs no box.

## A8. Components

Use these and nothing else. Labels in boxes (`Definition`, `Watch out`, …) may be changed.

| Use | Markup |
| --- | --- |
| Opening paragraph | `<p class="lede">…</p>` |
| Formula | `<div class="eq">…</div>` with annotation list (A7) |
| Definition | `<div class="box def"><span class="label">Definition</span><p>…</p></div>` |
| Common mistake | `<div class="box watch"><span class="label">Watch out</span><p>…</p></div>` |
| Exam pointer | `<div class="box exam"><span class="label">Exam</span><p>…</p></div>` |
| Intuition | `<div class="box intuition"><span class="label">Intuition</span><p>…</p></div>` |
| Side note or caveat | `<div class="note"><span class="tag">Short heading</span><p>…</p></div>` |
| Key result | `<div class="key"><span class="tag">Key idea</span><p>…</p></div>` |
| Where it is in the sources | `<p class="reading"><b>Reading</b> Chapter 8.2, slides 4 to 9</p>` |
| Table | `<div class="tbl"><table><thead>…</thead><tbody>…</tbody></table></div>` |
| Code | `<pre><code>…</code></pre>` (escape `<`, `>` and `&`) |
| Two columns side by side | `<div class="two"><div>…</div><div>…</div></div>` |
| Formula sheet | `<div class="sheet"><div><h4>Group name</h4>…</div><div><h4>…</h4>…</div></div>` |

Worked examples are numbered by section (`3.1`, `3.2`, …) and written as numbered steps that end in a
stated answer:

```html
<div class="ex"><div class="hd">Worked example 3.1 <span>short description</span></div><div class="bd">
<p>The question, with every value it needs.</p>
<div class="step"><i>1</i><div>First step, naming the result it uses.</div></div>
<div class="step"><i>2</i><div>Next step.</div></div>
<div class="ans">The answer, with units, and what it means.</div>
</div></div>
```

Practice problems use the same block with the heading `Problem 9.1` and the solution steps inside it.

If something genuinely cannot be expressed with these classes, use the closest one and add a comment as
the first line inside `<head>`: `<!-- needs-css: what is missing and where it is used -->`. Never style
it inline.

## A9. Figures

Draw figures wherever a picture helps: plots, circuits, block diagrams, timing diagrams, data structures,
geometry. Draw them as inline SVG. No image files and no external images.

```html
<figure>
<svg viewBox="0 0 640 260" class="fig" role="img" aria-label="What the figure shows, in words">
  <rect class="frame" x="50" y="20" width="560" height="200"/>
  <line class="grid" x1="50" y1="120" x2="610" y2="120"/>
  <path class="ln c1" d="M50 200 L…"/>
  <text class="tk" x="50" y="238" text-anchor="middle">0</text>
  <text class="lab" x="330" y="255" text-anchor="middle">time (s)</text>
</svg>
<figcaption><b>Figure 2.1</b> One short sentence saying what is shown.</figcaption>
</figure>
<p class="fignote"><b>Figure 2.1:</b> The longer explanation: what to notice, what each line or colour is,
and how it connects to the text.</p>
```

- **Colour only through these classes**, never with `fill=` or `stroke=` colours, so the figure works in
  light and dark themes:

  | Class | Effect |
  | --- | --- |
  | `frame` | plot border, no fill |
  | `grid` | faint grid line |
  | `axis` | axis line |
  | `ln` | a curve or wire (no fill). Add a colour: `c1` teal, `c2` light teal, `c3` amber, `c4` ink |
  | `thin`, `dash` | add to `ln` for a thinner or dashed line |
  | `c1f`, `c3f`, `c4f` | solid fill in teal, amber or ink (dots, arrowheads, markers) |
  | `c1t`, `c2t`, `c3t` | coloured text |
  | `hollow` | a shape filled with the background (open circles, terminals) |
  | `blk` | a box with an ink outline (block diagrams, components) |
  | `blkd` | a highlighted box with a teal outline |
  | `area` | a shaded region with a dashed teal edge |
  | `zone` | a dashed teal outline with no fill |
  | `cell` | a table or memory cell |
  | `tk` | small label (ticks, values) |
  | `lab` | normal label. Add `b` for bold and `halo` for a background halo where it crosses lines |

- Plots are computed from the function being shown and drawn to scale, not sketched. Label both axes with
  quantity and unit.
- Number figures by section: Figure 2.1, 2.2, ….
- **Captions are one short sentence.** Anything more goes in the `fignote` paragraph directly under the
  figure, which starts by naming the figure.
- Keep text inside the `viewBox`, and use a wide `viewBox` (about 640 units) for full-width figures.
  Add `class="fig small"` for a figure that should not span the full width.

### Optional lines

Lines that clutter a figure (design limits, construction lines, alternatives) can have show/hide
checkboxes. Give the `<figure>` a `data-group` name, give each optional element a class `req-<family>`,
and put this after the SVG:

```html
<div class="fig-toggles"><span>Show</span>
  <label><input type="checkbox" data-toggle="<family>" autocomplete="off" checked> what the lines are</label>
</div>
```

Figures sharing a `data-group` switch together.

### Animations

An animation is added beside a static figure, never instead of it. It plays by default while it is on
screen, stops for readers who ask for reduced motion, and has a Play/Pause button and a slider.

```html
<figure class="anim" id="anim21">
<svg viewBox="0 0 640 260" class="fig" role="img" aria-label="Animation: …">…</svg>
<div class="anim-controls">
  <button class="btn" type="button">Play</button>
  <input type="range" min="0" max="1" step="0.005" value="0" aria-label="Progress of the animation">
</div>
<script>
(function(){
  const root = document.getElementById('anim21'), svg = root.querySelector('svg');
  const slider = root.querySelector('input'), btn = root.querySelector('button');
  function draw(t){ /* set the SVG for progress t from 0 to 1 */ }
  let raf = 0, t0 = 0, start = 0; const RUN = 5000;
  function frame(now){ const t = ((now - t0) / RUN + start) % 1; slider.value = t; draw(t); raf = requestAnimationFrame(frame); }
  function play(){ if (raf) return; start = +slider.value; t0 = performance.now(); btn.textContent = 'Pause'; raf = requestAnimationFrame(frame); }
  function stop(){ cancelAnimationFrame(raf); raf = 0; btn.textContent = 'Play'; }
  let auto = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  btn.onclick = () => { auto = false; raf ? stop() : play(); };
  slider.addEventListener('input', () => { auto = false; stop(); draw(+slider.value); });
  if (auto && 'IntersectionObserver' in window)
    new IntersectionObserver(e => { if (auto) e[0].isIntersecting ? play() : stop(); }, {threshold: 0.35}).observe(svg);
  draw(0);
})();
</script>
<figcaption><b>Figure 2.2, animated.</b> One short sentence.</figcaption>
</figure>
```

The script goes before the `<figcaption>`, and the `id` is unique on the page.

### Interactive figures

A figure the reader can change (sliders for parameters, a pole to drag) is drawn entirely by a script
from the closed-form result, so every position it shows is computed rather than drawn by hand. Leave the
`<svg>` empty and put sliders and a live readout after it:

```html
<figure id="fig31">
<svg viewBox="0 0 640 260" class="fig" role="img" aria-label="What the figure shows; what can be changed"></svg>
<div class="fig-ctl">
  <label><span>{symbol}</span><input type="range" data-k="{key}" min="…" max="…" step="…" value="{worked example value}" aria-label="{name of the quantity}"><output></output></label>
</div>
<div class="fig-read" aria-live="polite"></div>
<figcaption><b>Figure 3.1</b> One short sentence.</figcaption>
</figure>
```

The script redraws the SVG with the classes in the table above on every `input` event, writes each
value into its `<output>`, and states the numbers that matter in `.fig-read` (a `.tbl` table is allowed
there). A draggable point gets an invisible `<circle class="hit" r="16">` on top of it. Start every
control at the values of the page's worked example, and say in the note under the figure what to drag
or slide. `class="fig narrow"` suits a tall plot drawn to the same scale on both axes.

## A10. Checklist before you output

1. The file name follows A2, and `{ID}`, `{CODE}`, `{N}` and `{STORE}` match it.
2. There is no `<style>`, no `style=""`, no colour value and no `$` maths.
3. Every `<h2>` section has a side-menu line, and every menu link points at an id that exists.
4. Every formula box has its annotation list, and every figure has a one-sentence caption.
5. Every worked example and practice problem ends with a stated answer, and the arithmetic has been
   checked.
6. The footer lists the sources and anything that could not be read.

---

# Part B: adding the file to the site

1. Put the file (or a past paper PDF) in `inbox/` at the repo root. The folder is not committed.
2. Run:

   ```bash
   python ingest.py
   ```

   It reads each name (A2), files notes into the module folder (inside the track folder if there is one)
   and papers into the module's `papers/` folder, then rebuilds `manifest.js`. On the way in it fixes the
   `../` depth of links, points the back link at the right module and sets a unique `data-store`.
   It refuses names that do not follow the convention, unknown modules and pages without an `<h1>` or
   the stylesheet link, and lists anything else worth a look (a `<style>` block, `$` maths,
   `needs-css` requests). `--dry-run` shows the plan without moving anything, and `--force` replaces a
   file that already exists.
3. Open the page through `python serve_notes.py` and check it in both themes and at phone width: no raw
   `\(` or red MathJax text, menu links land on their sections, nothing scrolls sideways except wide
   tables and figures inside their own boxes.
4. Commit the new file and `manifest.js`.

Slides, videos and other course-issued files are not committed. Only PDFs inside a `papers/` folder are
tracked.

Files from before this convention (for example `Week7-State-Space/Week7_State_Space_Notes.html`) still
work: the site reads the week number from anywhere in the path and the title from the `<h1>`.
