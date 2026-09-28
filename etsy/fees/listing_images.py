"""Etsy listing photos for the Fee and Profit Calculator (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Seller-Fee-Profit-Calculator.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Fee and profit calculator\nfor Etsy sellers", "Every fee on a sale, your profit, and the price that reaches your target margin",
      dark=True, width=2300)
laptop(img, content(r.page("Fee and profit calculator")), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-calculator.jpg"))

close = Renders(xlsx, tmp, hide={"Products": ["E", "F", "G", "H", "I"]})
detail(os.path.join(img_dir, "02-products.jpg"), "See which products make money",
       "Each product shows its fees, profit and margin, with a price that reaches your target",
       close.shot("Your products", until="Leather wallet"),
       [("#D8F0DC", "On target"), ("#FFE2B8", "Below target"), ("#F9C9C4", "Loss")])

detail(os.path.join(img_dir, "03-countries.jpg"), "Rates for your country",
       "Eight countries filled in. Change any rate when Etsy changes its fees.",
       r.shot("Settings", until="Australia"))

img = canvas()
y = title(img, "Inside the file", "Three tabs and a Start Here page. You type in the yellow cells and the rest is calculated.")
grid(img, [
    (content(r.page("Fee and profit calculator")), "Calculator", "One sale, every fee, your profit"),
    (content(r.page("Your products")), "Products", "Up to 200 products with suggested prices"),
    (content(r.page("Settings")), "Settings", "Rates for 8 countries, your hourly rate"),
    (content(r.page("Start here")), "Start Here", "Four short steps to set it up"),
], y + 80)
save(img, os.path.join(img_dir, "04-whats-inside.jpg"))
