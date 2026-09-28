"""Etsy listing photos for the Freelancer Income & Tax Tracker (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
r = Renders(os.path.join(HERE, "Freelancer-Tax-Tracker.xlsx"), os.path.join(HERE, "out"))
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Freelancer income and\ntax tracker", "Your profit, and how much of it to put aside for tax",
      dark=True, width=2300)
laptop(img, content(r.page("Freelance dashboard")), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-invoices.jpg"), "Know which invoices are late",
       "Every invoice shows whether it is paid, still waiting or overdue",
       r.shot("Income: one line", until="2026-019"),
       [("#D8F0DC", "Paid"), ("#FFE2B8", "Waiting"), ("#F9C9C4", "Overdue")])

img = canvas()
y = title(img, "Inside the file", "Six tabs, with Settings and a Start Here page. You type in the yellow cells.")
grid(img, [
    (content(r.page("Freelance dashboard")), "Dashboard", "Profit, tax to put aside, quarters, heads-up"),
    (content(r.page("Income: one line")), "Income", "Invoices, paid dates and late payments"),
    (content(r.page("Expenses: one line")), "Expenses", "Categories and a receipt check"),
    (content(r.page("Money put aside")), "Tax Savings", "What you have already set aside"),
], y + 80)
save(img, os.path.join(img_dir, "03-whats-inside.jpg"))
