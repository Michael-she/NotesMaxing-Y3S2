"""
Cuts a tutorial sheet into one picture per question for the "Throw a random tut problem at me" page
(tuts.html), and files it under the module's tuts/ folder with an entry in tuts/tuts.json.

Usage (from the repo root):
    python build_tuts.py <module id> <week> <tutorial.pdf> [<memo.pdf>]
    python build_tuts.py electronics 7 tut7_eng.pdf tut7_memo.pdf

Running it again for the same week replaces that week. Then run build_manifest.py and commit the new
files under <module folder>/tuts/ together with manifest.js. The PDFs themselves are not kept.

How a sheet is cut:
    questions   each starts at a line beginning "Question <n>". Its text is everything down to the next
                heading. A figure (a patch of ink on the right of the page once the text is blanked out: a
                circuit with its labels, or a picture) belongs to the question whose heading range holds
                the figure's middle, even when it starts above the heading. Anything of another question's
                that falls inside the crop is blanked out. Text above the first question on page
                1, other than the title lines, is the sheet's note (assumed values) and is shown with
                every question.
    answers     the pages from a line beginning "Answers" are kept as one picture per page, and sent
                to the AI as a check.
    memo        cut at its own "Question <n>" headings, one picture per page a question spans.
"Self Study" in a heading marks a self-study question. Check the pictures after a run: an unusual
layout can need a hand-made fix.

Needs PyMuPDF, Pillow, NumPy and SciPy (pip install pymupdf pillow numpy scipy).
"""
import io
import json
import os
import re
import sys

import numpy as np
import pymupdf
from scipy import ndimage
from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
DPI = 150
X0, X1 = 36, 580          # crop width on an A4 page, in points
TITLE_BELOW = 100         # page-1 lines above this are the sheet's title
FOOT = 60                 # the page number sits in the bottom 60 pt
FIG_X = 250               # drawings and pictures right of this are figures


def words(page):
    return [dict(r=pymupdf.Rect(w[:4]), t=w[4]) for w in page.get_text("words")]


def headings(doc):
    """Every "Question <n>" and "Answers" line, in reading order: (page, y, kind, number, line text)."""
    out = []
    for pi, page in enumerate(doc):
        ws = words(page)
        for i, w in enumerate(ws):
            if w["t"] in ("Question", "Answers") and w["r"].x0 < 90:
                line = " ".join(v["t"] for v in ws[i + 1:i + 12] if abs(v["r"].y0 - w["r"].y0) < 3)
                num = re.match(r"\d+", line) if w["t"] == "Question" else None
                if w["t"] == "Question" and not num:
                    continue
                out.append(dict(page=pi, y=w["r"].y0, kind=w["t"], num=int(num.group()) if num else None, line=line))
    return out


def figures(page):
    """Figures: patches of ink on the page once the question text is blanked out. Each patch (a circuit
    with its labels, a picture) is one figure. Done on a 1 px = 1 pt image, with ink closer than 8 pt joined."""
    pm = page.get_pixmap(dpi=72, colorspace=pymupdf.csGRAY)
    ink = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width) < 200
    ink = ink.copy()
    for w in words(page):              # question text on the left is not a figure
        r = w["r"]
        if r.x0 < FIG_X:
            ink[max(0, int(r.y0) - 1):int(r.y1) + 2, max(0, int(r.x0) - 1):int(r.x1) + 2] = False
    ink[:TITLE_BELOW if page.number == 0 else 0, :] = False
    ink[int(page.rect.height - FOOT):, :] = False
    lab, n = ndimage.label(ndimage.binary_dilation(ink, np.ones((9, 9), bool)))
    out = []
    for sl in ndimage.find_objects(lab):
        y, x = sl
        r = pymupdf.Rect(x.start + 4, y.start + 4, x.stop - 4, y.stop - 4)
        if r.x1 > FIG_X and r.width * r.height > 60:
            out.append(r)
    return out


def cut(doc):
    """Assign every word and figure to the sheet's note, a question, or the answers."""
    hs = headings(doc)
    qs = [h for h in hs if h["kind"] == "Question"]
    ans = next((h for h in hs if h["kind"] == "Answers"), None)
    owner_at = lambda pi, y: next((k for k, h in reversed(list(enumerate(hs))) if (h["page"], h["y"]) <= (pi, y + 2)), None)
    items = []   # (page, rect, owner) with owner = question index, "note", "answers" or None (title, footer)
    for pi, page in enumerate(doc):
        h = page.rect.height
        blocks = figures(page)
        owner_of = {id(b): owner_at(pi, (b.y0 + b.y1) / 2) for b in blocks}
        for b in blocks:
            items.append((pi, b, owner_of[id(b)], True))
        for w in words(page):
            r = w["r"]
            if r.y0 > h - FOOT:
                continue
            if pi == 0 and r.y1 < TITLE_BELOW:      # the sheet's title
                items.append((pi, r, None, False))
                continue
            # a word on a figure (a label) goes with the figure
            on = next((b for b in blocks if r.x0 >= FIG_X and b.intersects(r)), None)
            items.append((pi, r, owner_of[id(on)] if on is not None else owner_at(pi, r.y0), False))
    out = []
    for pi, r, k, fig in items:
        if k is None:
            owner = "note" if pi == 0 and r.y0 > TITLE_BELOW else None
        else:
            h = hs[k]
            owner = "answers" if h["kind"] == "Answers" else qs.index(h)
        out.append((pi, r, owner))
    return qs, ans, out


def png(page, rect, mask=()):
    pm = page.get_pixmap(dpi=DPI, clip=rect)
    im = Image.frombytes("RGB", (pm.width, pm.height), pm.samples)
    s = DPI / 72
    for m in mask:
        m = m & rect
        if m.is_empty:
            continue
        box = [round((m.x0 - rect.x0) * s) - 2, round((m.y0 - rect.y0) * s) - 2, round((m.x1 - rect.x0) * s) + 2, round((m.y1 - rect.y0) * s) + 2]
        im.paste((255, 255, 255), box)
    # grey pictures are saved as grey, which makes the file much smaller
    if max(hi for lo, hi in ImageChops.difference(im, im.convert("L").convert("RGB")).getextrema()) < 12:
        im = im.convert("L")
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue(), im.size


def crop_of(page, rs):
    y0 = min(r.y0 for r in rs) - 6
    y1 = max(r.y1 for r in rs) + 6
    return pymupdf.Rect(X0, max(0, y0), X1, min(page.rect.height, y1))


def main():
    if len(sys.argv) not in (4, 5):
        sys.exit(__doc__)
    mod_id, week, sheet = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    memo = sys.argv[4] if len(sys.argv) == 5 else None
    mods = json.load(open(os.path.join(HERE, "modules.json"), encoding="utf-8"))
    mod = next((m for m in mods if m["id"] == mod_id), None)
    if not mod:
        sys.exit("No module with id " + mod_id)
    folder = os.path.join(HERE, mod["folder"], "tuts")
    os.makedirs(folder, exist_ok=True)
    tag = f"w{week:02d}"
    for f in os.listdir(folder):            # replace this week's pictures
        if f.startswith(tag + "_") and f.endswith(".png"):
            os.remove(os.path.join(folder, f))

    def save(name, data_size):
        data, size = data_size
        with open(os.path.join(folder, name), "wb") as fh:
            fh.write(data)
        return {"src": name, "w": size[0], "h": size[1]}

    doc = pymupdf.open(sheet)
    qs, ans, items = cut(doc)
    first = doc[0].get_text()
    title = re.search(r"Tutorial\s+(\d+)\s*[-–]\s*(.+)", first)
    entry = {"week": week, "tut": int(title.group(1)) if title else week, "date": title.group(2).strip() if title else "",
             "note": None, "answers": [], "memo": bool(memo), "questions": []}

    def pictures(owner, name):
        pics = []
        pages = sorted({pi for pi, r, o in items if o == owner})
        for n, pi in enumerate(pages):
            page = doc[pi]
            mine = [r for p, r, o in items if p == pi and o == owner]
            rect = crop_of(page, mine)
            others = [r for p, r, o in items if p == pi and o != owner]
            pics.append(save(f"{name}{'' if len(pages) == 1 else '_' + str(n + 1)}.png", png(page, rect, others)))
        return pics

    if any(o == "note" for _, _, o in items):
        entry["note"] = pictures("note", f"{tag}_note")[0]
    if ans:
        for pi in range(ans["page"], len(doc)):
            page = doc[pi]
            mine = [r for p, r, o in items if p == pi and o == "answers"]
            if mine:
                entry["answers"].append(save(f"{tag}_answers_{pi - ans['page'] + 1}.png", png(page, crop_of(page, mine))))
    mdoc = pymupdf.open(memo) if memo else None
    mheads = [h for h in headings(mdoc) if h["kind"] == "Question"] if mdoc else []
    for i, q in enumerate(qs):
        ref = re.search(r"\(([A-Z]?\d+\.\d+[a-z]?)\)", q["line"])
        e = {"id": f"{tag}q{q['num']}", "num": q["num"], "ref": ref.group(1) if ref else "",
             "self": bool(re.search(r"self\s*-?\s*study", q["line"], re.I)), "img": pictures(i, f"{tag}_q{q['num']}"), "memo": []}
        # the memo's pages for this question: from its heading to the next one
        mh = next((k for k, h in enumerate(mheads) if h["num"] == q["num"]), None)
        if mh is not None:
            h = mheads[mh]
            nxt = mheads[mh + 1] if mh + 1 < len(mheads) else None
            end_page = nxt["page"] if nxt else len(mdoc) - 1
            for pi in range(h["page"], end_page + 1):
                page = mdoc[pi]
                y0 = h["y"] - 6 if pi == h["page"] else 40
                y1 = nxt["y"] - 4 if nxt and pi == nxt["page"] else page.rect.height - FOOT
                if y1 - y0 < 30:
                    continue
                ws = [w["r"] for w in words(page) if y0 <= w["r"].y0 and w["r"].y1 <= y1]
                figs = [b for b in figures(page) if y0 <= b.y0 and b.y1 <= y1]
                if not ws and not figs:
                    continue
                rect = pymupdf.Rect(X0, y0, X1, max(r.y1 for r in ws + figs) + 6)
                e["memo"].append(save(f"{e['id'].replace('q', '_q')}_memo_{len(e['memo']) + 1}.png", png(page, rect)))
        entry["questions"].append(e)

    index = os.path.join(folder, "tuts.json")
    data = json.load(open(index, encoding="utf-8")) if os.path.exists(index) else {"module": mod_id, "tuts": []}
    data["tuts"] = sorted([t for t in data["tuts"] if t["week"] != week] + [entry], key=lambda t: t["week"])
    with open(index, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print(f"Week {week}: {len(entry['questions'])} question(s)"
          + "".join(f"\n  Q{q['num']}{' (self study)' if q['self'] else ''}: {len(q['img'])} picture(s), {len(q['memo'])} memo page(s)" for q in entry["questions"]))


if __name__ == "__main__":
    main()
