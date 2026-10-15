# notesmaxing

Study notes and past papers for third year, second semester (Stellenbosch University).

Open `index.html` to pick a module. Each module then has its own page (`module.html?m=<id>`) listing its notes by week and its past papers, with search and a built-in PDF viewer.

## Layout

```
index.html            the list of modules
module.html           one module's notes and past papers (module.html?m=<id>)
manifest.js           generated list of notes and papers
modules.json          the modules: id, folder, code, display name
build_manifest.py     scans the module folders and writes manifest.js
ingest.py             files correctly named notes and papers from inbox/ into place
serve_notes.py        local server: pages, papers and the Ask Gemini API
run_notes.bat         double-click launcher for serve_notes.py (Windows)
.env.example          template for the Gemini key (local server)
api/chat.js, health.js  Ask Gemini endpoints for the Vercel deployment
vercel.json           routes every page's api/ calls to those functions
assets/
    favicon.svg       the tab icon, linked from every page
    site.css          the one stylesheet: every page's look comes from here
    site.js           light/dark theme, collapsible menu, formula annotations, maths settings
    ask-gemini.js     the Ask Gemini panel, one script tag per page

CS354-Control-Systems/
    Week1-Feedback-Fundamentals/ ... Week7-State-Space/   one notes page per folder
    Week11-Digital-Control/Week11_Digital_Control_Notes.html
    papers/
Vibration-and-Noise/
    papers/
DA344-Data-Analytics/
    Week1_Introduction_to_Data_Analytics.html ... Week6_...
    papers/
    _template/          starting point for a new DA344 week (not listed)
CS245-Computer-Systems/
    theory/week1.html ... week5.html
    programming/week1.html ... week5.html
    papers/
Electronics/
    Week9_...html, Week10_...html
    papers/
```

## Adding notes or papers

Writing a new notes page, by hand or with an AI: follow [NOTES_GUIDE.md](NOTES_GUIDE.md). It is self-contained, so it can be handed to a model with the week's slides and nothing else, and it fixes the file name (`CS354_Week07_Notes_State-Space.html`, `CS354_2026_A1_Memo.pdf`).

**Quickest way in:** drop the files into `inbox/` and run `python ingest.py`. It files each one by its name, tidies the page's links and rebuilds the manifest (`--dry-run` to preview).

By hand:

- **Notes:** put the `.html` file anywhere inside the module's folder, either directly or in a week folder such as `Week11-Digital-Control/`. The week number comes from the path (`Week11`, `week3.html`), the title from the page's `<h1>`. A first-level subfolder that is not a week folder (`theory/`, `programming/`) is shown as a track.
- **Past papers:** put the PDF in the module's `papers/` folder. A four-digit year in the file name is used for sorting, and `memo`, `solution` or `answer` in the name marks it as a memo. Suggested naming: `DA344_2021_A1.pdf`, `DA344_2021_A1_Memo.pdf`.
- **New module:** add a line to `modules.json` and create the folder.

Then run `python build_manifest.py` and commit `manifest.js` with the new files. When the local server is running the lists are rebuilt from the folders on every refresh, so this step only matters for the committed copy.

Folders starting with `_` or `.` and files named `index.html` are never listed. PDFs are git-ignored everywhere except inside `papers/` folders.

## Page design

The look of the whole site lives in one file, `assets/site.css`: colours, fonts, spacing, the page title block, and every component the notes use. No page carries its own styles, so editing that file restyles every page at once. The tokens at the top of the file (`--genoa`, `--bg`, `--f-body`, ...) are the place to change a colour or a font. The design borrows its type and colours from greylinkiot.com (IBM Plex Sans and Mono, a teal accent on off-white paper, small uppercase mono labels, light and dark themes) and is deliberately plain: no logo and no branding.

A page needs these tags (adjust `../` to the page's depth):

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap">
<link rel="stylesheet" href="../assets/site.css">
<script src="../assets/site.js"></script>
...
<script src="../assets/ask-gemini.js" data-store="da344-w7" data-course="Data Analytics 344" data-topic="Week 7: Topic"></script>
```

and this skeleton: `<div class="wrap">`, holding `<nav class="toc">` (the side menu) and `<main>` with a `<header class="top">` (kicker, `<h1>`, one-line summary) followed by one `<section id="...">` per `<h2>`. `DA344-Data-Analytics/_template/NOTES_TEMPLATE.html` is a working example; after copying it into the module folder, change its `../../` paths to `../`.

- **No top bar.** Pages link to each other through their own back links (notes to their module, a module to the module list). The only shared control is the light/dark button at the top right, added by `site.js`; the theme follows the system until the button is used, then the choice is remembered.
- **Side menu:** the "Hide menu" button at the top of the contents rail collapses it, and a "Menu" button brings it back. The choice is remembered across pages.
- **Formula annotations:** every displayed formula has an "Annotate terms" checkbox, off by default, that lists what each term means. To annotate a new formula, end its box (`.eq` or `.formula`) with:

```html
<label class="annot"><input type="checkbox" autocomplete="off"> Annotate terms</label>
<dl class="terms"><dt>term</dt><dd>What it means.</dd></dl>
```

## Chat panel (The Lovely Lady)

Every notes page has a chat panel, named The Lovely Lady on the site, that sends questions, plus any text you select in the notes, to Google Gemini. A line under the conversation counts the tokens used: the last reply's tokens in and out, and the total for that page's chat (New chat resets it). The problem generator shows the same count for each problem. Click **Ask The Lovely Lady** (or press Ctrl+K), select lines in the notes to attach them, and press Ctrl+Enter to send. The API key stays on the server and never reaches the browser.

On a desktop-width screen the panel can be resized by dragging its left edge, or popped out with **Pop out** into a floating window that moves by its title bar and resizes from its bottom-right corner. **Dock** puts it back. The size and position are remembered.

**On the deployed site (Vercel)** it works as is. `api/chat.js` and `api/health.js` are Vercel functions that add the key and stream Gemini's answer, and `vercel.json` routes each page's `api/...` calls to them. The key comes from the project's environment variables: `GEMINI_API_KEY`, and optionally `GEMINI_MODEL`. The functions only accept requests from the site's own pages.

**Locally** the same panel runs through one small Python server:

1. Copy `.env.example` to `.env` (in this top folder) and paste your key after `GEMINI_API_KEY=`.
2. Run `python serve_notes.py` (or double-click `run_notes.bat` on Windows). It opens the module list at `http://localhost:8765`.
3. Open a notes page and use the panel as usual.

A page calls `api/health` and `api/chat` relative to its own location, and both the local server and the Vercel routes answer those at any depth, so a notes page with the panel works from any module folder without changes.

The server uses only the Python standard library, binds to `127.0.0.1`, and refuses to serve dotfiles (`.env`, `.git`) or `.py` files.

## Problem generator

`problems.html?m=<id>` (linked from each module page under Practice) asks Gemini for a new practice
problem and a worked solution. You describe the problem, tick the weeks of notes and the past papers it
should draw on, and attach tutorials or other files (PDF, image or text). It uses the same `api/chat`
endpoint and key as the Ask Gemini panel.

- Ticked notes are sent as text, PDFs and images as files. One request can carry about 3 MB of attachments,
  because the hosted site refuses request bodies over 4.5 MB.
- Every generated problem is saved in the browser (`localStorage`, key `notes-problems`) and listed under
  Saved problems. Export and Import move them between browsers as one JSON file.
- The titles of the problems already saved for a module are sent with each request so the next one differs.

## Notes on sources

The notes are my own write-up of the course content. Lecture slides, videos and textbook material are not included in this repository.
