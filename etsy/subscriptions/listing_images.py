"""Etsy listing photos for the Subscription Tracker (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Subscription-Tracker.xlsx")
r = Renders(xlsx, os.path.join(HERE, "out"))
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Subscription tracker", "What each subscription costs per month and per year, and what to cancel",
      dark=True, width=2300)
laptop(img, content(r.page("What your subscriptions cost")), 600, 620, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

close = Renders(xlsx, os.path.join(HERE, "out"), hide={"Subscriptions": ["C", "E", "F", "H"]})
detail(os.path.join(img_dir, "02-subscriptions.jpg"), "Catch free trials before they charge",
       "Each subscription gets a status that updates by itself",
       close.shot("Your subscriptions", until="Game pass"),
       [("#F9C9C4", "Trial ending"), ("#FFE2B8", "Not used for a month"), ("#D8F0DC", "Renews"),
        ("#E3E8FF", "Marked to cancel")])

img = canvas()
fr = Renders(os.path.join(HERE, "Abonnements-Suivi.xlsx"), os.path.join(HERE, "out"))
y = title(img, "Inside the file", "Three tabs, for weekly, monthly, quarterly or yearly billing, in any currency.")
grid(img, [
    (content(r.page("What your subscriptions cost")), "Dashboard", "Per month, per year, unused and to cancel"),
    (content(r.page("Your subscriptions")), "Subscriptions", "Cost, billing, next charge and status"),
    (content(r.page("Start here")), "Start Here", "Five short steps to set it up"),
    (content(fr.page("Ce que coûtent")), "French version included", "Abonnements-Suivi.xlsx, with its own guide"),
], y + 80)
save(img, os.path.join(img_dir, "03-whats-inside.jpg"))
