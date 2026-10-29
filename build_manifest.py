"""
Scans the module folders and writes manifest.js, the list of notes and past
papers that index.html renders.

Usage (from the repo root):
    python build_manifest.py

serve_notes.py rebuilds the manifest on every page load, so this only needs to
be run by hand before committing (so the hub is also correct when the files are
opened directly or hosted as a static site).

What counts as what, inside each module folder listed in modules.json:
    notes   every .html file, except index.html and anything in a folder whose
            name starts with "_" or "."
    papers  every non-empty .pdf inside the module's papers/ folder
    exams   every .html file inside the module's exam-prep/ folder: practice exam papers with memos.
            A page can carry <meta name="exam-scope" content="A1"> and <meta name="exam-marks" content="80">.
    problems  the module's problems.json, if there is one: practice problems with worked solutions that
            problems.html lists with the ones generated in the browser, on every device
    tuts    the module's tuts/tuts.json (made by build_tuts.py): its address and the weeks and question
            count, for the random tutorial question page
The week number is read from the path ("Week12-...", "week3.html"), the title
from the page's <h1> (falling back to <title>), and a first-level subfolder
that is not a week folder ("theory", "programming") becomes a track.
Only standard-library modules are used.
"""
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MODULES_PATH = os.path.join(HERE, "modules.json")
MANIFEST_PATH = os.path.join(HERE, "manifest.js")
PAPERS_DIR = "papers"
EXAM_DIR = "exam-prep"
TUTS_INDEX = os.path.join("tuts", "tuts.json")

WEEK_RE = re.compile(r"week[\s_-]*0*(\d+)", re.I)
YEAR_RE = re.compile(r"(?<!\d)((?:19|20)\d{2})(?!\d)")
MEMO_RE = re.compile(r"memo|solution|answer", re.I)
TAG_RE = re.compile(r"<[^>]+>")


def _clean(fragment):
    return re.sub(r"\s+", " ", html.unescape(TAG_RE.sub("", fragment))).strip()


def _page_title(path):
    """Title for a notes page: its <h1>, else its <title>, else the file name."""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            head = fh.read(200_000)
    except OSError:
        head = ""
    for pattern in (r"<h1[^>]*>(.*?)</h1>", r"<title[^>]*>(.*?)</title>"):
        m = re.search(pattern, head, re.I | re.S)
        if m and _clean(m.group(1)):
            title = _clean(m.group(1))
            break
    else:
        title = os.path.splitext(os.path.basename(path))[0].replace("_", " ")
    # "Week 3 — Digital I/O" and "Week 3: Digital I/O" lose the prefix; the week is shown separately.
    return re.sub(r"^week\s*\d+\s*[—–:|-]\s*", "", title, flags=re.I) or title


def _url(*parts):
    return "/".join(p.replace(os.sep, "/") for p in parts)


def _notes(folder):
    root = os.path.join(HERE, folder)
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames
                             if not d.startswith(("_", ".")) and d.lower() not in (PAPERS_DIR, EXAM_DIR))
        for name in sorted(filenames):
            if not name.lower().endswith((".html", ".htm")) or name.lower().startswith("index."):
                continue
            rel = os.path.relpath(os.path.join(dirpath, name), root)
            segments = rel.split(os.sep)
            week = WEEK_RE.search(rel)
            track = ""
            if len(segments) > 1 and not WEEK_RE.search(segments[0]):
                track = segments[0].replace("-", " ").replace("_", " ").title()
            out.append({
                "title": _page_title(os.path.join(dirpath, name)),
                "week": int(week.group(1)) if week else None,
                "track": track,
                "href": _url(folder, rel),
            })
    out.sort(key=lambda n: (n["week"] is None, n["week"] or 0, n["track"], n["href"]))
    return out


def _papers(folder):
    root = os.path.join(HERE, folder)
    out = []
    if not os.path.isdir(root):
        return out
    for entry in sorted(os.listdir(root)):
        if entry.lower() != PAPERS_DIR:
            continue
        for dirpath, dirnames, filenames in os.walk(os.path.join(root, entry)):
            dirnames[:] = sorted(d for d in dirnames if not d.startswith(("_", ".")))
            for name in sorted(filenames):
                full = os.path.join(dirpath, name)
                if not name.lower().endswith(".pdf") or os.path.getsize(full) == 0:
                    continue
                year = YEAR_RE.search(name)
                out.append({
                    "file": name,
                    "year": int(year.group(1)) if year else None,
                    "memo": bool(MEMO_RE.search(name)),
                    "size": os.path.getsize(full),
                    "href": _url(folder, os.path.relpath(full, root)),
                })
    out.sort(key=lambda p: (-(p["year"] or 0), p["file"].lower()))
    return out


def _meta(path, name):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            head = fh.read(20_000)
    except OSError:
        return ""
    m = re.search(r'<meta\s+name="%s"\s+content="([^"]*)"' % re.escape(name), head, re.I)
    return _clean(m.group(1)) if m else ""


def _exams(folder):
    root = os.path.join(HERE, folder, EXAM_DIR)
    out = []
    if not os.path.isdir(root):
        return out
    for name in sorted(os.listdir(root)):
        full = os.path.join(root, name)
        if not name.lower().endswith((".html", ".htm")) or name.lower().startswith("index."):
            continue
        marks = _meta(full, "exam-marks")
        out.append({
            "title": _page_title(full),
            "scope": _meta(full, "exam-scope"),
            "marks": int(marks) if marks.isdigit() else None,
            "questions": int(_meta(full, "exam-questions") or 0) or None,
            "href": _url(folder, EXAM_DIR, name),
        })
    return out


def _problems(folder):
    path = os.path.join(HERE, folder, "problems.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        return {"href": _url(folder, "problems.json"), "count": len(json.load(fh))}


def _tuts(folder):
    path = os.path.join(HERE, folder, TUTS_INDEX)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        tuts = json.load(fh)["tuts"]
    return {"href": _url(folder, TUTS_INDEX), "weeks": [t["week"] for t in tuts],
            "questions": sum(len(t["questions"]) for t in tuts)}


def build():
    with open(MODULES_PATH, encoding="utf-8") as fh:
        modules = json.load(fh)
    return {"modules": [
        {**mod, "notes": _notes(mod["folder"]), "exams": _exams(mod["folder"]), "papers": _papers(mod["folder"]), "tuts": _tuts(mod["folder"]), "problems": _problems(mod["folder"])}
        for mod in modules
    ]}


def render(manifest):
    body = json.dumps(manifest, indent=1, ensure_ascii=False).replace("</", "<\\/")
    return "// Generated by build_manifest.py. Do not edit by hand.\nwindow.NOTES_MANIFEST = " + body + ";\n"


def main():
    manifest = build()
    with open(MANIFEST_PATH, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(render(manifest))
    for mod in manifest["modules"]:
        print(f"  {mod['folder']}: {len(mod['notes'])} note(s), {len(mod['papers'])} paper(s), {len(mod['exams'])} exam paper(s)")
    print(f"Wrote {os.path.relpath(MANIFEST_PATH, HERE)}")


if __name__ == "__main__":
    sys.exit(main())
