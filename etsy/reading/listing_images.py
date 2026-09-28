"""Etsy listing photos for the Reading Tracker (run build.py first)."""
import os, sys
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Reading-Tracker.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
close = Renders(xlsx, tmp, hide_rows={"Books": list(range(6, 21)) + list(range(49, 1006))})
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Reading tracker", "A yearly goal, every book you read, your months and genres, and a bookshelf that "
      "fills up", dark=True, width=2300)
laptop(img, r.shot("Reading dashboard"), 600, 560, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-bookshelf.jpg"), "Your year on a bookshelf",
       "Every book you finish goes on the shelf, in the colour of its genre. Room for 100 books.",
       r.shot("Bookshelf"))

detail(os.path.join(img_dir, "03-books.jpg"), "Every book in one list",
       "Author, genre, pages, dates and a rating. The days and pages a day are worked out for you.",
       close.shot("Books"), [("#D8F0DC", "Finished"), ("#FCE9B8", "Reading"), ("#F3DE8A", "Five stars")])

# The top of the dashboard, down to the row of the last month: cut in the blank rows above the next tables.
page = r.doc[r._index("Reading dashboard")]
dec = min(page.search_for("Dec"), key=lambda hit: hit.x0)
cut = int((dec.y1 + page.search_for("Five stars this year")[0].y0) / 2 * 220 / 72)
full = r.page("Reading dashboard")
top = Image.new("RGB", (full.width, cut + 120), "#FFFFFF")
top.paste(full.crop((0, 0, full.width, cut)), (0, 0))
detail(os.path.join(img_dir, "04-goal.jpg"), "Ahead or behind on your goal",
       "Set a goal and see where you should be today, with your books by month and by genre",
       content(top), [("#D8F0DC", "Ahead or on track"), ("#FFE2B8", "Behind")])


def wide(shot, ratio=2.08):
    """White space on the right so the whole sheet fits the height of a grid cell."""
    out = Image.new("RGB", (max(shot.width, int(shot.height * ratio)), shot.height), "#FFFFFF")
    out.paste(shot, (0, 0))
    return out


img = canvas()
y = title(img, "Inside the file", "Four tabs and a Start Here page. You type in the yellow cells and the rest is "
          "calculated.")
grid(img, [
    (content(r.page("Reading dashboard")), "Dashboard", "Goal, months, genres, reading now"),
    (content(r.page("Books")), "Books", "Every book, with dates and a rating"),
    (wide(content(r.page("Bookshelf"))), "Bookshelf", "Spines in the colour of their genre"),
    (content(r.page("Settings")), "Settings", "Your genres and their colours"),
], y + 80)
save(img, os.path.join(img_dir, "05-whats-inside.jpg"))
