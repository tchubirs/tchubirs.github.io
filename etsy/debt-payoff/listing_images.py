"""Etsy listing images for the Debt Payoff Planner (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import H, W, Renders, badges, canvas, card, chips, content, headline, inside, save  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
r = Renders(os.path.join(HERE, "Debt-Payoff-Planner.xlsx"), os.path.join(HERE, "out"))
img_dir = os.path.join(HERE, "images")

img = canvas()
headline(img, "Debt Payoff Planner", "Your debt-free date, and the one debt to focus on this month")
card(img, content(r.page("Your way out of debt")), (100, 390, W - 100, H - 180))
badges(img, ["Snowball + Avalanche", "Google Sheets", "Excel"], H - 150)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

img = canvas()
headline(img, "Snowball or Avalanche? See both", "Same debts, two plans: which one saves more, which one wins faster")
card(img, content(r.page("Your debts")), (100, 380, W - 100, 1500))
chips(img, [("#D8F0DC", "Avalanche", "highest interest first"), ("#FFF4C2", "Snowball", "smallest balance first"),
            ("#E3E8FF", "Rollover", "paid-off minimums move on")], 1600)
save(img, os.path.join(img_dir, "02-debts.jpg"))

img = canvas()
headline(img, "What's inside", "5 tabs: you only type on the Debts tab")
inside(img, [
    ("Dashboard", "debt-free date, interest, this month's focus"),
    ("Debts", "up to 10 debts, extra payment, method"),
    ("Avalanche", "month-by-month plan, up to 15 years"),
    ("Snowball", "the same plan, smallest balance first"),
    ("Start Here", "3 steps, 3 minutes to set up"),
])
badges(img, ["Google Sheets + Excel", "No subscription", "Instant download"], H - 180)
save(img, os.path.join(img_dir, "03-whats-inside.jpg"))
