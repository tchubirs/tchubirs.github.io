"""Etsy listing images for the Freelancer Tax Tracker (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import H, W, Renders, badges, canvas, card, chips, content, headline, inside, save  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
r = Renders(os.path.join(HERE, "Freelancer-Tax-Tracker.xlsx"), os.path.join(HERE, "out"))
img_dir = os.path.join(HERE, "images")

img = canvas()
headline(img, "Freelancer Income & Tax Tracker", "Know your profit, and exactly how much to put aside for tax")
card(img, content(r.page("Your freelance year")), (100, 390, W - 100, H - 180))
badges(img, ["Google Sheets", "Excel", "Instant download"], H - 150)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

img = canvas()
headline(img, "Never chase a late invoice blind", "Every invoice gets a status: paid, waiting, or overdue")
card(img, content(r.page("Income: one line"), keep=0.50), (100, 380, W - 100, 1500))
chips(img, [("#D8F0DC", "Paid", "money arrived"), ("#FFE2B8", "Waiting", "days since invoice"),
            ("#F9C9C4", "Overdue", "time to follow up")], 1600)
save(img, os.path.join(img_dir, "02-invoices.jpg"))

img = canvas()
headline(img, "What's inside", "6 tabs: you only type in the yellow cells")
inside(img, [
    ("Dashboard", "profit, tax to put aside, quarters, heads-up"),
    ("Income", "invoices, paid dates, overdue alerts"),
    ("Expenses", "categories, receipts reminder"),
    ("Tax Savings", "what you already put aside"),
    ("Settings", "year, your tax share, due days"),
    ("Start Here", "5 steps, 5 minutes"),
])
badges(img, ["Google Sheets + Excel", "No subscription", "Instant download"], H - 180)
save(img, os.path.join(img_dir, "03-whats-inside.jpg"))
