"""Etsy listing photos for the Pet Care Tracker (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Pet-Care-Tracker.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
close = Renders(xlsx, tmp, hide={"Health": ["H"], "Food": ["M"]},
                hide_rows={"Health": range(16, 67), "Food": range(11, 27), "Vet visits": range(13, 306)})
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Pet care tracker", "Vaccines and treatments due, the food to buy, vet visits, weight and what your pets "
      "cost", dark=True, width=2300)
laptop(img, r.shot("Pet care"), 600, 560, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-health.jpg"), "Every vaccine and treatment",
       "How often, when it was last done and when the next one is due",
       close.shot("Health"), [("#F9C9C4", "Overdue"), ("#FFE2B8", "Due soon"), ("#D8F0DC", "OK")])

detail(os.path.join(img_dir, "03-food.jpg"), "Know when the food runs out",
       "From the bag size and how much a day: the day it runs out and when to buy the next one",
       close.shot("Food"), [("#F9C9C4", "Buy now"), ("#FFE2B8", "Running low")])

# The lower half of the dashboard: booked visits and what the pets cost this year.
page = r.doc[r._index("Pet care")]
cut = int((page.search_for("Vet visits booked")[0].y0 - 12) * 220 / 72)
full = r.page("Pet care")
detail(os.path.join(img_dir, "04-costs.jpg"), "What each pet costs",
       "This year by category and by pet, with the vet bills and the next visits booked",
       content(full.crop((0, cut, full.width, full.height))))

detail(os.path.join(img_dir, "05-vet-visits.jpg"), "Every vet visit",
       "Why, what the vet said and what it cost. Booked visits show on the dashboard.",
       close.shot("Vet visits"), [("#E3E8FF", "Booked")])

img = canvas()
y = title(img, "Inside the file", "Six tabs and a Start Here page. You type in the yellow cells and the rest is "
          "calculated.")
grid(img, [
    (content(r.page("Pet care")), "Dashboard", "What is due and what it costs"),
    (content(r.page("Pets")), "Pets", "Papers, age and weight"),
    (content(r.page("Health")), "Health", "Vaccines and treatments"),
    (content(r.page("Vet visits")), "Vet visits", "Booked and past"),
    (content(r.page("Food")), "Food", "When it runs out"),
    (content(r.page("Spending")), "Spending", "By pet and category"),
], y + 80, cols=3)
save(img, os.path.join(img_dir, "06-whats-inside.jpg"))
