# Writing a new notes page

Instructions for generating a week of notes for this site, whether by hand or with an AI. Give this file
to the model together with the week's slides. The reference page is
`CS354-Control-Systems/Week12-Digital-Control/Week12_Digital_Control_Notes.html`: when this guide and
that page disagree, copy the page.

## 1. What a notes page is

One self-contained `.html` file per week (or per week and track) that a student can study from without
the slides.

- Cover everything examinable in the source material, in the order it is taught.
- Explain the idea in plain words first, then give the formula, then use it in an example.
- Write worked examples as **new problems** with different numbers, not copies of the slides or tutorials.
- Compute every number, table and plot from the stated values and check it. Do not estimate a figure by eye.
- Keep the lecturer's notation and symbols. If the slides and the textbook differ, follow the slides and say so.
- Do not invent content. If a source could not be read (a video, a scanned page), say so in the footer.
- End with practice problems (with solutions) and a formula sheet for the week.

## 2. Where the file goes

| Module | Folder | Module id |
| --- | --- | --- |
| Control Systems | `CS354-Control-Systems/` | `cs354` |
| Vibration and Noise | `Vibration-and-Noise/` | `vibration` |
| Data Analytics | `DA344-Data-Analytics/` | `da344` |
| Computer Systems 245 | `CS245-Computer-Systems/` | `cs245` |
| Electronics | `Electronics/` | `electronics` |

- Put the file directly in the module folder (`Week7_Topic_Name.html`) or in a week folder
  (`Week12-Digital-Control/Week12_Digital_Control_Notes.html`).
- The path must contain the week number (`Week7`, `week7.html`). The module page reads it from there.
- A first-level subfolder that is not a week folder (`theory/`, `programming/`) is shown as a track.
- The `<h1>` becomes the title in the module list. Do not start it with "Week 7:", which is shown separately.
- Do not commit slides, videos or other course-issued files. Only PDFs inside a `papers/` folder are tracked.
- Afterwards run `python build_manifest.py` and commit `manifest.js` with the page.

## 3. Page skeleton

No page carries its own `<style>` block or inline colours. Everything comes from `assets/site.css`, so
only use the classes listed here. Adjust `../` to the file's depth (`../` directly in a module folder,
`../../` inside a week or track folder).

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Week 7: Topic · CS354 · notesmaxing</title>
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
  <a class="home" href="../module.html?m=cs354">&larr; Control Systems</a>
  <div class="k">CS354 · Week 7</div>
  <ol>
    <li><a href="#intro">1. First section</a></li>
    <li class="sub"><a href="#detail">A subsection</a></li>
  </ol>
</nav>

<main>
<header class="top">
  <div class="kicker">CONTROL SYSTEMS 354 · CHAPTER 5</div>
  <h1>Topic of the week</h1>
  <p>One or two sentences: what the page covers and which sources it was built from.</p>
</header>

<section id="intro">
<h2><span class="n">01</span>First section</h2>
<p>…</p>
</section>

<footer>Sources: the file names of the slides and readings used, and anything that could not be read.</footer>
</main>
</div>

<script src="../assets/ask-gemini.js" data-store="cs354-w7" data-course="CS354 Control Systems"
        data-topic="Week 7: a one-line list of the topics on this page"></script>
</body>
</html>
```

- One `<section id="...">` per `<h2>`, numbered `01`, `02`, … in `<span class="n">`. Every section has a
  matching line in the side menu; `<h3>` subsections that matter get a `class="sub"` line.
- `data-store` must be unique per page (`<module id>-w<week>`, plus the track if there is one).
- Leave the MathJax `<script>` out only if the page has no maths at all.
- No site header, logo or branding. The only links off the page are the back link in the side menu.

## 4. Maths

- Inline maths is `\( ... \)`, displayed maths is `\[ ... \]`. Do not use `$`.
- Write `\lt` and `\gt` (or `&lt;`, `&gt;`) for inequality signs inside maths.
- Every displayed formula a student must know sits in a formula box, and **every formula box ends with an
  annotation list**: a checkbox, off by default, that explains each term.

```html
<div class="eq"><span class="tag">Shift (delay) property</span>\[ \mathcal{Z}\{f(k-1)\} = z^{-1}F(z) \]
<label class="annot"><input type="checkbox" autocomplete="off"> Annotate terms</label>
<dl class="terms"><dt>\(f(k)\)</dt><dd>Value of the sequence at sample \(k\).</dd><dt>\(z^{-1}\)</dt><dd>A delay of one sample.</dd></dl>
</div>
```

  The `<span class="tag">` name is optional. List every symbol in the formula once, in the order it
  appears, with its meaning and unit. Intermediate lines of algebra inside a worked example do not need
  a box.

## 5. Figures

- Draw figures as inline `<svg class="fig" viewBox="…" role="img" aria-label="…">`. No image files.
- Colour only through the stylesheet classes, so figures work in light and dark themes:
  `frame`, `grid`, `axis` for the plot area; `ln` for a curve (`thin`, `dash` to vary it) with
  `c1` teal, `c2` mid teal, `c3` amber, `c4` ink; `c1f`, `c3f`, `c4f` for fills; `tk` for tick labels,
  `lab` for labels, `b` for bold. Never write a `fill` or `stroke` colour in the SVG.
- Plots are computed from the function being shown, not sketched.
- Number figures by section: Figure 2.1, 2.2, …
- **Captions are one short sentence.** Anything longer goes in a note directly under the figure that names it:

```html
<figure>
<svg viewBox="0 0 640 250" class="fig" role="img" aria-label="ZOH staircase">…</svg>
<figcaption><b>Figure 2.2</b> A ZOH output (teal staircase) built from samples of a signal (dark line).</figcaption>
</figure>
<p class="fignote"><b>Figure 2.2:</b> The dashed amber curve is the original signal delayed by \(T/2\). This is the delay that costs phase margin.</p>
```

- **Animations** are an addition to a static figure, never a replacement. They play by default when on
  screen, with a Pause button and a slider (`<figure class="anim">` with `.anim-controls`), and stay
  still when the system asks for reduced motion. Put the figure's `<script>` before its `<figcaption>`.
- **Optional lines** (design limits, constant-ζ lines and the like) get show/hide checkboxes: give the
  figure `data-group="name"`, the lines a class `req-<family>`, and add
  `<div class="fig-toggles"><label><input type="checkbox" data-toggle="<family>" autocomplete="off" checked> …</label></div>`.
  A new family also needs a `.hide-<family> .req-<family>{display:none}` rule in `assets/site.css`.

## 6. Components

| Use | Markup |
| --- | --- |
| Formula | `<div class="eq">` … annotation list `</div>` (section 4) |
| Definition | `<div class="box def"><span class="label">Definition</span>…</div>` |
| Common mistake | `<div class="box watch"><span class="label">Watch out</span>…</div>` |
| Exam pointer | `<div class="box exam"><span class="label">Exam</span>…</div>` |
| Intuition | `<div class="box intuition"><span class="label">Intuition</span>…</div>` |
| Caution or side note | `<div class="note"><span class="tag">What it costs</span>…</div>` |
| Key result | `<div class="key"><span class="tag">Key idea</span>…</div>` |
| Where it is in the slides or textbook | `<p class="reading"><b>Reading</b> Ch 8.2, slides 4 to 9</p>` |
| Table | `<div class="tbl"><table>…</table></div>` |
| Code | `<pre><code>…</code></pre>` |
| Formula sheet | `<div class="sheet"><div><h4>Group</h4>…</div>…</div>` |

Worked examples are numbered by section and written as numbered steps that end in a stated answer:

```html
<div class="ex"><div class="hd">Worked example 3.1 <span>z-transform from the definition</span></div><div class="bd">
<p>The question.</p>
<div class="step"><i>1</i><div>First step, saying which result it uses.</div></div>
<div class="step"><i>2</i><div>Next step.</div></div>
<div class="ans">The answer, with units, and what it tells you.</div>
</div></div>
```

If a page needs something that is not here, add the class to `assets/site.css` rather than styling it in
the page.

## 7. Writing style

- Plain, direct sentences addressed to the reader. Define a term the first time it is used.
- Say why a result matters or when to use it, not only what it is.
- Short paragraphs. A list only for things that are a list.
- British spelling, SI units, a space between a number and its unit.

## 8. Before committing

1. Open the page through `python serve_notes.py` and check it in both light and dark themes.
2. No maths errors: no raw `\(` left on the page and no red MathJax text.
3. Every side-menu link lands on its section, and the back link opens the right module.
4. Every formula box has its annotation list, and every figure has a one-sentence caption.
5. Nothing scrolls sideways at phone width except wide tables and figures inside their own boxes.
6. The Ask Gemini button appears and `data-store` is unique.
7. Run `python build_manifest.py`, then commit the page and `manifest.js`.
