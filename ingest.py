"""
Files new notes pages and past papers into the right module folder, then rebuilds manifest.js.

Usage (from the repo root):
    python ingest.py              drop files into inbox/ first, then run this
    python ingest.py FILE ...     or name the files directly
    python ingest.py --dry-run    show what would happen without moving anything
    python ingest.py --force      replace a file that already exists

The file name says where a file goes (see NOTES_GUIDE.md, "File names"):
    notes   <MODULE>_Week<NN>[_<track>]_<Kind>_<Topic>.html
            CS354_Week07_Notes_State-Space.html
            CS245_Week03_theory_Notes_Pipelining.html
    papers  <MODULE>_<YYYY>_<Assessment>[_Memo][_<Variant>].pdf
            CS354_2026_A1.pdf, CS354_2026_A1_Memo.pdf
<MODULE> is a module's code or id from modules.json, in any case.

A notes page is checked and tidied on the way in: its links are adjusted to the folder depth, the back
link points at its module, and data-store is set from the file name. Problems that need a person
(no <h1>, no stylesheet link) stop the file from being filed. Files that do not match a pattern are
left where they are. Only standard-library modules are used.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
INBOX = os.path.join(HERE, "inbox")
KINDS = ("Notes", "Tutorial", "Lab", "Revision", "Summary")

NOTES_RE = re.compile(
    r"^(?P<mod>[A-Za-z0-9]+)_Week(?P<week>\d{1,2})(?:_(?P<track>[a-z][a-z0-9-]*))?"
    r"_(?P<kind>" + "|".join(KINDS) + r")_(?P<topic>[A-Za-z0-9][A-Za-z0-9-]*)\.html$")
PAPER_RE = re.compile(
    r"^(?P<mod>[A-Za-z0-9]+)_(?P<year>(?:19|20)\d{2})_(?P<what>[A-Za-z0-9-]+)(?P<rest>(?:_[A-Za-z0-9-]+)*)\.pdf$")


def load_modules():
    with open(os.path.join(HERE, "modules.json"), encoding="utf-8") as fh:
        mods = json.load(fh)
    by_key = {}
    for m in mods:
        by_key[m["id"].lower()] = m
        if m.get("code"):
            by_key[m["code"].lower()] = m
    return by_key


def existing_stores(skip_path):
    """data-store values already used by pages in the repo (other than the one being replaced)."""
    stores = set()
    for dirpath, dirnames, filenames in os.walk(HERE):
        dirnames[:] = [d for d in dirnames if not d.startswith((".", "_")) and d not in ("inbox", "node_modules")]
        for name in filenames:
            path = os.path.join(dirpath, name)
            if name.endswith(".html") and os.path.abspath(path) != os.path.abspath(skip_path):
                with open(path, encoding="utf-8", errors="replace") as fh:
                    stores.update(re.findall(r'data-store="([^"]+)"', fh.read()))
    return stores


def tidy_notes(text, mod, depth, store):
    """Returns (text, errors, warnings) for a notes page about to live `depth` folders below the root."""
    errors, warnings = [], []
    if not re.search(r"<h1[^>]*>.*?</h1>", text, re.S):
        errors.append("no <h1> (the module list takes the title from it)")
    elif re.search(r"<h1[^>]*>\s*week\s*\d", text, re.I):
        warnings.append("the <h1> starts with the week; the module list already shows it")
    if "assets/site.css" not in text:
        errors.append("no link to assets/site.css")
    if re.search(r"<style[\s>]", text, re.I):
        warnings.append("has its own <style> block; pages should use assets/site.css only")
    if re.search(r"(?<![\\$])\$[^$\s][^$\n]*\$", re.sub(r"<script[\s\S]*?</script>", "", text)):
        warnings.append("may use $...$ for maths; MathJax here only reads \\( \\) and \\[ \\]")
    for need in re.findall(r"<!--\s*needs-css:(.*?)-->", text, re.S):
        warnings.append("asks for stylesheet support: " + " ".join(need.split()))

    # links to the site's own files: whatever depth the page was written for, make it this one
    up = "../" * depth
    text = re.sub(r'((?:href|src)=")(?:\.\./)+(assets/|module\.html|index\.html|problems\.html)',
                  lambda m: m.group(1) + up + m.group(2), text)
    text = re.sub(r"module\.html\?m=[A-Za-z0-9_-]+", "module.html?m=" + mod["id"], text)
    if "module.html?m=" not in text:
        warnings.append("no back link to the module page")
    if "ask-gemini.js" in text:
        text, n = re.subn(r'data-store="[^"]*"', 'data-store="%s"' % store, text, count=1)
        if not n:
            text = text.replace("ask-gemini.js\"", 'ask-gemini.js" data-store="%s"' % store, 1)
    else:
        warnings.append("no chat panel script (assets/ask-gemini.js)")
    return text, errors, warnings


def plan(path, modules):
    """Where a file goes: (destination, new text or None, errors, warnings), or None if the name does not match."""
    name = os.path.basename(path)
    m = NOTES_RE.match(name)
    if m:
        mod = modules.get(m["mod"].lower())
        if not mod:
            return None, None, ["unknown module '%s' (see modules.json)" % m["mod"]], []
        week, track = int(m["week"]), m["track"]
        parts = [HERE, mod["folder"]] + ([track] if track else []) + [name]
        dest = os.path.join(*parts)
        store = "%s-w%d%s%s" % (mod["id"], week, "-" + track if track else "",
                                "" if m["kind"] == "Notes" else "-" + m["kind"].lower())
        if store in existing_stores(dest):
            store += "-" + m["topic"].lower()
        with open(path, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        text, errors, warnings = tidy_notes(text, mod, len(parts) - 2, store)
        return dest, text, errors, warnings
    m = PAPER_RE.match(name)
    if m:
        mod = modules.get(m["mod"].lower())
        if not mod:
            return None, None, ["unknown module '%s' (see modules.json)" % m["mod"]], []
        if os.path.getsize(path) == 0:
            return None, None, ["the file is empty"], []
        return os.path.join(HERE, mod["folder"], "papers", name), None, [], []
    return None, None, [], []


def main():
    ap = argparse.ArgumentParser(description="File notes pages and past papers into the site.")
    ap.add_argument("files", nargs="*", help="files to file (default: everything in inbox/)")
    ap.add_argument("--dry-run", action="store_true", help="show what would happen, change nothing")
    ap.add_argument("--force", action="store_true", help="replace files that already exist")
    args = ap.parse_args()

    files = args.files
    if not files:
        os.makedirs(INBOX, exist_ok=True)
        files = sorted(os.path.join(INBOX, f) for f in os.listdir(INBOX) if not f.startswith("."))
    if not files:
        print("Nothing to do: inbox/ is empty.")
        return 0

    modules = load_modules()
    filed = skipped = 0
    for path in files:
        name = os.path.basename(path)
        if not os.path.isfile(path):
            print("  ?  %s: not a file" % name)
            skipped += 1
            continue
        dest, text, errors, warnings = plan(path, modules)
        if dest is None and not errors:
            errors = ["the name does not follow the convention in NOTES_GUIDE.md"]
        if dest and os.path.exists(dest) and not args.force:
            errors.append("%s already exists (use --force to replace it)" % os.path.relpath(dest, HERE))
        if errors:
            print("  x  %s" % name)
            for e in errors:
                print("       " + e)
            skipped += 1
            continue
        print("  -> %s" % os.path.relpath(dest, HERE).replace(os.sep, "/"))
        for w in warnings:
            print("       note: " + w)
        if not args.dry_run:
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            if text is None:
                shutil.copyfile(path, dest)
            else:
                with open(dest, "w", encoding="utf-8", newline="\n") as fh:
                    fh.write(text)
            if os.path.abspath(os.path.dirname(path)) == os.path.abspath(INBOX):
                os.remove(path)
        filed += 1

    print("%s %d file(s), skipped %d." % ("Would file" if args.dry_run else "Filed", filed, skipped), flush=True)
    if filed and not args.dry_run:
        subprocess.run([sys.executable, os.path.join(HERE, "build_manifest.py")], check=False)
    return 1 if skipped else 0


if __name__ == "__main__":
    sys.exit(main())
