"""Etsy image for the bundle: both dashboards side by side (rendered from the workbooks)."""
import os, sys
from PIL import ImageDraw
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import AMBER, H, TEAL_D, W, XB, Renders, badges, canvas, card, chips, content, f, headline, save  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ETSY = os.path.dirname(HERE)
tmp = os.path.join(HERE, "out")
shots = [content(Renders(os.path.join(ETSY, "adhd-budget", "ADHD-Friendly-Budget.xlsx"), tmp).page("Money at a glance")),
         content(Renders(os.path.join(ETSY, "subscriptions", "Subscription-Tracker.xlsx"), tmp).page("Where the monthly"))]
img = canvas()
headline(img, "ADHD Money Kit: 2 spreadsheets", "Budget + Subscription Tracker · save 15% vs buying separately")
for k, shot in enumerate(shots):
    x0 = 40 + k * 1320
    card(img, shot, (x0, 560, x0 + 1300, 1420))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((x0 + 60, 470, x0 + 660, 570), 50, fill=AMBER)
    d.text((x0 + 100, 486), ["1 · Budget", "2 · Subscriptions"][k], font=f(XB, 56), fill=TEAL_D)
chips(img, [("#FFF4C2", "Safe to spend", "per day, at a glance"), ("#F9C9C4", "Free trials", "caught before they charge"),
            ("#D8F0DC", "Bills", "warned before they're due")], 1470)
badges(img, ["Google Sheets + Excel", "Instant download", "2 guides included"], H - 170)
save(img, os.path.join(HERE, "images", "01-bundle.jpg"))
