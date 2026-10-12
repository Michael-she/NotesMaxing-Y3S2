# Y3S2 Notes

Study notes and past papers for third year, second semester (Stellenbosch University).

Open `index.html` for the hub: it lists every module's notes by week and its past papers, with search and a built-in PDF viewer.

## Layout

```
index.html            hub page (renders manifest.js)
manifest.js           generated list of notes and papers
modules.json          the modules: id, folder, code, display name
build_manifest.py     scans the module folders and writes manifest.js
serve_notes.py        local server: hub, notes, papers and the Ask Gemini API
run_notes.bat         double-click launcher for serve_notes.py (Windows)
.env.example          template for the Gemini key (local server)
api/chat.js, health.js  Ask Gemini endpoints for the Vercel deployment
vercel.json           routes every page's api/ calls to those functions
assets/
    site.css          the one stylesheet: every page's look comes from here
    site.js           header, light/dark theme, collapsible menu, formula annotations
    ask-gemini.js     the Ask Gemini panel, one script tag per page

CS354-Control-Systems/
    Week12-Digital-Control/Week12_Digital_Control_Notes.html
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
    papers/
```

## Adding notes or papers

- **Notes:** put the `.html` file anywhere inside the module's folder, either directly or in a week folder such as `Week12-Digital-Control/`. The week number comes from the path (`Week12`, `week3.html`), the title from the page's `<h1>`. A first-level subfolder that is not a week folder (`theory/`, `programming/`) is shown as a track.
- **Past papers:** put the PDF in the module's `papers/` folder. A four-digit year in the file name is used for sorting, and `memo`, `solution` or `answer` in the name marks it as a memo. Suggested naming: `DA344_2021_A1.pdf`, `DA344_2021_A1_Memo.pdf`.
- **New module:** add a line to `modules.json` and create the folder.

Then run `python build_manifest.py` and commit `manifest.js` with the new files. When the local server is running the hub rescans the folders on every refresh, so this step only matters for the committed copy.

Folders starting with `_` or `.` and files named `index.html` are never listed. PDFs are git-ignored everywhere except inside `papers/` folders.

## Page design

The look of the whole site lives in one file, `assets/site.css`: colours, fonts, spacing, the header, the hero band behind page titles, and every component the notes use. No page carries its own styles, so editing that file restyles the hub and every notes page at once. The tokens at the top of the file (`--genoa`, `--bg`, `--f-body`, ...) are the place to change a colour or a font. The design follows greylinkiot.com: IBM Plex Sans and Mono, a teal accent on off-white paper, small uppercase mono labels, a dark hero with a dot grid, and a light and a dark theme.

A page needs these tags (adjust `../` to the page's depth):

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap">
<link rel="stylesheet" href="../assets/site.css">
<script src="../assets/site.js"></script>
...
<script src="../assets/ask-gemini.js" data-store="da344-w7" data-course="Data Analytics 344" data-topic="Week 7: Topic"></script>
```

and this skeleton: `<div class="wrap">`, holding `<nav class="toc">` (the side menu) and `<main>` with a `<header class="top">` (kicker, `<h1>`, one-line summary) followed by one `<section id="...">` per `<h2>`. `DA344-Data-Analytics/_template/NOTES_TEMPLATE.html` is a working example; after copying it into the module folder, change its `../../` paths to `../`.

- **Header:** added to every page by `site.js`, with a link to each module and a light/dark button. The theme follows the system until the button is used, then the choice is remembered.
- **Side menu:** the "Hide menu" button at the top of the contents rail collapses it, and a "Menu" button brings it back. The choice is remembered across pages.
- **Formula annotations:** every displayed formula has an "Annotate terms" checkbox, off by default, that lists what each term means. To annotate a new formula, end its box (`.eq` or `.formula`) with:

```html
<label class="annot"><input type="checkbox" autocomplete="off"> Annotate terms</label>
<dl class="terms"><dt>term</dt><dd>What it means.</dd></dl>
```

## Ask Gemini panel

Every notes page has a chat panel that sends questions, plus any text you select in the notes, to Google Gemini. Click **Ask Gemini** (or press Ctrl+K), select lines in the notes to attach them, and press Ctrl+Enter to send. The API key stays on the server and never reaches the browser.

**On the deployed site (Vercel)** it works as is. `api/chat.js` and `api/health.js` are Vercel functions that add the key and stream Gemini's answer, and `vercel.json` routes each page's `api/...` calls to them. The key comes from the project's environment variables: `GEMINI_API_KEY`, and optionally `GEMINI_MODEL`. The functions only accept requests from the site's own pages.

**Locally** the same panel runs through one small Python server:

1. Copy `.env.example` to `.env` (in this top folder) and paste your key after `GEMINI_API_KEY=`.
2. Run `python serve_notes.py` (or double-click `run_notes.bat` on Windows). It opens the hub at `http://localhost:8765`.
3. Open a notes page from the hub and use the panel as usual.

A page calls `api/health` and `api/chat` relative to its own location, and both the local server and the Vercel routes answer those at any depth, so a notes page with the panel works from any module folder without changes.

The server uses only the Python standard library, binds to `127.0.0.1`, and refuses to serve dotfiles (`.env`, `.git`) or `.py` files.

## Notes on sources

The notes are my own write-up of the course content. Lecture slides, videos and textbook material are not included in this repository.
