"""Etsy listing photos for the Paycheck Budget Planner (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Paycheck-Budget-Planner.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Paycheck budget\nplanner", "Every paycheck with the bills it has to cover and what is left to spend",
      dark=True, width=2300)
laptop(img, r.shot("Paycheck budget", until="The next payday comes"), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

close = Renders(xlsx, tmp, hide_rows={"Paychecks": range(20, 59)})
detail(os.path.join(img_dir, "02-paychecks.jpg"), "Know which paychecks are tight",
       "Each bill falls on the paycheck before its due date, so you see the lean ones coming",
       close.shot("Paychecks"),
       [("#D8F0DC", "OK"), ("#FFE2B8", "Tight"), ("#F9C9C4", "Short")])

detail(os.path.join(img_dir, "03-bills.jpg"), "List each bill once",
       "The amount and the day it is due. A yearly bill gets its month.",
       r.shot("Bills", until="Renters insurance"))

img = canvas()
y = title(img, "Inside the file", "Four tabs and a Start Here page. You type in the yellow cells and the rest is calculated.")
grid(img, [
    (content(r.page("Paycheck budget")), "Dashboard", "This paycheck, its bills, what is left per day"),
    (content(r.page("Paychecks")), "Paychecks", "12 months of paydays with bills and status"),
    (content(r.page("Bills")), "Bills", "Amount, due day, autopay, category"),
    (content(r.page("Settings")), "Settings", "How often you are paid, savings, daily minimum"),
], y + 80)
save(img, os.path.join(img_dir, "04-whats-inside.jpg"))
