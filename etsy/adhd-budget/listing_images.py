"""Etsy listing images (2700x2025, 4:3) built from real renders of the workbook.

Needs LibreOffice (headless) and PyMuPDF. Run after build.py.
"""
import os, subprocess
import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "images")
TMP = os.path.join(HERE, "out")
W, H = 2700, 2025
BG, CARD, TEAL, TEAL_D, INK, MUTED, AMBER = "#EAF1EF", "#FFFFFF", "#1F6F78", "#15525A", "#1E2A2F", "#5E6E72", "#E0A21B"
XB = os.path.join(HERE, "fonts", "Nunito-ExtraBold.ttf")
MD = os.path.join(HERE, "fonts", "Nunito-Medium.ttf")
PAPER = np.array([246, 244, 239])

os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)
env = dict(os.environ, HOME="/tmp/lohome")
subprocess.run(["soffice", "--headless", "--norestore", "--convert-to", "pdf", "--outdir", TMP,
                os.path.join(HERE, "ADHD-Friendly-Budget.xlsx")], env=env, check=True, capture_output=True)
doc = pymupdf.open(os.path.join(TMP, "ADHD-Friendly-Budget.pdf"))
titles = [p.get_text().split("\n")[0] for p in doc]

def page(title_start):
    i = next(k for k, t in enumerate(titles) if t.startswith(title_start))
    pix = doc[i].get_pixmap(dpi=220)
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

def save(img, name):
    img.save(os.path.join(OUT, name), quality=90, optimize=True)
    print(name)

# 1. Hero: the dashboard.
img = canvas()
headline(img, "ADHD-Friendly Budget Spreadsheet", "Know what you can safely spend today, at a glance")
card(img, content(page("Money at a glance")), (120, 400, W - 120, H - 190))
badges(img, ["Google Sheets", "Excel", "Instant download"], H - 150)
save(img, "01-dashboard.jpg")

# 2. Log.
img = canvas()
headline(img, "Log a purchase in 5 seconds", "One line: date, amount, category. The rest updates itself.")
card(img, content(page("Log:"), keep=0.395), (160, 380, W - 160, 1500))
save_log = img

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

chips(save_log, [("#FFF4C2", "Type", "Expense or Income"), ("#FFF4C2", "Category", "from your budget list"),
                 ("#FFF4C2", "Note", "optional, for you")], 1600)
save(save_log, "02-log.jpg")

# 3. Bills.
img = canvas()
headline(img, "Bills warn you before they're due", "List each bill once. Tick 'Paid' each month.")
card(img, content(page("Bills:"), keep=0.40), (160, 380, W - 160, 1500))
chips(img, [("#D8F0DC", "Paid", "ticked this month"), ("#FFE2B8", "Due soon", "within 3 days"),
            ("#F9C9C4", "Overdue", "due date passed")], 1600)
save(img, "03-bills.jpg")

# 4. Impulse list.
img = canvas()
headline(img, "The 48-hour rule for impulse buys", "Park it, wait two days, then decide with a clear head.")
card(img, content(page("Impulse List"), keep=0.36), (120, 380, W - 120, 1500))
chips(img, [("#FFE2B8", "Wait", "the countdown shows"), ("#D8F0DC", "48h passed", "still want it? fine"),
            ("#E3E8FF", "Skipped", "adds to money kept")], 1600)
save(img, "04-impulse.jpg")

# 5. What's inside.
img = canvas()
headline(img, "What's inside", "7 tabs, colour-coded: you only type in the yellow cells")
d = ImageDraw.Draw(img)
rows = [
    ("Dashboard", "money in, spent, bills due, safe-to-spend per day"),
    ("Budget", "your monthly amount per category"),
    ("Log", "one line per purchase or payday"),
    ("Bills", "due-date warnings, paid tick box"),
    ("Impulse List", "48-hour cooling-off with a verdict"),
    ("Goals", "savings targets with progress bars"),
    ("Start Here", "3 steps, 5 minutes to set up"),
]
y = 470
for name, desc in rows:
    d.rounded_rectangle((330, y, 2370, y + 150), 30, fill=CARD)
    d.ellipse((380, y + 45, 440, y + 105), fill=AMBER)
    d.text((490, y + 36), name, font=f(XB, 64), fill=TEAL_D)
    d.text((1120, y + 48), desc, font=f(MD, 50), fill=INK)
    y += 180
badges(img, ["Google Sheets + Excel", "No subscription", "Instant download"], H - 180)
save(img, "05-whats-inside.jpg")
