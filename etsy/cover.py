"""Cover photo for each listing: the first photo buyers see in Etsy search.

A big title, what it works with and how many tabs, the dashboard on a laptop and a
close-up of a second tab on a tablet. The screens are cut out of the listing's own
photos 01 and 02, so the cover shows the same file the other photos show.

    python3 etsy/cover.py [folder ...]     writes <folder>/images/00-cover.jpg
"""
import ast, json, os, sys
import numpy as np
import scipy.ndimage as nd
from openpyxl import load_workbook
from PIL import Image, ImageDraw, ImageFilter

import listingkit as K
import publish as P

W, H = K.W, K.H
# Background and accent for each Etsy category the listings sit in.
LOOK = {
    12487: ("#E1F0EA", "#15525A"),  # personal finance
    12478: ("#E0EAF4", "#1F4E79"),  # bookkeeping
    12476: ("#F4E8D8", "#7A4A1E"),  # planners
    12479: ("#EAE4F4", "#5B3F86"),  # chore charts
}
INK = "#16262B"
HEAD = {"bundle": "Budget and subscription tracker bundle"}


def tagline(folder):
    """The line under the title on the listing's photo 1 (the first title() call on the dark page)."""
    path = P.HERE / folder / "listing_images.py"
    if not path.exists():
        return None
    for node in ast.walk(ast.parse(path.read_text())):
        if (isinstance(node, ast.Call) and getattr(node.func, "id", "") == "title" and len(node.args) >= 3
                and any(k.arg == "dark" for k in node.keywords)):
            try:
                return ast.literal_eval(node.args[2])
            except ValueError:
                return None
    return None


def screen(photo, dark):
    """The white sheet inside one of the listing photos: the largest white area, cut to its box."""
    img = Image.open(photo).convert("RGB")
    a = np.asarray(img).astype(int)
    white = a.min(axis=2) >= (245 if dark else 252)
    lab, n = nd.label(white)
    if not n:
        return img
    sizes = nd.sum(white, lab, range(1, n + 1))
    ys, xs = np.where(lab == 1 + int(np.argmax(sizes)))
    return img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def trim(shot):
    """Drop the empty white margin at the bottom and right of a screen."""
    a = np.asarray(shot).astype(int)
    ink = a.min(axis=2) < 235
    rows, cols = np.where(ink.any(axis=1))[0], np.where(ink.any(axis=0))[0]
    if not len(rows):
        return shot
    return shot.crop((0, 0, min(shot.width, cols.max() + 30), min(shot.height, rows.max() + 30)))


def tabs(li):
    """Visible tabs in the main workbook, and whether a second language comes with it."""
    books = [path for path, name in li["files"] if name.endswith(".xlsx")]
    wb = load_workbook(books[0], read_only=True)
    shown = sum(1 for ws in wb.worksheets if ws.sheet_state == "visible")
    wb.close()
    return shown, len(books) > 1


def widescreen(shot, ratio=9 / 16):
    """Cut a wide sheet from the right so it fills a 16:9 screen instead of leaving white below it."""
    if shot.height / shot.width < ratio:
        return shot.crop((0, 0, int(shot.height / ratio), shot.height))
    return shot


def shadow(img, box, radius, blur=38, offset=(0, 26), alpha=70):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    x0, y0, x1, y1 = box
    ImageDraw.Draw(layer).rounded_rectangle((x0 + offset[0], y0 + offset[1], x1 + offset[0], y1 + offset[1]),
                                            radius, fill=(10, 30, 35, alpha))
    img.paste(Image.alpha_composite(img.convert("RGBA"), layer.filter(ImageFilter.GaussianBlur(blur))).convert("RGB"))


def tablet(img, shot, x, y, w):
    """A plain tablet on its side at (x, y), w wide, showing the left part of the sheet up close."""
    h = int(w * 0.72)
    r, bezel = int(w * 0.06), int(w * 0.04)
    shadow(img, (x, y, x + w, y + h), r)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((x, y, x + w, y + h), r, fill="#101719")
    sw, sh = w - 2 * bezel, h - 2 * bezel
    cut = min(shot.width, max(int(shot.height * sw / sh), int(shot.width * 0.55)))
    # A short table is shown closer, so it fills most of the screen (but never less than 30% of its width).
    cut = max(int(shot.width * 0.3), min(cut, int(shot.height * sw / (0.7 * sh))))
    view = shot.crop((0, 0, cut, shot.height))
    view = view.resize((sw, max(1, int(view.height * sw / cut))), Image.LANCZOS)
    view = view.crop((0, 0, sw, min(sh, view.height)))
    face = Image.new("RGB", (sw, sh), "#FFFFFF")
    face.paste(view, (0, 0))
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw, sh), max(4, r - bezel), fill=255)
    img.paste(face, (x + bezel, y + bezel), mask)
    d.ellipse((x + bezel // 2 - 6, y + h // 2 - 6, x + bezel // 2 + 6, y + h // 2 + 6), fill="#2B3538")


def pill(d, text, x, y, fill, ink, size=58):
    ft = K.f(K.XB, size)
    tw = d.textlength(text, font=ft)
    h = int(size * 1.9)
    d.rounded_rectangle((x, y, x + tw + 2 * int(size * 0.8), y + h), h // 2, fill=fill)
    d.text((x + int(size * 0.8), y + (h - size) // 2 - int(size * 0.12)), text, font=ft, fill=ink)
    return y + h


def headline(d, text, width, sizes=range(210, 120, -6)):
    """Largest size at which the title fits in two lines."""
    text = " ".join(text.split())
    for size in sizes:
        lines = K._wrap(d, text, K.f(K.XB, size), width)
        if len(lines) <= 2:
            return size, lines
    return size, lines


def cover(li, look):
    photos = sorted(p for p in li["photos"] if not p.name.startswith("00-"))
    if li["folder"] == "bundle":  # the two spreadsheets of the set, one on each screen
        main = trim(screen(P.HERE / "adhd-budget" / "images" / "01-dashboard.jpg", dark=True))
        close = trim(screen(P.HERE / "subscriptions" / "images" / "01-dashboard.jpg", dark=True))
    else:
        main = trim(screen(photos[0], dark=True))
        shots = [trim(screen(p, dark=False)) for p in photos[1:4] if "whats-inside" not in p.name]
        close = max(shots, key=lambda s: min(s.height / (s.width * 0.55), 0.72))
    n_tabs, bilingual = tabs(li)
    bg, accent = look
    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)

    text, sub = HEAD.get(li["folder"], li["name"]), tagline(li["folder"])
    size, lines = headline(d, text, W - 2 * K.M)
    y = 120
    for line in lines:
        d.text((K.M, y), line, font=K.f(K.XB, size), fill=INK)
        y += int(size * 1.08)
    if sub:
        for line in K._wrap(d, sub, K.f(K.MD, 60), W - 2 * K.M)[:2]:
            d.text((K.M, y + 16), line, font=K.f(K.MD, 60), fill="#4A5A5F")
            y += 76
    top = y + 90

    # Laptop on the right, the tablet over its lower right corner, the facts on the left.
    lw = 1780
    lx = W - K.M - lw + 40
    group = 560 + int(820 * 0.72)  # laptop, and the tablet hanging under it
    top = max(top, top + (H - 80 - top - group) // 2)
    shadow(img, (lx, top, lx + lw, top + int(lw * 0.6)), 40)
    K.laptop(img, widescreen(main), lx, top, lw)
    tablet(img, close, W - 900, top + 560, 820)

    facts = ["Google Sheets", "Microsoft Excel", f"{n_tabs} tabs", "Instant download"]
    if li["folder"] == "bundle":
        facts[2] = "2 spreadsheets"
    elif bilingual:
        facts[3] = "English and French"
    fy = top + 40
    d = ImageDraw.Draw(img)
    for k, fact in enumerate(facts):
        fy = pill(d, fact, K.M, fy, accent if k == 0 else "#FFFFFF", "#FFFFFF" if k == 0 else accent) + 34
    return img


def main(folders):
    cats = json.loads(P.CATS.read_text())
    for li in P.listings():
        if folders and li["folder"] not in folders:
            continue
        img = cover(li, LOOK[cats[li["folder"]]])
        K.save(img, str(P.HERE / li["folder"] / "images" / "00-cover.jpg"))


if __name__ == "__main__":
    main(sys.argv[1:])
