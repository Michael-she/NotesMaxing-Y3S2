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
.env.example          template for the Gemini key

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
    style.css
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

## Ask Gemini panel (optional)

Notes pages can include a chat panel that sends questions, plus any text you select in the notes, to Google Gemini. It runs through one small local server for the whole repo, so the API key never reaches the browser.

1. Copy `.env.example` to `.env` (in this top folder) and paste your key after `GEMINI_API_KEY=`.
2. Run `python serve_notes.py` (or double-click `run_notes.bat` on Windows). It opens the hub at `http://localhost:8765`.
3. Open a notes page from the hub, click **Ask Gemini** (or press Ctrl+K), select lines in the notes to attach them, and ask.

A page calls `api/health` and `api/chat` relative to its own location, and the server answers those at any depth, so a notes page with the panel works from any module folder without changes.

The server uses only the Python standard library, binds to `127.0.0.1`, and refuses to serve dotfiles (`.env`, `.git`) or `.py` files.

## Notes on sources

The notes are my own write-up of the course content. Lecture slides, videos and textbook material are not included in this repository.
