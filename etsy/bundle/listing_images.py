"""Etsy photo for the bundle: both dashboards on two laptops (rendered from the workbooks)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import Renders, canvas, content, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ETSY = os.path.dirname(HERE)
tmp = os.path.join(HERE, "out")
budget = content(Renders(os.path.join(ETSY, "adhd-budget", "ADHD-Friendly-Budget.xlsx"), tmp).page("Money overview"))
subs = content(Renders(os.path.join(ETSY, "subscriptions", "Subscription-Tracker.xlsx"), tmp).page("What your subscriptions cost"))

img = canvas(dark=True)
title(img, "ADHD money kit: budget and\nsubscription tracker", "Two spreadsheets for Google Sheets and Excel, cheaper as a set",
      dark=True, width=2400)
laptop(img, budget, 150, 680, 1150)
laptop(img, subs, 1400, 680, 1150)
note(img, ["Budget", "What you can spend per day"], 150, 1480, dark=True)
note(img, ["Subscription tracker", "Free trials, renewals and what to cancel"], 1400, 1480, dark=True)
save(img, os.path.join(HERE, "images", "01-bundle.jpg"))
