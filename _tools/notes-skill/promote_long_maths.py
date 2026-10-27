"""
Moves long inline maths to display maths so it does not overflow on a phone (NOTES_GUIDE A7).

Usage:
    python promote_long_maths.py DRAFT.html [--limit 90]

Every \\( ... \\) longer than the limit (default 90 characters, the same limit check_notes.py warns
at) becomes \\[ ... \\]. A full stop straight after the closing bracket is dropped, since a displayed
equation ends the sentence visually. Edits the file in place and prints how many were moved.
"""
import re
import sys

args = sys.argv[1:]
limit = 90
if "--limit" in args:
    i = args.index("--limit"); limit = int(args[i + 1]); del args[i:i + 2]
path = args[0]
t = open(path, encoding="utf-8").read()


def fix(m):
    body = m.group(1)
    return "\\[ " + body + " \\]" if len(body) > limit else m.group(0)


t2 = re.sub(r"\\\((.*?)\\\)\.?", fix, t, flags=re.S)
open(path, "w", encoding="utf-8", newline="\n").write(t2)
print("promoted", t.count("\\(") - t2.count("\\("))
