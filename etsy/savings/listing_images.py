"""Etsy listing photos for the Savings Goals Tracker (run build.py first)."""
import datetime as dt, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Savings-Goals-Tracker.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Savings goals\ntracker", "Several goals at once, what each one needs per month and per payday, and two challenges",
      dark=True, width=2300)
laptop(img, r.shot("Savings dashboard"), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-goals.jpg"), "Know what each goal needs",
       "Per month and per payday, to be ready by its date",
       Renders(xlsx, tmp, hide={"Goals": ["E", "H", "I", "J", "N"]}).shot("Savings goals", until="Concert tickets"),
       [("#D8F0DC", "On track or reached"), ("#F9C9C4", "Behind"), ("#E3E8FF", "No date yet")])

close = Renders(xlsx, tmp, hide_rows={"Month by month": range(13, 21)})
detail(os.path.join(img_dir, "03-months.jpg"), "Every goal, every month",
       "Green when you put in your plan, orange for part of it, red when more came out",
       close.shot("Month by month"))

detail(os.path.join(img_dir, "04-envelopes.jpg"), "Includes the 100\nenvelope challenge",
       "Type the number of each envelope you fill. The board turns green and adds it up.",
       r.shot("100 envelope"))

detail(os.path.join(img_dir, "05-52-weeks.jpg"), "And the 52 week\nchallenge",
       "Type x for each week you save. A week you missed turns orange.",
       r.shot("52 week", until=(dt.date(dt.date.today().year, 1, 5) + dt.timedelta(weeks=13)).strftime("%d %b %Y")))

img = canvas()
y = title(img, "Inside the file", "Six tabs and a Start Here page. You type in the yellow cells and the rest is calculated.")
grid(img, [
    (content(r.page("Savings dashboard")), "Dashboard", "Saved, left, needed a month, per payday"),
    (content(r.page("Savings goals")), "Goals", "Target, date, plan and status for each goal"),
    (content(r.page("Month by month")), "Month by month", "Every goal and month in one grid"),
    (content(r.page("Savings log")), "Savings log", "One line per deposit or withdrawal"),
], y + 80)
save(img, os.path.join(img_dir, "06-whats-inside.jpg"))
