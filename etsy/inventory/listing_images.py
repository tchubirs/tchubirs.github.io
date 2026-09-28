"""Etsy listing photos for the Inventory & Sales Tracker (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Inventory-Sales-Tracker.xlsx")
r = Renders(xlsx, os.path.join(HERE, "out"))
close = Renders(xlsx, os.path.join(HERE, "out"), hide={"Products": ["D", "E", "F", "G", "I", "J"]})
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Inventory and sales tracker\nfor small shops",
      "Stock, sales and profit, worked out from one list of stock moves", dark=True, width=2300)
laptop(img, content(r.page("Shop dashboard")), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-products.jpg"), "See what to reorder before you run out",
       "Each product shows its stock now, its margin and a status",
       close.shot("Products", until="Linen tote bag"),
       [("#D8F0DC", "OK"), ("#FFE2B8", "Reorder now"), ("#F9C9C4", "Out of stock")])

img = canvas()
y = title(img, "Inside the file", "Four tabs. You type in the yellow cells and the rest is calculated.")
grid(img, [
    (content(r.page("Shop dashboard")), "Dashboard", "Sales, profit and units by month, stock value"),
    (content(r.page("Products")), "Products", "Cost, price, stock now, margin and status"),
    (content(r.page("Stock moves")), "Stock Moves", "Purchases, sales, returns and adjustments"),
    (content(r.page("Start here")), "Start Here", "Five short steps to set it up"),
], y + 80)
save(img, os.path.join(img_dir, "03-whats-inside.jpg"))
