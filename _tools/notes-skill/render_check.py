"""
Renders notes pages in headless Chromium the way the site serves them, and reports problems.

Usage:
    python render_check.py --repo CLONE --shots SHOT_DIR PAGE.html [PAGE.html ...]

Each page is copied into its module folder inside a scratch copy of the repo (so ../assets paths
resolve), opened at 1280 px (light and dark) and 390 px (phone), and checked for:
  merr    MathJax errors (mjx-merror elements)          must be 0
  raw     unrendered \\( or \\[ left in the text           must be 0
  errors  console or page errors                        must be empty
  sw/cw   page scroll width against viewport width      must be equal (no sideways scroll)
  wide    elements past the right edge, outside figures, tables, code and maths
Every <figure> is screenshotted at 1280 px in both themes into SHOT_DIR, so the figures can be
looked at (labels overlapping lines, text outside the viewBox, curves off the plot).

Needs Playwright with Chromium, and MathJax 3.2.2 from npm in this folder or any parent
(`npm install mathjax@3.2.2`), because the page loads MathJax from a CDN the sandbox may not reach.
Google Fonts requests are answered with an empty stylesheet for the same reason.
The repo copy is made once in a sibling folder named _render_site and never pushed.
Exit code 1 if any page has a problem.
"""
import argparse
import json
import os
import re
import shutil
import sys

from playwright.sync_api import sync_playwright


def find_mathjax(start):
    d = os.path.abspath(start)
    while True:
        p = os.path.join(d, "node_modules", "mathjax", "es5", "tex-svg.js")
        if os.path.exists(p):
            return p
        if os.path.dirname(d) == d:
            return None
        d = os.path.dirname(d)


def module_folder(repo, page):
    mods = json.load(open(os.path.join(repo, "modules.json"), encoding="utf-8"))
    key = os.path.basename(page).split("_")[0].lower()
    for m in mods:
        if key in (m["id"].lower(), (m.get("code") or "").lower()):
            return m["folder"]
    sys.exit("unknown module for %s" % page)


ap = argparse.ArgumentParser()
ap.add_argument("--repo", required=True)
ap.add_argument("--shots", required=True)
ap.add_argument("pages", nargs="+")
a = ap.parse_args()

mj = find_mathjax(os.getcwd()) or find_mathjax(os.path.dirname(__file__))
if not mj:
    sys.exit("MathJax not found: run `npm install mathjax@3.2.2` in the working folder")
site = os.path.join(os.path.dirname(os.path.abspath(a.shots)), "_render_site")
if not os.path.isdir(site):
    shutil.copytree(a.repo, site, ignore=shutil.ignore_patterns(".git"))
os.makedirs(a.shots, exist_ok=True)

JS = r"""()=>{
  const m=document.querySelector('main');
  const cw=document.documentElement.clientWidth;
  const wide=[...m.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>cw+1
     && !e.closest('figure,.tbl,pre,mjx-container')).slice(0,5).map(e=>e.tagName+'.'+e.className);
  return {merr:document.querySelectorAll('mjx-merror').length,
          raw:(m.innerText.match(/\\\(|\\\[/g)||[]).length,
          mjx:document.querySelectorAll('mjx-container').length,
          sw:document.documentElement.scrollWidth, cw:cw, wide:wide}}"""

bad = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for pg in a.pages:
        dst = os.path.join(site, module_folder(a.repo, pg), os.path.basename(pg))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy(pg, dst)
        out = {}
        for w, theme in ((1280, "light"), (390, "light"), (1280, "dark")):
            ctx = b.new_context(viewport={"width": w, "height": 900})
            page = ctx.new_page(); errs = []
            page.on("console", lambda msg: errs.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.route("**/mathjax/**", lambda r: r.fulfill(path=mj, content_type="application/javascript"))
            page.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(body="", content_type="text/css"))
            page.goto("file://" + dst); page.wait_for_timeout(3000)
            if theme == "dark":
                page.evaluate("document.documentElement.setAttribute('data-theme','dark')")
                page.wait_for_timeout(300)
            r = page.evaluate(JS)
            r["errors"] = [e for e in errs if "ERR_" not in e and "Failed to load resource" not in e][:5]
            out["%d-%s" % (w, theme)] = r
            if w == 1280:
                stem = re.sub(r"\.html$", "", os.path.basename(pg))
                for i, el in enumerate(page.query_selector_all("main figure"), 1):
                    el.screenshot(path=os.path.join(a.shots, "%s-%s-fig%d.png" % (stem, theme, i)))
            ctx.close()
        os.remove(dst)
        problems = [k for k, r in out.items() if r["merr"] or r["raw"] or r["errors"] or r["sw"] != r["cw"] or r["wide"]]
        print("%s  %s" % ("FAIL" if problems else "PASS", os.path.basename(pg)))
        for k in problems:
            print("  %s: %s" % (k, json.dumps(out[k])))
        bad += bool(problems)
    b.close()
print("%d page(s), %d failed. Figure screenshots in %s" % (len(a.pages), bad, a.shots))
sys.exit(1 if bad else 0)
