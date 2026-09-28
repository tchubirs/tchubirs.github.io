"""Etsy listing photos for the Moving Planner (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Moving-Planner.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
close = Renders(xlsx, tmp, hide={"Boxes": ["L"], "Tasks": ["H"], "New address": ["G", "H", "I", "J", "K", "L"], "Costs": ["K"]},
                hide_rows={"Boxes": range(31, 306), "Tasks": range(34, 76), "New address": range(28, 66),
                           "Costs": range(14, 57)})
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Moving planner", "A countdown, a dated checklist, every box by room, the costs and who to tell",
      dark=True, width=2300)
laptop(img, r.shot("Moving to"), 600, 560, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-boxes.jpg"), "Every box, numbered",
       "The room it leaves, the room it goes to and what is inside. Fragile, open first, packed and arrived.",
       close.shot("Boxes"), [("#F9C9C4", "Fragile"), ("#FFE2B8", "Open first"), ("#CFE8E4", "Packed")])

detail(os.path.join(img_dir, "03-checklist.jpg"), "Counted back from\nmoving day",
       "Each task has its date. Change moving day and they all move.",
       close.shot("Tasks"), [("#D8F0DC", "Done"), ("#FFE2B8", "This week"), ("#F9C9C4", "Late")])

detail(os.path.join(img_dir, "04-new-address.jpg"), "Who needs your\nnew address",
       "Bank, work, doctor, insurance, the post and the rest, ticked off one by one",
       close.shot("New address"), [("#D8F0DC", "Told")])

detail(os.path.join(img_dir, "05-costs.jpg"), "What the move costs",
       "Deposits, what is still to pay and when it is due",
       close.shot("Costs"), [("#D8F0DC", "Paid"), ("#FFE2B8", "Due within a week")])

img = canvas()
y = title(img, "Inside the file", "Six tabs, settings and a Start Here page. You type in the yellow cells and the rest "
          "is calculated.")
grid(img, [
    (content(r.page("Moving to")), "Dashboard", "Countdown, boxes, money"),
    (content(r.page("Tasks")), "Tasks", "Dated from moving day"),
    (content(r.page("Boxes")), "Boxes", "Numbered, by room"),
    (content(r.page("Movers")), "Movers", "Quotes side by side"),
    (content(r.page("Costs")), "Costs", "Deposits and what is left"),
    (content(r.page("New address")), "New address", "Who to tell"),
], y + 80, cols=3)
save(img, os.path.join(img_dir, "06-whats-inside.jpg"))
