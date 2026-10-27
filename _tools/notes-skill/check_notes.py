"""
Checks notes pages against NOTES_GUIDE.md (Part A) before they are filed with ingest.py.

Usage:
    python check_notes.py PAGE.html [PAGE.html ...] [--repo PATH_TO_CLONE]

--repo points at a clone of NotesMaxing-Y3S2. With it, modules come from modules.json and the CSS
classes a page uses are compared with assets/site.css. Without it, a built-in module table is used.

Each page gets ERROR lines (must be fixed before filing) and WARN lines (look at them, fix if real).
Exit code is 1 if any page has an error. Standard library only.
"""
import argparse
import json
import os
import re
import sys
from html.parser import HTMLParser

KINDS = ("Notes", "Tutorial", "Lab", "Revision", "Summary")
NOTES_RE = re.compile(
    r"^(?P<mod>[A-Za-z0-9]+)_Week(?P<week>\d{2})(?:_(?P<track>[a-z][a-z0-9-]*))?"
    r"_(?P<kind>" + "|".join(KINDS) + r")_(?P<topic>[A-Za-z0-9][A-Za-z0-9-]*)\.html$")
TOPIC_WORD_RE = re.compile(r"^([A-Z0-9][A-Za-z0-9]*|of|and|in|on|the|a|an|to|for|with|vs|by|at)$")

DEFAULT_MODULES = [
    {"id": "cs354", "folder": "CS354-Control-Systems", "code": "CS354", "name": "Control Systems"},
    {"id": "vibration", "folder": "Vibration-and-Noise", "code": "VN354", "name": "Vibration and Noise"},
    {"id": "da344", "folder": "DA344-Data-Analytics", "code": "DA344", "name": "Data Analytics"},
    {"id": "cs245", "folder": "CS245-Computer-Systems", "code": "CS245", "name": "Computer Systems"},
    {"id": "electronics", "folder": "Electronics", "code": "EL245", "name": "Electronics"},
]
TRACKED = {"cs245": ("theory", "programming")}

# Classes the site's scripts add or read even if site.css never names them.
JS_CLASSES = {"hit", "fig-toggles", "anim", "anim-controls", "fig-ctl", "fig-read", "annot", "terms",
              "btn", "small", "narrow", "fig", "k", "home", "toc", "wrap", "top", "kicker", "lede"}


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []          # (tag, attrs)
        self.ids = []
        self.classes = set()
        self.toc_links = []
        self.sections = []       # dicts: id, h2_count, n_text
        self.eqs = []            # dicts: has_terms, has_annot, checked
        self.figures = []        # dicts: has_caption, caption, has_svg
        self.examples = []       # dicts: title, has_ans
        self.h1 = None
        self.footer_text = ""
        self.title = ""
        self.toc_k = ""
        self.home_href = None
        self.scripts = []
        self.links = []
        self.style_attr = 0
        self.style_tag = 0
        self.colour_attrs = []
        self._cap = None         # text capture target
        self._buf = []

    # helpers
    def _in(self, tag, cls=None):
        for t, a in reversed(self.stack):
            if t == tag and (cls is None or cls in (a.get("class") or "").split()):
                return a
        return None

    def _nearest(self, kind):
        for item in reversed(self._open_blocks):
            if item[0] == kind:
                return item[1]
        return None

    def reset(self):
        super().reset()
        self._open_blocks = []   # (kind, record, depth)

    def handle_starttag(self, tag, attrs):
        a = {k: (v if v is not None else "") for k, v in attrs}
        cls = a.get("class", "").split()
        self.classes.update(cls)
        if "id" in a:
            self.ids.append(a["id"])
        if "style" in a:
            self.style_attr += 1
        if tag == "style":
            self.style_tag += 1
        for attr in ("fill", "stroke", "color", "bgcolor"):
            v = a.get(attr, "")
            if v and v.lower() not in ("none", "currentcolor", "transparent", "inherit"):
                self.colour_attrs.append("%s=\"%s\"" % (attr, v))
        if tag == "script" and a.get("src"):
            self.scripts.append(a)
        if tag == "link":
            self.links.append(a)
        if tag == "a" and self._in("nav", "toc") is not None:
            href = a.get("href", "")
            if "home" in cls:
                self.home_href = href
            elif href.startswith("#"):
                self.toc_links.append(href[1:])
        depth = len(self.stack)
        if tag == "section":
            rec = {"id": a.get("id"), "h2": 0, "n": None}
            self.sections.append(rec)
            self._open_blocks.append(("section", rec, depth))
        if tag == "div" and "eq" in cls:
            rec = {"terms": False, "annot": False, "checked": False}
            self.eqs.append(rec)
            self._open_blocks.append(("eq", rec, depth))
        if tag == "figure":
            rec = {"caption": None, "svg": False, "anim": "anim" in cls}
            self.figures.append(rec)
            self._open_blocks.append(("figure", rec, depth))
        if tag == "div" and "ex" in cls:
            rec = {"title": "", "ans": False}
            self.examples.append(rec)
            self._open_blocks.append(("ex", rec, depth))
        if tag == "dl" and "terms" in cls and self._nearest("eq"):
            self._nearest("eq")["terms"] = True
        if tag == "label" and "annot" in cls and self._nearest("eq"):
            self._nearest("eq")["annot"] = True
        if tag == "input" and self._nearest("eq") and "checked" in a:
            self._nearest("eq")["checked"] = True
        if tag == "svg" and self._nearest("figure"):
            self._nearest("figure")["svg"] = True
        if tag == "div" and "ans" in cls and self._nearest("ex"):
            self._nearest("ex")["ans"] = True
        if tag == "h2" and self._nearest("section"):
            self._nearest("section")["h2"] += 1
        if tag == "span" and "n" in cls and self._in("h2") is not None and self._nearest("section"):
            self._start_cap("n")
        if tag == "h1":
            self._start_cap("h1")
        if tag == "title":
            self._start_cap("title")
        if tag == "footer":
            self._start_cap("footer")
        if tag == "figcaption":
            self._start_cap("figcaption")
        if tag == "div" and "k" in cls and self._in("nav", "toc") is not None:
            self._start_cap("toc_k")
        if tag == "div" and "hd" in cls and self._nearest("ex"):
            self._start_cap("ex_hd")
        if tag not in ("meta", "link", "input", "br", "img", "hr", "source", "path", "line", "rect",
                       "circle", "ellipse", "polyline", "polygon", "use", "stop"):
            self.stack.append((tag, a))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()
            self._close_blocks()

    def _start_cap(self, what):
        if self._cap is None:
            self._cap = (what, len(self.stack))
            self._buf = []

    def handle_data(self, data):
        if self._cap is not None:
            self._buf.append(data)

    def _close_blocks(self):
        while self._open_blocks and self._open_blocks[-1][2] >= len(self.stack):
            self._open_blocks.pop()

    def handle_endtag(self, tag):
        # pop to the matching tag (tolerates sloppy nesting)
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break
        if self._cap is not None and len(self.stack) <= self._cap[1]:
            what = self._cap[0]
            text = re.sub(r"\s+", " ", "".join(self._buf)).strip()
            self._cap = None
            if what == "h1":
                self.h1 = text
            elif what == "title":
                self.title = text
            elif what == "footer":
                self.footer_text = text
            elif what == "toc_k":
                self.toc_k = text
            elif what == "n" and self._nearest("section"):
                self._nearest("section")["n"] = text
            elif what == "figcaption" and self._nearest("figure"):
                self._nearest("figure")["caption"] = text
            elif what == "ex_hd" and self._nearest("ex"):
                self._nearest("ex")["title"] = text
        self._close_blocks()


def load_modules(repo):
    mods = DEFAULT_MODULES
    if repo and os.path.exists(os.path.join(repo, "modules.json")):
        with open(os.path.join(repo, "modules.json"), encoding="utf-8") as fh:
            mods = json.load(fh)
    by_key = {}
    for m in mods:
        by_key[m["id"].lower()] = m
        if m.get("code"):
            by_key[m["code"].lower()] = m
    return by_key


def css_classes(repo):
    if not repo:
        return None
    path = os.path.join(repo, "assets", "site.css")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8", errors="replace") as fh:
        css = re.sub(r"/\*.*?\*/", "", fh.read(), flags=re.S)
    names = set(re.findall(r"\.([A-Za-z_][A-Za-z0-9_-]*)", css))
    for js in ("site.js", "annotate.js", "ask-gemini.js"):
        p = os.path.join(repo, "assets", js)
        if os.path.exists(p):
            with open(p, encoding="utf-8", errors="replace") as fh:
                names.update(re.findall(r"['\"\s.]([a-z][a-z0-9-]{1,30})['\"\s]", fh.read()))
    return names | JS_CLASSES


def check(path, modules, known_classes):
    errors, warns = [], []
    name = os.path.basename(path)

    m = NOTES_RE.match(name)
    mod = None
    if not m:
        errors.append("file name does not match <MODULE>_Week<NN>[_<track>]_<Kind>_<Topic>.html "
                      "(two-digit week, Kind one of %s)" % ", ".join(KINDS))
    else:
        mod = modules.get(m["mod"].lower())
        if not mod:
            errors.append("unknown module '%s' (see modules.json)" % m["mod"])
        else:
            expected_mod = mod["code"] or mod["id"]
            if m["mod"] != expected_mod:
                warns.append("file name uses '%s'; NOTES_GUIDE asks for '%s'" % (m["mod"], expected_mod))
            tracks = TRACKED.get(mod["id"])
            if tracks and m["track"] not in tracks:
                errors.append("%s needs a track (%s) in the file name" % (mod["id"], " or ".join(tracks)))
            if not tracks and m["track"]:
                errors.append("%s has no tracks; remove '_%s'" % (mod["id"], m["track"]))
        words = m["topic"].split("-")
        if len(words) > 6:
            warns.append("topic has %d words; the guide allows 1 to 6" % len(words))
        bad = [w for w in words if not TOPIC_WORD_RE.match(w)]
        if bad:
            warns.append("topic words not in Title Case: %s" % ", ".join(bad))

    with open(path, encoding="utf-8", errors="replace") as fh:
        text = fh.read()

    if not text.lstrip().lower().startswith("<!doctype html>"):
        errors.append("file does not start with <!doctype html>")

    p = Page()
    p.feed(text)
    p.close()

    # skeleton
    if not p.h1:
        errors.append("no <h1> (the module list takes the title from it)")
    elif re.match(r"\s*week\s*\d", p.h1, re.I):
        errors.append("<h1> starts with the week; drop it (the week is shown separately)")
    if not any("assets/site.css" in l.get("href", "") for l in p.links):
        errors.append("no link to ../assets/site.css")
    if not any("assets/site.js" in s.get("src", "") for s in p.scripts):
        errors.append("no ../assets/site.js script")
    gemini = [s for s in p.scripts if "ask-gemini.js" in s.get("src", "")]
    if not gemini:
        errors.append("no chat panel script (../assets/ask-gemini.js)")
    if p.style_tag:
        errors.append("has a <style> block; pages use assets/site.css only")
    if p.style_attr:
        errors.append("has %d style=\"\" attribute(s)" % p.style_attr)
    if p.colour_attrs:
        errors.append("colour attributes in markup (use the SVG classes): %s"
                      % ", ".join(sorted(set(p.colour_attrs))[:6]))
    if re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(", re.sub(r"<script[\s\S]*?</script>", "", text)
                 .split("<body", 1)[-1].replace("&#", "")):
        warns.append("something that looks like a colour value appears in the body")

    no_scripts = re.sub(r"<script[\s\S]*?</script>", "", text)
    if re.search(r"(?<![\\$])\$[^$\s][^$\n]*\$", no_scripts):
        errors.append("uses $...$ maths; use \\( \\) inline and \\[ \\] display")
    has_maths = "\\(" in no_scripts or "\\[" in no_scripts
    has_mathjax = any("mathjax" in s.get("src", "").lower() for s in p.scripts)
    if has_maths and not has_mathjax:
        errors.append("page has maths but no MathJax script")
    for frag in re.findall(r"\\\((.*?)\\\)|\\\[(.*?)\\\]", no_scripts, re.S):
        body = "".join(frag)
        if re.search(r"<(?![a-z/!])", body) or "&lt;" in body or "&gt;" in body:
            warns.append("maths uses < or > (or &lt; &gt;); write \\lt and \\gt")
            break
    long_inline = [frag for frag in re.findall(r"\\\((.*?)\\\)", no_scripts, re.S) if len(frag) > 90]
    if long_inline:
        warns.append("%d long inline maths expression(s) over 90 chars; put them in \\[ \\] so they fit on a "
                     "phone (scripts/promote_long_maths.py does this). First: %s"
                     % (len(long_inline), long_inline[0][:60] + "..."))

    for need in re.findall(r"<!--\s*needs-css:(.*?)-->", text, re.S):
        warns.append("needs-css request: " + " ".join(need.split()))

    # placeholders from the file name
    if m and mod:
        week = int(m["week"])
        code = mod["code"] or mod["name"]
        store = "%s-w%d%s%s" % (mod["id"], week, "-" + m["track"] if m["track"] else "",
                                "" if m["kind"] == "Notes" else "-" + m["kind"].lower())
        if gemini and gemini[0].get("data-store") != store:
            errors.append("data-store is '%s'; the file name gives '%s'" % (gemini[0].get("data-store"), store))
        if gemini and not gemini[0].get("data-topic", "").startswith("Week %d:" % week):
            warns.append("data-topic should start with 'Week %d:'" % week)
        if p.home_href is None:
            errors.append("no back link (<a class=\"home\">) in the side menu")
        elif "module.html?m=%s" % mod["id"] not in p.home_href:
            errors.append("back link is '%s'; expected ../module.html?m=%s" % (p.home_href, mod["id"]))
        if ("Week %d" % week) not in p.toc_k:
            warns.append("side menu label is '%s'; expected '%s · Week %d'" % (p.toc_k, code, week))
        if not re.match(r"Week %d: .+ · .+ · notesmaxing$" % week, p.title):
            warns.append("<title> is '%s'; expected 'Week %d: <topic> · %s · notesmaxing'" % (p.title, week, code))

    # ids and the side menu
    seen, dup = set(), set()
    for i in p.ids:
        (dup if i in seen else seen).add(i)
    if dup:
        errors.append("duplicate ids: %s" % ", ".join(sorted(dup)))
    bad_ids = [i for i in seen if not re.match(r"^[a-z0-9][a-z0-9-]*$", i)]
    if bad_ids:
        warns.append("ids should be lower case with hyphens: %s" % ", ".join(sorted(bad_ids)[:8]))
    missing = [h for h in p.toc_links if h not in seen]
    if missing:
        errors.append("side menu links to missing ids: %s" % ", ".join(missing))
    secs = [s for s in p.sections if s["h2"]]
    for s in p.sections:
        if s["h2"] and not s["id"]:
            errors.append("a <section> with an <h2> has no id")
        elif s["h2"] and s["id"] not in p.toc_links:
            errors.append("section #%s has no side menu line" % s["id"])
        if s["h2"] > 1:
            errors.append("section #%s has %d <h2>; one per section" % (s["id"], s["h2"]))
    numbers = [s["n"] for s in secs]
    expected = ["%02d" % (i + 1) for i in range(len(secs))]
    if numbers != expected:
        errors.append("section numbers are %s; expected %s" % (numbers, expected))
    if not secs:
        errors.append("no <section> with an <h2>")

    # formulas, figures, examples
    for i, e in enumerate(p.eqs, 1):
        if not e["terms"]:
            errors.append("formula box %d has no annotation list (<dl class=\"terms\">)" % i)
        if not e["annot"]:
            warns.append("formula box %d has no 'Annotate terms' checkbox" % i)
        if e["checked"]:
            errors.append("formula box %d checkbox starts ticked; it must start off" % i)
    for i, f in enumerate(p.figures, 1):
        if not f["caption"]:
            errors.append("figure %d has no <figcaption>" % i)
        else:
            body = re.sub(r"^Figure [\d.]+[,.:]?( animated\.)?\s*", "", f["caption"])
            if len(re.findall(r"[.!?](\s|$)", body)) > 1 or len(body.split()) > 30:
                warns.append("caption of figure %d is longer than one short sentence; move detail to a "
                             "fignote" % i)
    for e in p.examples:
        if not e["ans"]:
            errors.append("'%s' has no <div class=\"ans\"> with a stated answer" % (e["title"] or "worked example"))

    # end matter
    if not p.footer_text:
        errors.append("no <footer> listing the sources")
    elif "source" not in p.footer_text.lower():
        warns.append("footer does not say 'Sources'")
    if m and m["kind"] == "Notes":
        if not re.search(r"Problem\s+\d+\.\d+", re.sub(r"<[^>]+>", " ", no_scripts)):
            warns.append("Notes page has no practice problems (Problem N.M blocks)")
        if "sheet" not in p.classes:
            warns.append("Notes page has no formula sheet (<div class=\"sheet\">); fine only for a "
                         "non-mathematical module with a key-points summary")

    if known_classes is not None:
        unknown = sorted(c for c in p.classes
                         if c not in known_classes and not c.startswith("req-"))
        if unknown:
            warns.append("classes not found in site.css: %s" % ", ".join(unknown[:12]))

    return errors, warns


def main():
    ap = argparse.ArgumentParser(description="Check notes pages against NOTES_GUIDE.md.")
    ap.add_argument("pages", nargs="+")
    ap.add_argument("--repo", help="path to a clone of NotesMaxing-Y3S2")
    args = ap.parse_args()
    modules = load_modules(args.repo)
    known = css_classes(args.repo)
    failed = 0
    for path in args.pages:
        errors, warns = check(path, modules, known)
        status = "FAIL" if errors else "PASS"
        print("%s  %s" % (status, os.path.basename(path)))
        for e in errors:
            print("  ERROR " + e)
        for w in warns:
            print("  WARN  " + w)
        failed += bool(errors)
    print("%d page(s), %d failed." % (len(args.pages), failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
