"""Etsy listing photos for the Landlord Rental Tracker (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Landlord-Rental-Tracker.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Landlord rental\ntracker", "Rent roll, rent owed, leases, expenses and net income for each property",
      dark=True, width=2300)
laptop(img, r.shot("Landlord dashboard", until="Net is the rent received"), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

close = Renders(xlsx, tmp, hide={"Rent roll": ["D", "N", "O", "P", "Q"]},
                hide_rows={"Rent roll": range(10, 28), "Units": range(10, 29)})
detail(os.path.join(img_dir, "02-rent-roll.jpg"), "See who has paid, month by month",
       "Each unit and month turns green, orange or red. Late means the due day and grace days have passed.",
       close.shot("Rent roll"),
       [("#D8F0DC", "Paid in full"), ("#FFE2B8", "Part paid"), ("#F9C9C4", "Late"), ("#EEF1F1", "No rent due")])

detail(os.path.join(img_dir, "03-leases.jpg"), "Know when each lease ends",
       "Each unit shows its tenant, rent, deposit and lease status",
       close.shot("Units and leases"),
       [("#D8F0DC", "Active"), ("#FFE2B8", "Ends within 60 days"), ("#E3E8FF", "Empty")])

img = canvas()
y = title(img, "Inside the file", "Six tabs and a Start Here page. You type in the yellow cells and the rest is calculated.")
grid(img, [
    (content(r.page("Landlord dashboard")), "Dashboard", "Received, owed, expenses, net, per property"),
    (content(r.page("Rent roll")), "Rent roll", "Every unit and month at one look"),
    (content(r.page("Units and leases")), "Units", "Tenants, rent, due day, leases, deposits"),
    (content(r.page("Rent received")), "Rent log", "One line per payment"),
], y + 80)
save(img, os.path.join(img_dir, "04-whats-inside.jpg"))
