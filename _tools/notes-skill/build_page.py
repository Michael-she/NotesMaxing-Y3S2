"""
Fills figure placeholders in a page draft.

Usage:
    python build_page.py DRAFT.html FIGS.json OUT.html

The draft contains lines like {{F:ce_npn}} where a figure's <svg> belongs. FIGS.json maps each name
to its SVG string (written by a week's figs.py using schem.py). Every placeholder must have a figure,
or the build stops. Output uses LF line endings, as the repo expects.
"""
import json
import re
import sys

src, figs, out = sys.argv[1:4]
F = json.load(open(figs, encoding="utf-8"))
t = open(src, encoding="utf-8").read()
missing = [k for k in re.findall(r"\{\{F:(\w+)\}\}", t) if k not in F]
if missing:
    sys.exit("no figure for placeholder(s): " + ", ".join(missing))
t = re.sub(r"\{\{F:(\w+)\}\}", lambda m: F[m.group(1)], t)
open(out, "w", encoding="utf-8", newline="\n").write(t)
print("built", out)
