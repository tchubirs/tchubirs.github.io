"""Etsy listing photos for the ADHD-Friendly Budget (run build.py and build_fr.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
r = Renders(os.path.join(HERE, "ADHD-Friendly-Budget.xlsx"), os.path.join(HERE, "out"))
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "ADHD-friendly budget\nspreadsheet", "What you can spend per day for the rest of the month, from one simple log",
      dark=True, width=2300)
laptop(img, content(r.page("Money overview")), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-log.jpg"), "Log a purchase in one line",
       "Date, amount, type and category. The rest of the file updates by itself.",
       r.shot("Log: one line", until="Pharmacy"))

detail(os.path.join(img_dir, "03-bills.jpg"), "Bills warn you before they are due",
       "List each bill once and mark it paid each month",
       r.shot("Bills: list them once", until="Insurance"),
       [("#D8F0DC", "Paid"), ("#FFE2B8", "Due in the next 3 days"), ("#F9C9C4", "Overdue")])

detail(os.path.join(img_dir, "04-impulse.jpg"), "The 48-hour rule for impulse buys",
       "Write down what you want and decide two days later. Skipped buys add up.",
       r.shot("Impulse List", until="Board game"),
       [("#FFE2B8", "Waiting"), ("#D8F0DC", "48 hours passed"), ("#E3E8FF", "Skipped")])

img = canvas()
y = title(img, "Inside the file", "Seven tabs with a Start Here page, plus a French version. You type in the yellow cells.")
grid(img, [
    (content(r.page("Money overview")), "Dashboard", "Money in, spent, bills, per day"),
    (content(r.page("Monthly budget")), "Budget", "Your amount per category"),
    (content(r.page("Log: one line")), "Log", "One line per purchase or payday"),
    (content(r.page("Bills: list them once")), "Bills", "Due dates and paid or not"),
    (content(r.page("Impulse List")), "Impulse List", "The 48-hour rule"),
    (content(r.page("Savings goals")), "Goals", "Targets and progress bars"),
], y + 80, cols=3)
save(img, os.path.join(img_dir, "05-whats-inside.jpg"))
