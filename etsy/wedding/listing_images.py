"""Etsy listing images for the Wedding Budget Planner (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import H, W, Renders, badges, canvas, card, chips, content, headline, inside, save  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
r = Renders(os.path.join(HERE, "Wedding-Budget-Planner.xlsx"), os.path.join(HERE, "out"))
img_dir = os.path.join(HERE, "images")

img = canvas()
headline(img, "Wedding Budget Planner", "Budget, vendors, payments and guests, in one calm dashboard")
card(img, content(r.page("Our wedding at a glance")), (100, 390, W - 100, H - 180))
badges(img, ["Google Sheets", "Excel", "Instant download"], H - 150)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

img = canvas()
headline(img, "Never miss a vendor payment", "Each vendor shows what is paid, what is left and when it is due")
card(img, content(r.page("Vendors & payments"), keep=0.30), (100, 380, W - 100, 1500))
chips(img, [("#D8F0DC", "Paid in full", "nothing left to do"), ("#FFE2B8", "Due soon", "within 14 days"),
            ("#F9C9C4", "Overdue", "call the vendor")], 1600)
save(img, os.path.join(img_dir, "02-vendors.jpg"))

img = canvas()
headline(img, "What's inside", "5 tabs: you only type in the yellow cells")
inside(img, [
    ("Dashboard", "countdown, committed, paid, still to pay"),
    ("Budget", "your total, split into 11 categories"),
    ("Vendors", "quotes, deposits, due dates, status"),
    ("Guests", "RSVP, plus ones, meals, tables"),
    ("Start Here", "5 steps, 10 minutes"),
])
badges(img, ["Google Sheets + Excel", "No subscription", "Instant download"], H - 180)
save(img, os.path.join(img_dir, "03-whats-inside.jpg"))
