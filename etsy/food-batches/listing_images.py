"""Etsy listing photos for the Food Batch Tracker (run build.py first)."""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from openpyxl import load_workbook  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Food-Batch-Tracker.xlsx")
tmp = os.path.join(HERE, "out")
img_dir = os.path.join(HERE, "images")

# Close-ups stop under the last line typed in; Batches and Purchases show the latest lines.
wb = load_workbook(xlsx)
last = lambda ws, end: max(r for r in range(6, end + 1) if ws.cell(r, 2).value not in (None, ""))
bt_end, pu_end, pr_end = last(wb["Batches"], 505), last(wb["Purchases"], 405), last(wb["Products"], 45)
ig_end, rc_end = last(wb["Ingredients"], 105), last(wb["Recipes"], 405)
rc_show = max(r for r in range(6, rc_end + 1) if wb["Recipes"].cell(r, 2).value == "Chocolate chip cookies")

r = Renders(xlsx, tmp, one_page=("Dashboard", "Label"))
rows = {"Batches": list(range(6, bt_end - 21)) + list(range(bt_end + 1, 506)),
        "Purchases": list(range(6, pu_end - 21)) + list(range(pu_end + 1, 406)),
        "Products": range(pr_end + 1, 46), "Ingredients": range(ig_end + 1, 106), "Recipes": range(rc_show + 1, 406)}
tidy = Renders(xlsx, tmp, one_page=("Dashboard", "Label"), hide_rows={"Ingredients": range(ig_end + 1, 106),
                                                                         "Recipes": range(rc_show + 1, 406)})
close = Renders(xlsx, tmp, one_page=("Dashboard", "Label"),
                hide={"Ingredients": list("CDEFHIJKL"), "Products": list("CGMN")},
                hide_rows=rows)



def exact(renders, name):
    """The page whose title is exactly this (Batches is also the start of the Dashboard title)."""
    pix = renders.doc[renders.titles.index(name)].get_pixmap(dpi=220)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def band(img):
    """Height in pixels of the first teal header row, to match the size of type of two sheets."""
    a = np.asarray(img).astype(int)
    rows = (np.abs(a - np.array([0x1F, 0x6F, 0x78])).sum(axis=2) < 40).mean(axis=1) > 0.3
    start = int(np.argmax(rows))
    end = start + int(np.argmin(rows[start:]))
    return end - start


img = canvas(dark=True)
title(img, "Batches and best-before dates", "For home bakers and small food makers: batch codes, dates, labels with "
      "the allergens, cost per item and waste", dark=True, width=2300)
laptop(img, r.shot("Batches and best before"), 600, 560, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-labels.jpg"), "Labels to print for each batch",
       "Pick a batch: the ingredients in order of amount, the allergens, the batch code and the date fill in, six to "
       "a page.", r.shot("Labels for batch"))

detail(os.path.join(img_dir, "03-batches.jpg"), "Every batch with its code and date",
       "What was sold, given away and thrown out, and how many days each batch has left",
       content(exact(close, "Batches")), [("#FFE2B8", "Use soon"), ("#F9C9C4", "Past its date")])

# Products over the recipe of one of them, both at the same size of type.
top, lower = close.shot("Products"), close.shot("Recipes")
lower = lower.resize((round(lower.width * band(top) / band(lower)), round(lower.height * band(top) / band(lower))),
                     Image.LANCZOS)
both = Image.new("RGB", (max(top.width, lower.width), top.height + lower.height + 40), "#FFFFFF")
both.paste(top, (0, 0))
both.paste(lower, (0, top.height + 40))
detail(os.path.join(img_dir, "04-cost.jpg"), "The cost of each item, from the recipe",
       "Pack prices and recipes give the cost of a batch, the cost and profit of each item, and what it contains",
       both, [("#F9C9C4", "Sold below cost")])

detail(os.path.join(img_dir, "05-allergens.jpg"), "Allergens marked once",
       "An x under each allergen an ingredient contains. Every product and every label picks it up.",
       close.shot("Ingredients"))

detail(os.path.join(img_dir, "06-pantry.jpg"), "Ingredients with their lot numbers",
       "The date on each pack and what is left of each ingredient, so you know what to use and what to buy",
       close.shot("Purchases"), [("#FFE2B8", "Use soon"), ("#F9C9C4", "Past its date")])

img = canvas()
y = title(img, "Inside the file", "Six tabs, settings and a Start Here page. You type in the yellow cells and the rest "
          "is calculated.")
grid(img, [
    (content(r.page("Batches and best before")), "Dashboard", "What to sell first and what to buy"),
    (content(r.page("Labels for batch")), "Labels", "Six to a page, ready to cut"),
    (content(tidy.page("Recipes")), "Recipes", "What goes into a batch"),
    (content(tidy.page("Ingredients")), "Ingredients", "Pack prices, stock and allergens"),
], y + 80, cols=2)
save(img, os.path.join(img_dir, "07-whats-inside.jpg"))
