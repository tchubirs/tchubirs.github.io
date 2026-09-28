"""Etsy listing photos for the Party Planner (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Party-Planner.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
close = Renders(xlsx, tmp, hide={"Tasks": ["H"], "Guests": ["K"], "Budget": ["K"], "Food and drinks": ["M"]},
                hide_rows={"Tasks": range(33, 66), "Food and drinks": range(21, 48), "Guests": range(26, 306),
                           "Budget": range(14, 57)})
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Party planner", "A countdown, a dated checklist, the guest list, how much food to buy and the budget",
      dark=True, width=2300)
laptop(img, r.shot("Mia turns 7"), 600, 560, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-checklist.jpg"), "A checklist that\nknows the date",
       "Each task is dated back from the day of the party. Change the date and they all move.",
       close.shot("Tasks"), [("#D8F0DC", "Done"), ("#FFE2B8", "This week"), ("#F9C9C4", "Late")])

detail(os.path.join(img_dir, "03-food.jpg"), "How much food to buy",
       "From the adults and kids who may come, with a little extra and whole packs",
       close.shot("Food and drinks"), [("#D8F0DC", "Bought")])

detail(os.path.join(img_dir, "04-guests.jpg"), "Guests, answers and gifts",
       "Adults and kids, dietary needs, and the thank-you notes still to send",
       close.shot("Guests"), [("#D8F0DC", "Coming"), ("#FFE2B8", "Maybe, or a note to send")])

detail(os.path.join(img_dir, "05-budget.jpg"), "Every cost and deposit",
       "What you paid, what is left and when it is due",
       close.shot("Budget"), [("#D8F0DC", "Paid"), ("#FFE2B8", "Due within a week")])

img = canvas()
y = title(img, "Inside the file", "Six tabs and a Start Here page. You type in the yellow cells and the rest is "
          "calculated.")
grid(img, [
    (content(r.page("Mia turns 7")), "Dashboard", "Guests, tasks and money"),
    (content(r.page("Guests")), "Guests", "Answers and head counts"),
    (content(r.page("Tasks")), "Tasks", "Dated from the day"),
    (content(r.page("Food and drinks")), "Food and drinks", "What to buy"),
    (content(r.page("Budget")), "Budget", "Costs and deposits"),
    (content(r.page("The day")), "The day", "Hour by hour"),
], y + 80, cols=3)
save(img, os.path.join(img_dir, "06-whats-inside.jpg"))
