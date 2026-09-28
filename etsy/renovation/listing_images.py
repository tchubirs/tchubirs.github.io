"""Etsy listing photos for the Home Renovation Budget Planner (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Home-Renovation-Budget-Planner.xlsx")
r = Renders(xlsx, os.path.join(HERE, "out"))
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Home renovation\nbudget planner", "Budget by room, contractor quotes, payments and a week-by-week timeline",
      dark=True, width=2300)
laptop(img, content(r.page("Renovation dashboard")), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

close = Renders(xlsx, os.path.join(HERE, "out"), hide={"Costs": ["G", "H", "L"]})
detail(os.path.join(img_dir, "02-quotes.jpg"), "Compare contractor quotes",
       "Quotes for the same job are compared, and every hired job shows what is left to pay",
       close.shot("Quotes and costs", until="Green Yard Services"),
       [("#D8F0DC", "Cheapest quote, or paid"), ("#FFE2B8", "Due in the next 14 days"), ("#F9C9C4", "Overdue")])

detail(os.path.join(img_dir, "03-timeline.jpg"), "See the work week by week",
       "Each task gets a bar from its start date to its end date",
       r.shot("Timeline", until="Final clean and punch list"),
       [("#B9CCE8", "Planned"), ("#1F6F78", "In progress"), ("#9FD3A8", "Done"), ("#E58A7F", "Delayed")])

img = canvas()
y = title(img, "Inside the file", "Four tabs and a Start Here page. You type in the yellow cells and the rest is calculated.")
grid(img, [
    (content(r.page("Renovation dashboard")), "Dashboard", "Budget used, payments due, next task"),
    (content(r.page("Budget by room")), "Budget", "Rooms, contingency and what is left"),
    (content(r.page("Quotes and costs")), "Costs", "Quotes, hired jobs, purchases, payments"),
    (content(r.page("Timeline")), "Timeline", "Tasks as bars, one column per week"),
], y + 80)
save(img, os.path.join(img_dir, "04-whats-inside.jpg"))
