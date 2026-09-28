"""Etsy listing photos for the Baby Log (run build.py first)."""
import os, sys
from openpyxl import load_workbook
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Baby-Log.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
# Close ups of the last two days of feeds and sleep, and the milestones.
wb = load_workbook(xlsx)
def last_rows(ws, first, last_row, days=2):
    dates = [(row, ws.cell(row, 2).value) for row in range(first, last_row + 1) if ws.cell(row, 2).value]
    end = max(d for _, d in dates)
    keep = [row for row, d in dates if (end - d).days < days]
    return list(range(first, min(keep))) + list(range(max(keep) + 1, last_row + 3))
close = Renders(xlsx, tmp, hide={"Feeds": ["G"], "Sleep": ["G"]},
                hide_rows={"Feeds": last_rows(wb["Feeds"], 6, 3005), "Sleep": last_rows(wb["Sleep"], 6, 2505, 3),
                           "Milestones": range(17, 47)})
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Baby log", "Feeds, sleep and nappies, growth with a weight chart, appointments and milestones for the "
      "first year", dark=True, width=2300)
laptop(img, r.shot("Ella's log"), 600, 560, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

# The top of the dashboard, above the weight chart.
page = r.doc[r._index("Ella's log")]
cut = int((page.search_for("Weight")[-1].y0 - 20) * 220 / 72)
full = r.page("Ella's log")
top = Image.new("RGB", (full.width, cut + 120), "#FFFFFF")
top.paste(full.crop((0, 0, full.width, cut)), (0, 0))
detail(os.path.join(img_dir, "02-today.jpg"), "Today, and the week before",
       "Feeds, the last one and how long ago, sleep, nappies and the next appointment",
       content(top), [("#E3E8FF", "The day you picked")])

detail(os.path.join(img_dir, "03-feeds.jpg"), "One line per feed",
       "Breast with the minutes or bottle with the amount, day and night",
       close.shot("Feeds"), [("#E3E8FF", "Bottle")])

detail(os.path.join(img_dir, "04-sleep.jpg"), "Every sleep, even past midnight",
       "When it started and ended, and the hours add up for each day",
       close.shot("Sleep"))

detail(os.path.join(img_dir, "05-milestones.jpg"), "The firsts",
       "Type the date and the age fills in: first smile, rolling over, first steps",
       close.shot("Milestones"), [("#D8F0DC", "Reached")])

img = canvas()
y = title(img, "Inside the file", "Seven tabs, settings and a Start Here page. You type in the yellow cells and the "
          "rest is calculated.")
grid(img, [
    (content(r.page("Ella's log")), "Dashboard", "The day and the week"),
    (content(r.page("Feeds")), "Feeds", "Breast or bottle"),
    (content(r.page("Sleep")), "Sleep", "Hours each day"),
    (content(r.page("Growth")), "Growth", "Weight chart"),
    (content(r.page("Appointments")), "Appointments", "Checks and vaccines"),
    (content(r.page("Milestones")), "Milestones", "The firsts"),
], y + 80, cols=3)
save(img, os.path.join(img_dir, "06-whats-inside.jpg"))
