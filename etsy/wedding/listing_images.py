"""Etsy listing photos for the Wedding Budget Planner (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Wedding-Budget-Planner.xlsx")
r = Renders(xlsx, os.path.join(HERE, "out"))
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Wedding budget planner\nwith vendor payments", "Budget, vendors, payments and guests in one spreadsheet",
      dark=True, width=2300)
laptop(img, content(r.page("Wedding dashboard")), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

close = Renders(xlsx, os.path.join(HERE, "out"), hide={"Vendors": ["C"]})
detail(os.path.join(img_dir, "02-vendors.jpg"), "Know which vendor to pay next",
       "Each vendor shows what is paid, what is left and when it is due",
       close.shot("Vendors & payments", until="Paper & Ink"),
       [("#D8F0DC", "Paid in full"), ("#FFE2B8", "Due in the next 14 days"), ("#F9C9C4", "Overdue")])

img = canvas()
y = title(img, "Inside the file", "Five tabs. You type in the yellow cells and the rest is calculated.")
grid(img, [
    (content(r.page("Wedding dashboard")), "Dashboard", "Countdown, booked, paid and still to pay"),
    (content(r.page("Budget")), "Budget", "Your total split into 11 categories"),
    (content(r.page("Vendors & payments")), "Vendors", "Quotes, deposits, due dates and status"),
    (content(r.page("Guest list")), "Guests", "RSVP, plus ones, meals and tables"),
], y + 80)
save(img, os.path.join(img_dir, "03-whats-inside.jpg"))
