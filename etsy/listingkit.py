"""Etsy listing photos: render a workbook, crop its sheets, lay them out on 4:3 photos.

Photo 1 is a laptop on the dark shop colour with the title on the left. The other
photos are on a light grey page: one sheet close up with a colour key, or a grid
of the tabs. Text is always left-aligned in Archivo.
"""
import os, subprocess
import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
W, H = 2700, 2025
DARK, LIGHT = "#173F44", "#EEF2F1"
INK, TEAL_D, MUTED, SOFT, ACCENT = "#1E2A2F", "#15525A", "#5E6E72", "#B8D3CF", "#F2C14E"
EDGE, DROP = "#C3CDCC", "#D6DEDD"
XB = os.path.join(ROOT, "fonts", "Archivo-ExtraBold.ttf")
MD = os.path.join(ROOT, "fonts", "Archivo-Medium.ttf")
M = 150  # page margin


class Renders:
    """PDF render of a workbook; page(title) returns the sheet whose title starts with it."""

    def __init__(self, xlsx, tmp, hide=None, hide_rows=None):
        """hide = {sheet: [column letters]}, hide_rows = {sheet: [row numbers]}: render a copy for close-ups."""
        os.makedirs(tmp, exist_ok=True)
        if hide or hide_rows:
            from openpyxl import load_workbook
            wb = load_workbook(xlsx)
            for name, cols in (hide or {}).items():
                for col in cols:
                    wb[name].column_dimensions[col].hidden = True
            for name, rows in (hide_rows or {}).items():
                for row in rows:
                    wb[name].row_dimensions[row].hidden = True
            for name in set(hide or {}) | set(hide_rows or {}):
                wb[name].page_setup.fitToHeight = 1  # the close-up sheet on a single page
            xlsx = os.path.join(tmp, os.path.splitext(os.path.basename(xlsx))[0] + "-closeup.xlsx")
            wb.save(xlsx)
        env = dict(os.environ, HOME="/tmp/lohome")
        subprocess.run(["soffice", "--headless", "--norestore", "--convert-to", "pdf", "--outdir", tmp, xlsx],
                       env=env, check=True, capture_output=True)
        self.doc = pymupdf.open(os.path.join(tmp, os.path.splitext(os.path.basename(xlsx))[0] + ".pdf"))
        self.titles = [p.get_text().split("\n")[0] for p in self.doc]

    def _index(self, title_start):
        return next(k for k, t in enumerate(self.titles) if t.startswith(title_start))

    def page(self, title_start):
        pix = self.doc[self._index(title_start)].get_pixmap(dpi=220)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

    def shot(self, title_start, until=None, keep=1.0):
        """The sheet's content; with `until`, cut under the table row that holds that text."""
        img = self.page(title_start)
        if until is None:
            return content(img, keep)
        rect = self.doc[self._index(title_start)].search_for(until)[0]
        return content(img, until_y=int(rect.y1 * 220 / 72))


def content(img, keep=1.0, pad=36, until_y=None):
    """Crop to the sheet's content (anything darker than the white page)."""
    a = np.asarray(img).astype(int)
    light = a.min(axis=2) >= 232
    ys, xs = np.where(~light)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    if until_y is not None:
        # Go down to the border under that row.
        border = np.array([213, 219, 219])
        for y in range(until_y, min(a.shape[0] - 1, until_y + 90)):
            if (np.abs(a[y, x0:x1] - border).sum(axis=1) < 45).mean() > 0.5:
                return img.crop((max(0, x0 - pad), max(0, y0 - pad), x1 + pad, y + 3))
        return img.crop((max(0, x0 - pad), max(0, y0 - pad), x1 + pad, until_y + 8))
    if keep < 1:
        y1 = y0 + int((y1 - y0) * keep)
        # Snap up to the nearest cell border so no row is cut in half.
        border = np.array([213, 219, 219])
        for y in range(y1, max(y0, y1 - 120), -1):
            line = np.abs(a[y, x0:x1] - border).sum(axis=1) < 45
            if line.mean() > 0.5:
                y1 = y + 2
                break
        return img.crop((max(0, x0 - pad), max(0, y0 - pad), x1 + pad, y1))
    return img.crop((max(0, x0 - pad), max(0, y0 - pad), x1 + pad, y1 + pad))


def f(path, size):
    return ImageFont.truetype(path, size)


def canvas(dark=False):
    return Image.new("RGB", (W, H), DARK if dark else LIGHT)


def _wrap(d, text, font, width):
    lines, line = [], ""
    for word in text.split():
        test = (line + " " + word).strip()
        if d.textlength(test, font=font) <= width or not line:
            line = test
        else:
            lines.append(line)
            line = word
    return lines + [line]


def title(img, text, sub=None, dark=False, y=130, width=2400, size=118, x=M):
    """Left-aligned title and an optional line under it. Returns the y below the text."""
    d = ImageDraw.Draw(img)
    ft = f(XB, size)
    for line in [w for part in text.split("\n") for w in _wrap(d, part, ft, width)]:
        d.text((x, y), line, font=ft, fill="#FFFFFF" if dark else TEAL_D)
        y += int(size * 1.12)
    if sub:
        fs = f(MD, 56)
        y += 18
        for line in _wrap(d, sub, fs, width):
            d.text((x, y), line, font=fs, fill=SOFT if dark else MUTED)
            y += 70
    return y


def note(img, lines, x, y, dark=False, size=50):
    """A few short lines of small print (for example the apps it works with)."""
    d = ImageDraw.Draw(img)
    for k, line in enumerate(lines):
        d.text((x, y + k * int(size * 1.3)), line, font=f(XB if k == 0 else MD, size),
               fill=(ACCENT if k == 0 else SOFT) if dark else (TEAL_D if k == 0 else MUTED))


def _fit(shot, w, h):
    """Scale the screenshot to width w and keep the top h pixels (white below if it is shorter)."""
    k = w / shot.width
    shot = shot.resize((w, max(1, int(shot.height * k))), Image.LANCZOS)
    out = Image.new("RGB", (w, h), "#FFFFFF")
    out.paste(shot.crop((0, 0, w, min(h, shot.height))), (0, 0))
    return out


def laptop(img, shot, x, y, w):
    """A plain laptop drawn at (x, y), w wide, showing the screenshot. Returns its bottom y."""
    d = ImageDraw.Draw(img)
    side, top = int(w * 0.022), int(w * 0.032)
    sw = w - 2 * side
    sh = int(sw * 9 / 16)
    h = top + sh + side
    d.rounded_rectangle((x - 3, y - 3, x + w + 3, y + h + 3), int(w * 0.02), fill="#3A4B4E")
    d.rounded_rectangle((x, y, x + w, y + h), int(w * 0.02), fill="#101719")
    img.paste(_fit(shot, sw, sh), (x + side, y + top))
    d.ellipse((x + w // 2 - 7, y + top // 2 - 7, x + w // 2 + 7, y + top // 2 + 7), fill="#2B3538")
    bw, bh = int(w * 1.1), int(w * 0.024)
    bx, by = x - (bw - w) // 2, y + h
    d.rounded_rectangle((bx, by, bx + bw, by + bh), bh // 2, fill="#CBD3D5")
    d.rectangle((bx + bh, by + bh - 8, bx + bw - bh, by + bh), fill="#9FAAAD")
    nw = int(w * 0.12)
    d.rounded_rectangle((x + w // 2 - nw // 2, by, x + w // 2 + nw // 2, by + 12), 6, fill="#A9B3B6")
    return by + bh


def sheet(img, shot, box):
    """The screenshot fitted into box, with a thin edge and a flat offset shadow."""
    x0, y0, x1, y1 = box
    k = min((x1 - x0) / shot.width, (y1 - y0) / shot.height)
    shot = shot.resize((int(shot.width * k), int(shot.height * k)), Image.LANCZOS)
    d = ImageDraw.Draw(img)
    d.rectangle((x0 + 18, y0 + 18, x0 + shot.width + 18, y0 + shot.height + 18), fill=DROP)
    d.rectangle((x0 - 3, y0 - 3, x0 + shot.width + 2, y0 + shot.height + 2), fill=EDGE)
    img.paste(shot, (x0, y0))
    return y0 + shot.height


def legend(img, items, y, x=M):
    """Colour key: (hex colour, label) pairs on one line."""
    d = ImageDraw.Draw(img)
    fl = f(MD, 54)
    for colour, label in items:
        d.rectangle((x, y, x + 64, y + 64), fill=colour, outline=EDGE, width=3)
        d.text((x + 94, y + 2), label, font=fl, fill=INK)
        x += 94 + int(d.textlength(label, font=fl)) + 90


def grid(img, cells, top, cols=2):
    """Tabs side by side: (screenshot, tab name, one line about it)."""
    d = ImageDraw.Draw(img)
    gap = 90
    cw = (W - 2 * M - gap * (cols - 1)) // cols
    ch = int(cw * (0.48 if cols == 2 else 0.56))
    rows = (len(cells) + cols - 1) // cols
    row_h = ch + 190
    for i, (shot, name, desc) in enumerate(cells):
        x, y = M + (i % cols) * (cw + gap), top + (i // cols) * row_h
        d.rectangle((x - 3, y - 3, x + cw + 2, y + ch + 2), fill=EDGE)
        img.paste(_fit(shot, cw, ch), (x, y))
        d.text((x, y + ch + 34), name, font=f(XB, 58 if cols == 2 else 50), fill=TEAL_D)
        d.text((x, y + ch + 108), desc, font=f(MD, 44 if cols == 2 else 38), fill=MUTED)
    return top + rows * row_h


def detail(path, heading, sub, shot, key=None, max_h=1250):
    """One sheet close up on the light page, with an optional colour key, centred as a block.

    A tall, narrow close-up goes on the left with the text beside it instead of above it.
    """
    img = canvas()
    d = ImageDraw.Draw(img)
    if shot.width * min((W - 2 * M) / shot.width, max_h / shot.height) < 1600:
        k = min(1450 / shot.width, (H - 260) / shot.height)
        sw, sh = int(shot.width * k), int(shot.height * k)
        sheet(img, shot, (M, (H - sh) // 2, M + sw, (H + sh) // 2))
        x = M + sw + 140
        lines = [w for part in heading.split("\n") for w in _wrap(d, part, f(XB, 104), W - x - M)]
        text_h = len(lines) * 116 + 18 + 70 * len(_wrap(d, sub or "", f(MD, 56), W - x - M)) + (110 * len(key) + 60 if key else 0)
        y = title(img, heading, sub, y=(H - text_h) // 2, width=W - x - M, size=104, x=x)
        for k2, item in enumerate(key or []):
            legend(img, [item], y + 60 + 110 * k2, x=x)
        save(img, path)
        return
    lines = [w for part in heading.split("\n") for w in _wrap(d, part, f(XB, 118), 2400)]
    subs = _wrap(d, sub, f(MD, 56), 2400) if sub else []
    th = len(lines) * int(118 * 1.12) + (18 + 70 * len(subs) if subs else 0)
    k = min((W - 2 * M) / shot.width, max_h / shot.height)
    total = th + 90 + int(shot.height * k) + (174 if key else 0)
    y = title(img, heading, sub, y=max(110, (H - total) // 2))
    bottom = sheet(img, shot, (M, y + 90, W - M, y + 90 + int(shot.height * k)))
    if key:
        legend(img, key, bottom + 110)
    save(img, path)


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, quality=90, optimize=True)
    print(os.path.basename(path))
