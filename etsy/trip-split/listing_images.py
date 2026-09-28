"""Etsy listing photos for the Group Trip Expense Splitter (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Trip-Expense-Splitter.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
close = Renders(xlsx, tmp, hide={"Expenses": ["M", "N", "O", "P", "Q", "R", "S"]},
                hide_rows={"Expenses": range(33, 506), "Dashboard": range(15, 22), "Setup": range(14, 21)},
                one_page={"Dashboard"})
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Group trip\nexpense splitter", "Who paid what, everyone's share, and the fewest payments to settle up",
      dark=True, width=2300)
laptop(img, r.shot("Trip expenses"), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-expenses.jpg"), "Split each expense your way",
       "Between everyone, only some people, or in unequal shares, in any currency",
       close.shot("Expenses"), [("#CFE8E4", "Shared by these people")])

detail(os.path.join(img_dir, "03-settle-up.jpg"), "Who pays whom",
       "Each person's balance, and the fewest payments that settle everyone up",
       close.shot("Trip expenses", until="The fewest payments"),
       [("#D8F0DC", "Gets money back"), ("#FFE2B8", "Owes money")])

detail(os.path.join(img_dir, "04-setup.jpg"), "Any currency, up to 12 people",
       "Pay in euros, pounds or anything else. Every total comes out in your home currency.",
       close.shot("Setup"))

img = canvas()
y = title(img, "Inside the file", "Three tabs and a Start Here page. You type in the yellow cells and the rest is calculated.")
grid(img, [
    (content(r.page("Trip expenses")), "Dashboard", "Balances, settle up, by category and day"),
    (content(r.page("Expenses")), "Expenses", "Who paid, in what currency, who shares"),
    (content(r.page("Setup")), "Setup", "The trip, the people, the currencies"),
    (content(r.page("Start here")), "Start Here", "Five steps to get going"),
], y + 80)
save(img, os.path.join(img_dir, "05-whats-inside.jpg"))
