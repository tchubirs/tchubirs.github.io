"""Etsy listing photos for the Travel Planner (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Travel-Planner.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
close = Renders(xlsx, tmp, hide={"Bookings": ["N"]},
                hide_rows={"Itinerary": range(34, 306), "Bookings": range(16, 106), "Packing list": range(46, 256)})
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Travel planner", "A countdown, your itinerary, every booking, a budget in any currency and a packing list",
      dark=True, width=2300)
laptop(img, r.shot("Japan trip planner"), 600, 560, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-itinerary.jpg"), "Plan every day",
       "What, where and when, with the booking it needs. The dashboard shows what is next.",
       close.shot("Itinerary"))

detail(os.path.join(img_dir, "03-bookings.jpg"), "Every booking in one place",
       "Confirmation codes, dates, what it costs in your currency and what is still to pay",
       close.shot("Bookings"), [("#FFE2B8", "Still to pay")])

detail(os.path.join(img_dir, "04-packing.jpg"), "A packing list\nto tick off",
       "Forty things most trips need, sorted by kind. Add your own.",
       close.shot("Packing list"), [("#D8F0DC", "Packed")])

img = canvas()
y = title(img, "Inside the file", "Five tabs, settings and a Start Here page. You type in the yellow cells and the rest is calculated.")
grid(img, [
    (content(r.page("Japan trip planner")), "Dashboard", "Countdown, budget, next bookings, next plans"),
    (content(r.page("Itinerary")), "Itinerary", "Day by day, with times and places"),
    (content(r.page("Bookings")), "Bookings", "Codes, costs, what is still to pay"),
    (content(r.page("Packing list")), "Packing list", "Tick things off as they go in"),
], y + 80)
save(img, os.path.join(img_dir, "05-whats-inside.jpg"))
