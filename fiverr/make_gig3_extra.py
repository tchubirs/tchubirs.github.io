"""Two more gallery images for the Sheets and Excel gig, made from our own tested spreadsheets."""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "etsy"))
from listingkit import Renders, content  # noqa: E402

W, H = 1280, 769
DARK, WHITE, SOFT, ACCENT, EDGE = "#173F44", "#FFFFFF", "#B8D3CF", "#F2C14E", "#0E2A2E"
FONTS = os.path.join(HERE, "..", "etsy", "fonts")
XB, MD = os.path.join(FONTS, "Archivo-ExtraBold.ttf"), os.path.join(FONTS, "Archivo-Medium.ttf")
IMG, TMP = os.path.join(HERE, "img"), os.path.join(HERE, "out")
ETSY = os.path.join(HERE, "..", "etsy")
os.makedirs(TMP, exist_ok=True)
f = ImageFont.truetype


def page(title, sub, small, sub_width=1100):
    img = Image.new("RGB", (W, H), DARK)
    d = ImageDraw.Draw(img)
    y = 60
    for line in title.split("\n"):
        d.text((60, y), line, font=f(XB, 52), fill=WHITE)
        y += 60
    fs = f(MD, 25)
    words, line = sub.split(), ""
    y += 12
    for w in words:
        if d.textlength((line + " " + w).strip(), font=fs) > sub_width:
            d.text((62, y), line, font=fs, fill=SOFT)
            y, line = y + 34, w
        else:
            line = (line + " " + w).strip()
    d.text((62, y), line, font=fs, fill=SOFT)
    d.text((62, H - 70), small, font=f(XB, 24), fill=ACCENT)
    return img


def place(img, pic, box, label=None):
    x0, y0, x1, y1 = box
    k = min((x1 - x0) / pic.width, (y1 - y0) / pic.height)
    pic = pic.resize((int(pic.width * k), int(pic.height * k)), Image.LANCZOS)
    d = ImageDraw.Draw(img)
    if label:
        d.text((x0, y0 - 30), label, font=f(XB, 19), fill=SOFT)
    d.rectangle((x0 - 2, y0 - 2, x0 + pic.width + 1, y0 + pic.height + 1), fill=EDGE)
    img.paste(pic, (x0, y0))


def pages(xlsx, one_page):
    r = Renders(xlsx, TMP, one_page=one_page)
    return r, [content(Image.frombytes("RGB", (p.width, p.height), p.samples))
               for p in (r.doc[i].get_pixmap(dpi=150) for i in range(len(r.doc)))]


# Reports: a client's progress report and a donor's statement, both filled in by formulas.
tr, tr_pages = pages(os.path.join(ETSY, "trainer", "Personal-Trainer-Client-Tracker.xlsx"), ("Dashboard", "Report"))
report = tr_pages[[i for i, t in enumerate(tr.titles) if t == "Northside Strength"][-1]]
dn, dn_pages = pages(os.path.join(ETSY, "donations", "Donation-Volunteer-Tracker.xlsx"), ("Dashboard", "Statement"))
statement = dn_pages[dn.titles.index("Riverton Community Pantry")]
img = page("Reports to print or send", "One page for a client, a donor or a month. Pick a name and the page fills "
           "itself from your data.", "Print it or save it as a PDF")
place(img, report, (60, 250, 620, 690), "Client progress report")
place(img, statement, (660, 250, 1220, 690), "Donor statement")
img.save(os.path.join(IMG, "gig3-reports.png"))

# Dashboards: four of our own, each checked against test data line by line.
shots = []
for folder, name, title in (("envelopes", "Cash-Envelope-Budget.xlsx", "Cash envelopes"),
                            ("garden", "Vegetable-Garden-Planner.xlsx", "Back garden"),
                            ("trainer", "Personal-Trainer-Client-Tracker.xlsx", "Northside Strength"),
                            ("donations", "Donation-Volunteer-Tracker.xlsx", "Giving and volunteering")):
    r = Renders(os.path.join(ETSY, folder, name), TMP, one_page=("Dashboard",))
    shots.append((content(r.page(title), keep=0.62), name))
img = page("A dashboard for what you track", "Budgets, clients, gardens or donations: the totals, the lists and "
           "the charts update as you type.", "Every formula checked with test data")
for k, (shot, name) in enumerate(shots):
    x0 = 60 + (k % 2) * 590
    y0 = 225 + (k // 2) * 255
    place(img, shot, (x0, y0, x0 + 560, y0 + 205), name)
img.save(os.path.join(IMG, "gig3-dashboards.png"))
print("ok")
