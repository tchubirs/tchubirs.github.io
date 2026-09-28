"""Etsy listing images for the Subscription Tracker (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import H, W, Renders, badges, canvas, card, chips, content, headline, inside, save  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
r = Renders(os.path.join(HERE, "Subscription-Tracker.xlsx"), os.path.join(HERE, "out"))
img_dir = os.path.join(HERE, "images")

img = canvas()
headline(img, "Subscription Tracker", "See every subscription, what it costs per year, and what to cancel")
card(img, content(r.page("Where the monthly money goes")), (120, 400, W - 120, H - 190))
badges(img, ["Google Sheets", "Excel", "Instant download"], H - 150)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

img = canvas()
headline(img, "Catch free trials before they charge", "Every subscription gets a status that updates by itself")
card(img, content(r.page("Every subscription"), keep=0.30), (80, 380, W - 80, 1500))
chips(img, [("#F9C9C4", "Trial ending", "cancel or keep, now"), ("#FFE2B8", "Unused 30+ days", "still worth it?"),
            ("#D8F0DC", "Renews in X days", "no surprises")], 1600)
save(img, os.path.join(img_dir, "02-subscriptions.jpg"))

img = canvas()
headline(img, "What's inside", "3 tabs: you only type in the yellow cells")
inside(img, [
    ("Dashboard", "per month, per year, unused, to cancel"),
    ("Subscriptions", "cost, billing, next charge, status"),
    ("Start Here", "5 steps, 2 minutes to set up"),
    ("Any billing", "weekly, monthly, quarterly, yearly"),
    ("Any currency", "amounts are plain numbers"),
])
badges(img, ["Google Sheets + Excel", "No subscription", "Instant download"], H - 180)
save(img, os.path.join(img_dir, "03-whats-inside.jpg"))
