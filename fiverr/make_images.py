"""Gallery images for the Fiverr gigs (1280x769): a short title next to real output.

Every picture on the right is made from real files: a scraped-data spreadsheet,
the converter's own code, an Etsy dashboard, a skill file, and a statement that
statement2excel.py really converted. Run from anywhere; needs LibreOffice.
"""
import datetime as dt
import io
import os
import random
import sys

import pymupdf
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from PIL import Image, ImageDraw, ImageFont
from pygments import highlight
from pygments.formatters import ImageFormatter
from pygments.lexers import MarkdownLexer, PythonLexer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "etsy"))
sys.path.insert(0, os.path.join(HERE, "tools"))
from listingkit import Renders, content  # noqa: E402
import statement2excel  # noqa: E402

W, H = 1280, 769
DARK, WHITE, SOFT, ACCENT, EDGE = "#173F44", "#FFFFFF", "#B8D3CF", "#F2C14E", "#0E2A2E"
FONTS = os.path.join(HERE, "..", "etsy", "fonts")
XB, MD = os.path.join(FONTS, "Archivo-ExtraBold.ttf"), os.path.join(FONTS, "Archivo-Medium.ttf")
IMG, TMP = os.path.join(HERE, "img"), os.path.join(HERE, "out")
os.makedirs(TMP, exist_ok=True)


def f(path, size):
    return ImageFont.truetype(path, size)


def page(title, sub, small, sub_width=430):
    """Dark page with the title block on the left."""
    img = Image.new("RGB", (W, H), DARK)
    d = ImageDraw.Draw(img)
    y = 84
    for line in title.split("\n"):
        d.text((60, y), line, font=f(XB, 56), fill=WHITE)
        y += 66
    y += 18
    fs = f(MD, 26)
    words, line = sub.split(), ""
    for w in words:
        if d.textlength((line + " " + w).strip(), font=fs) > sub_width:
            d.text((62, y), line, font=fs, fill=SOFT)
            y, line = y + 36, w
        else:
            line = (line + " " + w).strip()
    d.text((62, y), line, font=fs, fill=SOFT)
    d.text((62, H - 86), small, font=f(XB, 24), fill=ACCENT)
    return img


def place(img, pic, box, label=None):
    """Fit a picture into box (top-left aligned), with a dark edge and an optional small label above."""
    x0, y0, x1, y1 = box
    k = min((x1 - x0) / pic.width, (y1 - y0) / pic.height)
    pic = pic.resize((int(pic.width * k), int(pic.height * k)), Image.LANCZOS)
    d = ImageDraw.Draw(img)
    if label:
        d.text((x0, y0 - 34), label, font=f(XB, 22), fill=SOFT)
    d.rectangle((x0 - 2, y0 - 2, x0 + pic.width + 1, y0 + pic.height + 1), fill=EDGE)
    img.paste(pic, (x0, y0))
    return y0 + pic.height


def code(text, lexer, first_line=1):
    png = highlight(text, lexer, ImageFormatter(font_name="DejaVu Sans Mono", font_size=24, line_numbers=True,
                                                line_number_start=first_line, style="default",
                                                line_number_bg="#F1F4F4", line_number_fg="#8A9A9E",
                                                image_pad=18, line_pad=6))
    return Image.open(io.BytesIO(png)).convert("RGB")


def xlsx_shot(path, title_start, keep=1.0):
    return content(Renders(path, TMP).page(title_start), keep)


# 1. Web scraping: what a delivered file looks like
rows = [("Stoneware mug, 350 ml", 12.90, 4.7, 212, "Yes"), ("Linen napkins, set of 4", 18.50, 4.5, 96, "Yes"),
        ("Oak cutting board", 34.00, 4.8, 341, "No"), ("Glass carafe, 1 l", 21.90, 4.4, 58, "Yes"),
        ("Enamel pot, 3 l", 49.00, 4.6, 177, "Yes"), ("Bamboo utensil set", 15.40, 4.2, 83, "Yes"),
        ("Cast iron pan, 26 cm", 39.90, 4.9, 502, "Yes"), ("Striped tea towel", 7.50, 4.3, 64, "No"),
        ("Ceramic bowl, 15 cm", 9.90, 4.6, 145, "Yes"), ("Salt and pepper mill", 24.00, 4.1, 39, "Yes"),
        ("Knife block, 5 pieces", 79.00, 4.7, 268, "Yes"), ("Steel measuring cups", 13.20, 4.5, 121, "Yes")]
wb = Workbook()
ws = wb.active
ws.title = "Products"
line = Side(style="thin", color="C9D1D1")
for c, (head, width) in enumerate([("Product", 26), ("Price", 9), ("Rating", 8), ("Reviews", 9), ("In stock", 9),
                                   ("Link", 30)], start=1):
    cell = ws.cell(1, c, head)
    cell.font = Font(name="Arial", bold=True)
    cell.fill = PatternFill("solid", start_color="E4EAEA")
    ws.column_dimensions[chr(64 + c)].width = width
for r, row in enumerate(rows, start=2):
    for c, v in enumerate(list(row) + [f"https://example.com/p/{1040 + r}"], start=1):
        cell = ws.cell(r, c, v)
        cell.font = Font(name="Arial")
        if c == 2:
            cell.number_format = "0.00"
        if c in (3, 4, 5):
            cell.alignment = Alignment(horizontal="center")
for r in range(1, len(rows) + 2):
    for c in range(1, 7):
        ws.cell(r, c).border = Border(left=line, right=line, top=line, bottom=line)
ws.auto_filter.ref = f"A1:F{len(rows) + 1}"
ws.page_setup.orientation = "landscape"
ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
ws.sheet_properties.pageSetUpPr.fitToPage = True
scraped = os.path.join(TMP, "products-example.xlsx")
wb.save(scraped)
img = page("Web scraping\nto Excel or CSV", "Data from public websites, one row per item, with duplicates removed.",
           "Excel, CSV or JSON", sub_width=1100)
place(img, xlsx_shot(scraped, "Product"), (60, 340, 1220, 660), "products-example.xlsx")
img.save(os.path.join(IMG, "gig1-web-scraping.png"))

# 2. Python: a real function from the statement converter
src = open(os.path.join(HERE, "tools", "statement2excel.py"), encoding="utf-8").read().splitlines()
start = next(i for i, s in enumerate(src) if s.startswith("def guess_order"))
img = page("Python scripts\nand bug fixes", "Scripts that rename files, merge reports or call an API. "
           "I also fix scripts that stopped working.", "Tested before delivery", sub_width=1100)
place(img, code("\n".join(src[start:start + 9]), PythonLexer(), start + 1), (60, 340, 1220, 650), "statement2excel.py")
img.save(os.path.join(IMG, "gig2-python-automation.png"))

# 3. Sheets and Excel: one of our own dashboards
dash = xlsx_shot(os.path.join(HERE, "..", "etsy", "inventory", "Inventory-Sales-Tracker.xlsx"), "Shop dashboard")
img = page("Google Sheets\nand Excel work", "Formulas, dashboards, Apps Script and VBA for the reports you "
           "build by hand every week.", "Formulas, scripts, macros")
place(img, dash, (560, 110, 1230, 700), "Inventory-Sales-Tracker.xlsx")
img.save(os.path.join(IMG, "gig3-sheets-excel.png"))

# 4. Claude skill: an example skill file
skill = """---
name: weekly-sales-report
description: Turns the weekly sales export (CSV) into a
  one-page summary with totals by product and a
  comparison with last week.
---

# Weekly sales report

1. Read the CSV the user attaches. Columns: date,
   product, quantity, price.
2. Add up revenue and units per product for the week.
3. If the user gives last week's file, compare them.
4. Write the summary as a table, then short notes
   on what changed.

Before answering, check that the totals match the
sum of the rows."""
img = page("Custom\nClaude skills", "An instruction file Claude reads when the task comes up, "
           "tested on your own examples.", "Setup guide included")
place(img, code(skill, MarkdownLexer()), (560, 110, 1230, 700), "weekly-sales-report/SKILL.md")
img.save(os.path.join(IMG, "gig4-claude-skill.png"))

# 5. Bank statement: a statement drawn here, then converted by statement2excel.py
rnd = random.Random(5)
shops = ["GROCERY STORE", "TRAIN TICKETS", "ONLINE ORDER", "PHARMACY", "PAYROLL ACME INC", "RENT PAYMENT",
         "BAKERY", "MOBILE PLAN", "TRANSFER TO SAVINGS", "FOOD DELIVERY"]
doc, bal, day = pymupdf.open(), 1850.00, dt.date(2026, 8, 1)
pg = doc.new_page()
pg.insert_text((50, 40), "ACCOUNT STATEMENT", fontsize=12)
pg.insert_text((50, 60), "August 2026", fontsize=8)
pg.insert_text((50, 90), "Date        Description                                   Amount       Balance", fontsize=8)
y = 110
for i in range(22):
    day += dt.timedelta(days=rnd.randint(0, 2))
    shop = rnd.choice(shops)
    amount = round(rnd.uniform(2100, 2400), 2) if shop.startswith("PAYROLL") else -round(rnd.uniform(3, 180), 2)
    bal = round(bal + amount, 2)
    pg.insert_text((50, y), day.strftime("%m/%d/%Y"), fontsize=9)
    pg.insert_text((115, y), shop, fontsize=9)
    pg.insert_text((400, y), f"{amount:,.2f}", fontsize=9)
    pg.insert_text((480, y), f"{bal:,.2f}", fontsize=9)
    y += 14
pdf, out = os.path.join(TMP, "statement-example.pdf"), os.path.join(TMP, "statement-example.xlsx")
doc.save(pdf)
statement2excel.main([pdf, "-o", out])
pix = pymupdf.open(pdf)[0].get_pixmap(dpi=150, clip=pymupdf.Rect(40, 25, 540, 110 + 14 * 13 + 4))
before = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
img = page("Bank statement\nPDF to Excel", "Every transaction on its own row, and the running balance "
           "checked line by line.", "Excel or CSV, with a monthly summary", sub_width=1100)
place(img, before, (60, 340, 470, 660), "statement.pdf")
from openpyxl import load_workbook  # noqa: E402
twelfth = load_workbook(out)["Transactions"].cell(13, 5).value
after = Renders(out, TMP).shot("Date", until=f"{twelfth:,.2f}")
place(img, after, (530, 340, 1220, 660), "statement.xlsx")
img.save(os.path.join(IMG, "gig5-statement-excel.png"))
print("ok")
