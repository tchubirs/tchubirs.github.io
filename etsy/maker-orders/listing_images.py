"""Etsy listing photos for the Handmade Order Tracker (run build.py first)."""
import os, sys
from openpyxl import load_workbook
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Handmade-Order-Tracker.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
img_dir = os.path.join(HERE, "images")

# The orders close-up shows the last 24 orders of the example.
last = max(c.row for c in load_workbook(xlsx)["Orders"]["B"] if c.value and c.row >= 6)
close = Renders(xlsx, tmp, hide={"Orders": ["F", "G", "N", "O", "P", "S"]},
                hide_rows={"Orders": list(range(6, last - 23)) + list(range(last + 1, 1006)),
                           "Products": range(12, 106), "Materials": range(18, 206)})

img = canvas(dark=True)
title(img, "Handmade order\ntracker", "Due dates, deposits, what each order costs and earns, and the materials to buy",
      dark=True, width=2300)
laptop(img, r.shot("Order dashboard"), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-orders.jpg"), "Every order on one line",
       "The total, the balance still to collect, the profit after costs and fees, and how long until it is due",
       close.shot("Orders"),
       [("#F9C9C4", "Late"), ("#FFE2B8", "Due soon or balance to collect"), ("#D8F0DC", "Done")])

detail(os.path.join(img_dir, "03-products.jpg"), "Know what each product costs to make",
       "Add the materials once. The cost, profit and margin of each product follow.",
       close.shot("Products"))

detail(os.path.join(img_dir, "04-materials.jpg"), "Know what to buy",
       "What the open orders need, against what you have in stock",
       close.shot("Materials"), [("#F9C9C4", "Short for the open orders")])

detail(os.path.join(img_dir, "05-calendar.jpg"), "Due dates on a calendar",
       "Each day shows how many orders are due, and which are still open",
       r.shot("Due dates"))

img = canvas()
y = title(img, "Inside the file", "Seven tabs and a Start Here page. You type in the yellow cells and the rest is calculated.")
grid(img, [
    (content(r.page("Order dashboard")), "Dashboard", "Due soon, owed, sales and profit"),
    (content(r.page("Orders")), "Orders", "Totals, balances, fees and profit"),
    (content(r.page("Materials")), "Materials", "Stock and what open orders need"),
    (content(r.page("Due dates")), "Due dates", "A month of orders on a calendar"),
], y + 80)
save(img, os.path.join(img_dir, "06-whats-inside.jpg"))
