"""Etsy listing photos for the Debt Payoff Planner (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
r = Renders(os.path.join(HERE, "Debt-Payoff-Planner.xlsx"), os.path.join(HERE, "out"))
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Debt payoff planner with\nSnowball and Avalanche", "Your debt-free date, and the debt to focus on this month",
      dark=True, width=2300)
laptop(img, content(r.page("Your debt payoff plan")), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-debts.jpg"), "Snowball or Avalanche: see both",
       "Type your debts once. The planner works out both methods and shows which saves more interest.",
       r.shot("Your debts"))

img = canvas()
y = title(img, "Inside the file", "You only type on the Debts tab. The plans are worked out month by month for up to 15 years.")
grid(img, [
    (content(r.page("Your debt payoff plan")), "Dashboard", "Debt-free date, interest and this month's focus"),
    (content(r.page("Your debts")), "Debts", "Up to 10 debts, the extra payment and the method"),
    (content(r.page("Avalanche: month")), "Avalanche", "Highest interest rate paid off first"),
    (content(r.page("Snowball: month")), "Snowball", "Smallest balance paid off first"),
], y + 80)
save(img, os.path.join(img_dir, "03-whats-inside.jpg"))
