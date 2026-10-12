# Y3S2 Notes

Study notes for third year, second semester (Stellenbosch University).

## Contents

| Module | Topic | Folder |
|---|---|---|
| CS354 Control Systems | Week 12, Chapter 8: Digital control (z-transform, s-to-z mapping, Tustin / ZOH / MPZ discrete equivalents, sample-rate selection, aliasing) | [`CS354-Control-Systems/Week12-Digital-Control`](CS354-Control-Systems/Week12-Digital-Control) |

## Reading the notes

Open `Week12_Digital_Control_Notes.html` in a browser. Equations load from a CDN, so an internet connection is needed.

## Ask Gemini panel (optional)

The notes include a chat panel that sends questions, plus any text you select in the notes, to Google Gemini. It runs through a small local server so the API key never reaches the browser.

1. In the week's folder, copy `.env.example` to `.env` and paste your key after `GEMINI_API_KEY=`.
2. Run `python serve_notes.py` (or double-click `run_notes.bat` on Windows). It opens `http://localhost:8765`.
3. Click **Ask Gemini** (or press Ctrl+K), select lines in the notes to attach them, and ask.

The server uses only the Python standard library, binds to `127.0.0.1`, and refuses to serve `.env` or `.py` files.

## Notes on sources

The notes are my own write-up of the course content. Lecture slides, videos and textbook material are not included in this repository.
