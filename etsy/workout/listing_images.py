"""Etsy listing photos for the Workout Log and Progress Tracker (run build.py first)."""
import os, sys
from openpyxl import load_workbook
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Workout-Log-Tracker.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
img_dir = os.path.join(HERE, "images")

# The log close-up shows the last 24 lines of the example log.
last = max(c.row for c in load_workbook(xlsx)["Log"]["D"] if c.value and c.row >= 6)
close = Renders(xlsx, tmp, hide_rows={"Log": list(range(6, last - 23)) + list(range(last + 1, 1506)),
                                      "Exercises": range(25, 106)})

img = canvas(dark=True)
title(img, "Workout log and\nprogress tracker", "Log your sets and see new bests, weekly volume, sets per muscle and your weight",
      dark=True, width=2300)
laptop(img, r.shot("Training dashboard"), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-log.jpg"), "One line per exercise",
       "Up to five sets. The best set, an estimated max and each new best show up by themselves.",
       close.shot("Workout log"), [("#FCE9B8", "New best")])

detail(os.path.join(img_dir, "03-calendar.jpg"), "Every day you trained",
       "Pick a month. Each day you trained turns green with the name of the workout.",
       r.shot("Calendar"))

detail(os.path.join(img_dir, "04-bests.jpg"), "Your best for every exercise",
       "The best set, the estimated max, and when you did it",
       close.shot("Exercises"))

detail(os.path.join(img_dir, "05-body.jpg"), "Weight and measurements",
       "A weekly weigh-in, measurements every few weeks, and a chart against your goal",
       r.shot("Body"))

img = canvas()
y = title(img, "Inside the file", "Six tabs and a Start Here page. You type in the yellow cells and the rest is calculated.")
grid(img, [
    (content(r.page("Training dashboard")), "Dashboard", "Last 7 days, 12 weeks, bests, weight"),
    (content(r.page("Workout log")), "Log", "One line per exercise, five sets"),
    (content(r.page("Weekly plan")), "Plan", "Your split and each workout's exercises"),
    (content(r.page("Calendar")), "Calendar", "The days you trained, month by month"),
], y + 80)
save(img, os.path.join(img_dir, "06-whats-inside.jpg"))
