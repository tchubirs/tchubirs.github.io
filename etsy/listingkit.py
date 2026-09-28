"""Shared pieces for Etsy listing images: render a workbook, crop sheets, compose 4:3 images."""
import os, subprocess
import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
W, H = 2700, 2025
BG, CARD, TEAL, TEAL_D, INK, MUTED, AMBER = "#EAF1EF", "#FFFFFF", "#1F6F78", "#15525A", "#1E2A2F", "#5E6E72", "#E0A21B"
XB = os.path.join(ROOT, "adhd-budget", "fonts", "Nunito-ExtraBold.ttf")
MD = os.path.join(ROOT, "adhd-budget", "fonts", "Nunito-Medium.ttf")


class Renders:
    """PDF render of a workbook; page(title) returns the sheet whose title starts with it."""

    def __init__(self, xlsx, tmp):
        os.makedirs(tmp, exist_ok=True)
        env = dict(os.environ, HOME="/tmp/lohome")
        subprocess.run(["soffice", "--headless", "--norestore", "--convert-to", "pdf", "--outdir", tmp, xlsx],
                       env=env, check=True, capture_output=True)
        self.doc = pymupdf.open(os.path.join(tmp, os.path.splitext(os.path.basename(xlsx))[0] + ".pdf"))
        self.titles = [p.get_text().split("\n")[0] for p in self.doc]

    def page(self, title_start):
        i = next(k for k, t in enumerate(self.titles) if t.startswith(title_start))
        pix = self.doc[i].get_pixmap(dpi=220)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

def content(img, keep=1.0, pad=36):
    """Crop to the sheet's content (anything that is not paper or page white)."""
    a = np.asarray(img).astype(int)
    light = a.min(axis=2) >= 232  # paper, page white and anti-aliased edges
    ys, xs = np.where(~light)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    if keep < 1:
        y1 = y0 + int((y1 - y0) * keep)
        # Snap up to the nearest cell border so no row is cut in half.
        border = np.array([217, 212, 199])
        for y in range(y1, max(y0, y1 - 120), -1):
            line = np.abs(a[y, x0:x1] - border).sum(axis=1) < 45
            if line.mean() > 0.5:
                y1 = y + 2
                break
        return img.crop((max(0, x0 - pad), max(0, y0 - pad), x1 + pad, y1))
    return img.crop((max(0, x0 - pad), max(0, y0 - pad), x1 + pad, y1 + pad))

def f(path, size):
    return ImageFont.truetype(path, size)

def canvas():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for i in range(0, W, 90):  # faint diagonal texture
        d.line([(i, 0), (i - 600, H)], fill="#E3ECEA", width=3)
    return img

def card(img, shot, box, radius=36):
    """Paste a screenshot into a white rounded card with a soft shadow, fitted to box."""
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0 - 80, y1 - y0 - 80
    k = min(bw / shot.width, bh / shot.height)
    shot = shot.resize((int(shot.width * k), int(shot.height * k)), Image.LANCZOS)
    cw, ch = shot.width + 80, shot.height + 80
    cx, cy = x0 + (x1 - x0 - cw) // 2, y0 + (y1 - y0 - ch) // 2
    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).rounded_rectangle((cx + 10, cy + 24, cx + cw + 10, cy + ch + 24), radius, fill=90)
    img.paste(Image.new("RGB", (W, H), "#9DB3AF"), (0, 0), shadow.filter(ImageFilter.GaussianBlur(28)))
    ImageDraw.Draw(img).rounded_rectangle((cx, cy, cx + cw, cy + ch), radius, fill=CARD)
    img.paste(shot, (cx + 40, cy + 40))

def headline(img, title, sub, y=120):
    d = ImageDraw.Draw(img)
    ft = f(XB, 118)
    tw = d.textlength(title, font=ft)
    d.text(((W - tw) / 2, y), title, font=ft, fill=TEAL_D)
    fs = f(MD, 58)
    sw = d.textlength(sub, font=fs)
    d.text(((W - sw) / 2, y + 160), sub, font=fs, fill=MUTED)

def badges(img, labels, y):
    d = ImageDraw.Draw(img)
    fb = f(XB, 46)
    widths = [d.textlength(t, font=fb) + 100 for t in labels]
    x = (W - sum(widths) - 40 * (len(labels) - 1)) / 2
    for t, w in zip(labels, widths):
        d.rounded_rectangle((x, y, x + w, y + 96), 48, fill=TEAL)
        d.text((x + 50, y + 18), t, font=fb, fill="#FFFFFF")
        x += w + 40

def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, quality=90, optimize=True)
    print(os.path.basename(path))


def chips(img, items, y):
    """Big explanatory chips: (colour, title, text)."""
    d = ImageDraw.Draw(img)
    n = len(items)
    w = (W - 240 - 60 * (n - 1)) // n
    for i, (colour, title, text) in enumerate(items):
        x = 120 + i * (w + 60)
        d.rounded_rectangle((x, y, x + w, y + 300), 40, fill=colour)
        d.text((x + 50, y + 50), title, font=f(XB, 70), fill=INK)
        d.text((x + 50, y + 160), text, font=f(MD, 48), fill=INK)


def inside(img, rows, y=470):
    """A 'what's inside' list: (name, description) rows as white pills."""
    d = ImageDraw.Draw(img)
    for name, desc in rows:
        d.rounded_rectangle((330, y, 2370, y + 150), 30, fill=CARD)
        d.ellipse((380, y + 45, 440, y + 105), fill=AMBER)
        d.text((490, y + 36), name, font=f(XB, 64), fill=TEAL_D)
        d.text((1120, y + 48), desc, font=f(MD, 50), fill=INK)
        y += 180
