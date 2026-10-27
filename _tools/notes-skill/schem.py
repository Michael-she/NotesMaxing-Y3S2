"""
SVG drawing helpers for notes figures (circuits and plots). Colour only through site.css classes.
Import with sys.path.insert(0, "<clone>/_tools/notes-skill"); from schem import D, Plot, mos, ...
"""
import math
import re


def sub(txt):
    """'V_{CC}' -> SVG text with tspans. '-' kept, use unicode minus in labels yourself."""
    out, i = [], 0
    for m in re.finditer(r"_\{([^}]*)\}|_(\w)", txt):
        out.append(esc(txt[i:m.start()]))
        s = m.group(1) if m.group(1) is not None else m.group(2)
        out.append('<tspan dy="3" font-size="75%%">%s</tspan><tspan dy="-3"> </tspan>' % esc(s))
        i = m.end()
    out.append(esc(txt[i:]))
    return "".join(out)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def f(v):
    return ("%.1f" % v).rstrip("0").rstrip(".")


class D:
    def __init__(self, w, h, label):
        self.w, self.h, self.label, self.el = w, h, label, []

    # primitives
    def line(self, pts, cls="ln c4"):
        self.el.append('<polyline class="%s" points="%s"/>' % (cls, " ".join("%s,%s" % (f(x), f(y)) for x, y in pts)))

    def wire(self, *pts):
        self.line(pts)

    def dot(self, x, y):
        self.el.append('<circle class="c4f" cx="%s" cy="%s" r="2.6"/>' % (f(x), f(y)))

    def term(self, x, y):
        self.el.append('<circle class="hollow ln c4" cx="%s" cy="%s" r="3.5"/>' % (f(x), f(y)))

    def text(self, x, y, s, anchor="start", cls="lab"):
        self.el.append('<text class="%s" x="%s" y="%s" text-anchor="%s">%s</text>' % (cls, f(x), f(y), anchor, sub(s)))

    def poly(self, pts, cls="c4f"):
        self.el.append('<polygon class="%s" points="%s"/>' % (cls, " ".join("%s,%s" % (f(x), f(y)) for x, y in pts)))

    def arrowhead(self, x, y, dx, dy, cls="c4f", size=7):
        n = math.hypot(dx, dy); ux, uy = dx / n, dy / n
        bx, by = x - ux * size, y - uy * size
        px, py = -uy * size * 0.45, ux * size * 0.45
        self.poly([(x, y), (bx + px, by + py), (bx - px, by - py)], cls)

    # components
    def res_v(self, x, y1, y2, name=None, side="right"):
        L = y2 - y1; a = y1 + L * 0.3; b = y2 - L * 0.3; n = 6; step = (b - a) / n
        pts = [(x, y1), (x, a)]
        for k in range(n):
            pts.append((x + (7 if k % 2 == 0 else -7), a + step * (k + 0.5)))
        pts += [(x, b), (x, y2)]
        self.line(pts)
        if name:
            self.text(x + 12 if side == "right" else x - 12, (y1 + y2) / 2 + 4, name, "start" if side == "right" else "end")

    def res_h(self, x1, x2, y, name=None, above=True):
        L = x2 - x1; a = x1 + L * 0.3; b = x2 - L * 0.3; n = 6; step = (b - a) / n
        pts = [(x1, y), (a, y)]
        for k in range(n):
            pts.append((a + step * (k + 0.5), y + (-7 if k % 2 == 0 else 7)))
        pts += [(b, y), (x2, y)]
        self.line(pts)
        if name:
            self.text((x1 + x2) / 2, y - 12 if above else y + 22, name, "middle")

    def bjt(self, bx, by, kind="npn", emitter="down", name=None):
        """Base lead enters at (bx, by) from the left; bar at bx+20. Returns dict of C, E, B points."""
        x = bx + 20
        self.wire((bx, by), (x, by))
        self.wire((x, by - 14), (x, by + 14))
        s = 1 if emitter == "down" else -1
        cy1, ey1 = by - 6 * s, by + 6 * s
        C = (x + 20, by - 26 * s); E = (x + 20, by + 26 * s)
        self.wire((x, cy1), (x + 20, by - 18 * s), C)
        self.wire((x, ey1), (x + 20, by + 18 * s), E)
        if kind == "npn":
            self.arrowhead(x + 20, by + 18 * s, 20, 12 * s)
        else:
            self.arrowhead(x + 2, ey1 + 1.2 * s, -20, -12 * s)
        if name:
            self.text(x + 26, by + 4, name)
        return {"B": (bx, by), "C": C, "E": E}

    def ground(self, x, y):
        self.wire((x, y), (x, y + 6))
        for w, dy in ((9, 6), (5, 10), (2, 14)):
            self.wire((x - w, y + dy), (x + w, y + dy))

    def rail(self, x, y, label, up=True):
        self.wire((x - 12, y), (x + 12, y))
        self.text(x, y - 7 if up else y + 18, label, "middle")

    def vsource(self, x, ytop, ybot, name=None):
        mid = (ytop + ybot) / 2
        self.wire((x, ytop), (x, mid - 11)); self.wire((x, mid + 11), (x, ybot))
        self.el.append('<circle class="ln c4" cx="%s" cy="%s" r="11"/>' % (f(x), f(mid)))
        self.text(x, mid - 1, "+", "middle"); self.text(x, mid + 10, "−", "middle")
        if name:
            self.text(x - 16, mid + 4, name, "end")

    def current(self, x1, y1, x2, y2, name, lx=None, ly=None, anchor="start"):
        self.el.append('<line class="ln c3 thin" x1="%s" y1="%s" x2="%s" y2="%s"/>' % (f(x1), f(y1), f(x2), f(y2)))
        self.arrowhead(x2, y2, x2 - x1, y2 - y1, "c3f", 6)
        self.text(lx if lx is not None else x2 + 6, ly if ly is not None else y2, name, anchor)

    def svg(self, cls="fig"):
        return ('<svg viewBox="0 0 %d %d" class="%s" role="img" aria-label="%s">\n%s\n</svg>'
                % (self.w, self.h, cls, esc(self.label), "\n".join(self.el)))


class Plot:
    """Linear axes. data -> pixel."""
    def __init__(self, w, h, label, xr, yr, box=(60, 20, 30, 45)):
        self.d = D(w, h, label)
        self.x0, self.x1 = xr; self.y0, self.y1 = yr
        l, t, r, b = box
        self.L, self.T, self.R, self.B = l, t, w - r, h - b

    def px(self, x):
        return self.L + (x - self.x0) / (self.x1 - self.x0) * (self.R - self.L)

    def py(self, y):
        return self.B - (y - self.y0) / (self.y1 - self.y0) * (self.B - self.T)

    def axes(self, xt, yt, xlab, ylab, xfmt="%g", yfmt="%g"):
        d = self.d
        for x in xt:
            d.el.append('<line class="grid" x1="%s" y1="%s" x2="%s" y2="%s"/>' % (f(self.px(x)), f(self.T), f(self.px(x)), f(self.B)))
            d.text(self.px(x), self.B + 16, xfmt % x, "middle", "tk")
        for y in yt:
            d.el.append('<line class="grid" x1="%s" y1="%s" x2="%s" y2="%s"/>' % (f(self.L), f(self.py(y)), f(self.R), f(self.py(y))))
            d.text(self.L - 6, self.py(y) + 4, yfmt % y, "end", "tk")
        d.el.append('<rect class="frame" x="%s" y="%s" width="%s" height="%s"/>' % (f(self.L), f(self.T), f(self.R - self.L), f(self.B - self.T)))
        d.text((self.L + self.R) / 2, self.B + 36, xlab, "middle")
        d.el.append('<text class="lab" x="16" y="%s" text-anchor="middle" transform="rotate(-90 16 %s)">%s</text>'
                    % (f((self.T + self.B) / 2), f((self.T + self.B) / 2), sub(ylab)))

    def curve(self, xs, ys, cls="ln c1"):
        self.d.line([(self.px(x), self.py(y)) for x, y in zip(xs, ys)], cls)

    def point(self, x, y, cls="c3f", r=4):
        self.d.el.append('<circle class="%s" cx="%s" cy="%s" r="%s"/>' % (cls, f(self.px(x)), f(self.py(y)), r))

    def label(self, x, y, s, anchor="start", dx=0, dy=0, cls="lab"):
        self.d.text(self.px(x) + dx, self.py(y) + dy, s, anchor, cls)

    def svg(self, cls="fig"):
        return self.d.svg(cls)


def diode_v(d, x, y1, y2, name=None, led=False):
    """Vertical diode, anode at top (y1), cathode at bottom (y2), conducting downwards."""
    mid = (y1 + y2) / 2
    d.wire((x, y1), (x, mid - 9)); d.wire((x, mid + 9), (x, y2))
    d.el.append('<polygon class="ln c4" points="%s,%s %s,%s %s,%s"/>' % (f(x - 10), f(mid - 9), f(x + 10), f(mid - 9), f(x), f(mid + 9)))
    d.wire((x - 10, mid + 9), (x + 10, mid + 9))
    if led:
        for k in (0, 9):
            d.el.append('<line class="ln c3 thin" x1="%s" y1="%s" x2="%s" y2="%s"/>' % (f(x + 14), f(mid - 4 + k), f(x + 26), f(mid - 12 + k)))
            d.arrowhead(x + 27, mid - 13 + k, 12, -8, "c3f", 5)
    if name:
        d.text(x - 16, mid + 4, name, "end")


def cap_h(d, x1, x2, y, name=None):
    m = (x1 + x2) / 2
    d.wire((x1, y), (m - 4, y)); d.wire((m + 4, y), (x2, y))
    d.wire((m - 4, y - 10), (m - 4, y + 10)); d.wire((m + 4, y - 10), (m + 4, y + 10))
    if name:
        d.text(m, y - 15, name, "middle")


def bjt_left(d, bx, by, kind="npn", emitter="down", name=None):
    """Mirror of D.bjt: base lead enters from the right at (bx, by); collector/emitter on the left."""
    x = bx - 20
    d.wire((bx, by), (x, by)); d.wire((x, by - 14), (x, by + 14))
    s = 1 if emitter == "down" else -1
    C = (x - 20, by - 26 * s); E = (x - 20, by + 26 * s)
    d.wire((x, by - 6 * s), (x - 20, by - 18 * s), C)
    d.wire((x, by + 6 * s), (x - 20, by + 18 * s), E)
    if kind == "npn":
        d.arrowhead(x - 20, by + 18 * s, -20, 12 * s)
    else:
        d.arrowhead(x - 2, by + 6 * s + 1.2 * s, 20, -12 * s)
    if name:
        d.text(x - 26, by + 4, name, "end")
    return {"B": (bx, by), "C": C, "E": E}


def mos(d, gx, gy, kind="n", depletion=False, name=None, source="down"):
    """MOSFET, gate lead enters from the left at (gx, gy). Returns D, S, G points.
    kind 'n': arrow on the source lead points away from the channel; 'p': towards it."""
    xg = gx + 20; xc = xg + 7; xo = xc + 22
    d.wire((gx, gy), (xg, gy)); d.wire((xg, gy - 16), (xg, gy + 16))
    if depletion:
        d.wire((xc, gy - 18), (xc, gy + 18))
    else:
        for a, b in ((-18, -8), (-5, 5), (8, 18)):
            d.wire((xc, gy + a), (xc, gy + b))
    s = 1 if source == "down" else -1
    yd, ys = gy - 12 * s, gy + 12 * s
    D_ = (xo, gy - 32 * s); S_ = (xo, gy + 32 * s)
    d.wire((xc, yd), (xo, yd), D_); d.wire((xc, ys), (xo, ys), S_)
    d.wire((xc, gy), (xo, gy), (xo, ys))  # body tied to source
    if kind == "n":
        d.arrowhead(xo - 4, ys, 1, 0, size=6)
    else:
        d.arrowhead(xc + 4, ys, -1, 0, size=6)
    if name:
        d.text(xo + 8, gy + 4, name)
    return {"G": (gx, gy), "D": D_, "S": S_}


def isrc(d, x, y1, y2, name=None):
    """Current source between (x, y1) and (x, y2), current flowing downwards."""
    mid = (y1 + y2) / 2
    d.wire((x, y1), (x, mid - 12)); d.wire((x, mid + 12), (x, y2))
    d.el.append('<circle class="ln c4" cx="%s" cy="%s" r="12"/>' % (f(x), f(mid)))
    d.wire((x, mid - 7), (x, mid + 3)); d.arrowhead(x, mid + 8, 0, 1, size=6)
    if name:
        d.text(x + 18, mid + 4, name)
