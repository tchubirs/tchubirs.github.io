"""Etsy listing photos for the Habit and Mood Tracker (run build.py first)."""
import datetime as dt, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Habit-Mood-Tracker.xlsx")
tmp = os.path.join(HERE, "out")
MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dt.date.today().month - 1]
NAME = dt.date.today().strftime("%B")
r = Renders(xlsx, tmp)
close = Renders(xlsx, tmp, hide_rows={MONTH: range(15, 22), "Dashboard": range(18, 25)}, one_page={"Dashboard", "Year in pixels"})
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Habit and mood\ntracker", "Tick off your habits, keep your streaks, and see your year in the colour of your mood",
      dark=True, width=2300)
laptop(img, r.shot("Habit dashboard"), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-month.jpg"), "One tab for every month",
       "Type x on the days you did each habit, then your mood from 1 to 5 and the hours you slept",
       close.shot(NAME))

detail(os.path.join(img_dir, "03-year-in-pixels.jpg"), "Your year in pixels",
       "Every day of the year in the colour of your mood",
       close.shot("Year in pixels"))

detail(os.path.join(img_dir, "04-streaks.jpg"), "Streaks that carry on",
       "Each habit's share of days, the streak you are on and your best streak this year",
       close.shot("Habit dashboard", until="Meditate 10 minutes"))

img = canvas()
y = title(img, "Inside the file", "A dashboard, a year in pixels, 12 month tabs and a list of your habits.")
grid(img, [
    (content(r.page("Habit dashboard")), "Dashboard", "This month and the whole year"),
    (content(r.page(NAME)), "Month tabs", "Habits, mood and sleep for each day"),
    (content(r.page("Year in pixels")), "Year in pixels", "Your mood, one square per day"),
    (content(r.page("Habits")), "Habits", "Up to 15 habits and the year"),
], y + 80)
save(img, os.path.join(img_dir, "05-whats-inside.jpg"))
