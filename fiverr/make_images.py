"""Gallery images for the three Fiverr gigs (1280x769, Fiverr's recommended size)."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 769
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
INK, SUB, AMBER, PANEL, LINE = (245, 247, 250), (168, 188, 201), (242, 177, 52), (24, 44, 56), (58, 86, 102)

def base():
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        for x in range(0, W, 4):
            k = (x / W) * 0.55 + (y / H) * 0.45
            c = (int(12 + 10 * k), int(24 + 26 * k), int(32 + 30 * k))
            for dx in range(4):
                px[x + dx, y] = c
    return img

def text_block(d, lines, sub, chips):
    y = 150
    for words in lines:
        x = 70
        for w, accent in words:
            f = ImageFont.truetype(BOLD, 70)
            d.text((x, y), w, font=f, fill=AMBER if accent else INK)
            x += d.textlength(w + " ", font=f)
        y += 88
    d.text((72, y + 18), sub, font=ImageFont.truetype(REG, 30), fill=SUB)
    x, y = 70, H - 120
    for chip in chips:
        f = ImageFont.truetype(BOLD, 24)
        w = d.textlength(chip, font=f)
        d.rounded_rectangle((x, y, x + w + 40, y + 52), radius=26, outline=AMBER, width=2)
        d.text((x + 20, y + 12), chip, font=f, fill=INK)
        x += w + 60

def window(d, box, title):
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, radius=18, fill=PANEL, outline=LINE, width=2)
    for i, c in enumerate([(236, 95, 88), (242, 177, 52), (98, 196, 118)]):
        d.ellipse((x0 + 20 + i * 26, y0 + 18, x0 + 36 + i * 26, y0 + 34), fill=c)
    d.text((x0 + 110, y0 + 14), title, font=ImageFont.truetype(REG, 20), fill=SUB)
    d.line((x0, y0 + 50, x1, y0 + 50), fill=LINE, width=2)

def table(d, x0, y0, cols, rows, cw, rh, header=AMBER):
    for r in range(rows + 1):
        for c in range(cols):
            fill = (40, 66, 80) if r == 0 else (30, 54, 67)
            d.rectangle((x0 + c * cw, y0 + r * rh, x0 + (c + 1) * cw - 3, y0 + (r + 1) * rh - 3), fill=fill)
            if r == 0:
                d.rectangle((x0 + c * cw + 12, y0 + 14, x0 + c * cw + cw - 30, y0 + 22), fill=header)
            else:
                d.rectangle((x0 + c * cw + 12, y0 + r * rh + 14, x0 + c * cw + 12 + (37 * (r + c)) % (cw - 40) + 20,
                             y0 + r * rh + 21), fill=(120, 150, 166))

# 1. Web scraping
img = base(); d = ImageDraw.Draw(img)
text_block(d, [[("Web", False), ("scraping", True)], [("to", False), ("clean", False), ("Excel", True)], [("or", False), ("CSV", True)]],
           "Any public website, clean and deduplicated", ["Excel · CSV · JSON", "Script option"])
window(d, (760, 120, 1210, 360), "example.com/products")
for i in range(5):
    d.rounded_rectangle((790, 190 + i * 32, 790 + 120 + (i * 53) % 240, 206 + i * 32), radius=6, fill=(70, 98, 114))
d.polygon([(960, 385), (1010, 385), (985, 425)], fill=AMBER)
table(d, 760, 440, 4, 5, 113, 44)
img.save("img/gig1-web-scraping.png")

# 2. Python automation
img = base(); d = ImageDraw.Draw(img)
text_block(d, [[("Python", True), ("scripts", False)], [("that", False), ("do", False), ("the", False)], [("boring", False), ("work", True)]],
           "Automation, file processing, APIs, bug fixes", ["Tested before delivery", "README included"])
window(d, (740, 120, 1210, 640), "automate.py")
code = [("for", "file in folder.glob('*.xlsx'):"), ("", "    data = read(file)"), ("", "    report.add(clean(data))"),
        ("", ""), ("", "report.save('summary.xlsx')"), ("", "send_email(report)  # done"), ("", ""), ("#", " 3 hours -> 30 seconds")]
f = ImageFont.truetype(MONO, 22)
for i, (kw, rest) in enumerate(code):
    y = 190 + i * 48
    x = 775
    if kw:
        d.text((x, y), kw, font=f, fill=AMBER)
        x += d.textlength(kw + " ", font=f)
    d.text((x, y), rest, font=f, fill=INK if kw != "#" else SUB)
img.save("img/gig2-python-automation.png")

# 3. Google Sheets / Excel automation
img = base(); d = ImageDraw.Draw(img)
text_block(d, [[("Sheets", True), ("&", False), ("Excel", True)], [("that", False), ("update", False)], [("themselves", False)]],
           "Formulas, Apps Script, VBA, dashboards", ["Formulas · Scripts · Macros", "Clear instructions"])
window(d, (740, 120, 1210, 640), "Monthly report")
table(d, 765, 190, 4, 4, 108, 40)
bars = [90, 140, 115, 165, 150, 180]  # tops stay below the table (y 390)
for i, h in enumerate(bars):
    x = 790 + i * 66
    d.rectangle((x, 600 - h, x + 40, 600), fill=AMBER if i == len(bars) - 1 else (98, 140, 160))
img.save("img/gig3-sheets-excel.png")
print("ok")

# 5. Bank statement PDF to Excel
img = base(); d = ImageDraw.Draw(img)
text_block(d, [[("Bank", False), ("statement", False)], [("PDF", True), ("to", False), ("Excel", True)]],
           "Sorted, clean, balance-checked", ["Excel · CSV", "Monthly summary"])
window(d, (760, 120, 960, 420), "statement.pdf")
for i in range(8):
    d.rounded_rectangle((785, 190 + i * 26, 785 + 60 + (i * 37) % 110, 202 + i * 26), radius=4, fill=(70, 98, 114))
d.polygon([(985, 250), (1025, 270), (985, 290)], fill=AMBER)
table(d, 1040, 150, 2, 7, 85, 40)
img.save("img/gig5-statement-excel.png")
print("ok5")
