"""Etsy listing photos for the Car Maintenance Tracker (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Car-Maintenance-Tracker.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
close = Renders(xlsx, tmp, hide={"Services": ["M"], "Documents": ["H"]},
                hide_rows={"Services": range(15, 67), "Fuel": range(26, 607), "Documents": range(12, 47)})
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Car maintenance tracker", "Services by distance or date, fuel and consumption, every cost, and the papers "
      "that run out", dark=True, width=2300)
laptop(img, r.shot("Car care"), 600, 560, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-services.jpg"), "Whichever comes first",
       "Every service by distance or by months, with the day the car should get there at its usual pace",
       close.shot("Services"), [("#F9C9C4", "Overdue"), ("#FFE2B8", "Due soon"), ("#D8F0DC", "OK")])

detail(os.path.join(img_dir, "03-fuel.jpg"), "Fuel and consumption",
       "From one full tank to the next, in litres per 100 km or in miles per gallon. A half fill waits for the next full one.",
       close.shot("Fuel"))

detail(os.path.join(img_dir, "04-papers.jpg"), "Papers that run out",
       "Insurance, tax, inspection and breakdown cover, with a warning before each one ends",
       close.shot("Documents"), [("#F9C9C4", "Ended"), ("#FFE2B8", "Ends soon"), ("#D8F0DC", "OK")])

# The dashboard from the months table down: the year month by month, with the chart.
page = r.doc[r._index("Car care")]
cut = int((page.search_for("Month")[0].y0 - 14) * 220 / 72)
full = r.page("Car care")
detail(os.path.join(img_dir, "05-year.jpg"), "What the cars cost",
       "Fuel and every other cost, month by month through the year",
       content(full.crop((0, cut, full.width, full.height))), [("#1F6F78", "Fuel"), ("#F2A65A", "Other costs")])

img = canvas()
y = title(img, "Inside the file", "Six tabs, settings and a Start Here page. You type in the yellow cells and the rest "
          "is calculated.")
grid(img, [
    (content(r.page("Car care")), "Dashboard", "Every car and what is due"),
    (content(r.page("Cars")), "Cars", "Odometer and pace"),
    (content(r.page("Services")), "Services", "By distance or date"),
    (content(r.page("Fuel")), "Fuel", "Consumption per tank"),
    (content(r.page("Costs")), "Costs", "Repairs, tyres, tax"),
    (content(r.page("Documents")), "Documents", "Insurance and inspection"),
], y + 80, cols=3)
save(img, os.path.join(img_dir, "06-whats-inside.jpg"))
