"""Etsy listing photos for the Weekly Meal Planner (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Weekly-Meal-Planner.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
img_dir = os.path.join(HERE, "images")

img = canvas(dark=True)
title(img, "Weekly meal planner\nand grocery list", "Plan the week and the grocery list builds itself, in store order, with the cost",
      dark=True, width=2300)
laptop(img, r.shot("Week plan", keep=0.8), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-week-plan.jpg"))

detail(os.path.join(img_dir, "02-grocery-list.jpg"), "A grocery list\nfrom your plan",
       "Only what the week needs, in the order of the store, rounded up to whole packs, with the cost",
       r.shot("Grocery list", until="Mozzarella"))

close = Renders(xlsx, tmp, hide={"Pantry": ["D", "E", "G", "I"]},
                hide_rows={"Pantry": range(26, 306), "Recipes": range(21, 106)})
detail(os.path.join(img_dir, "03-pantry.jpg"), "It counts what you already have",
       "Type what is at home. The list buys only the rest, in whole packs.",
       close.shot("Pantry"), [("#D8F0DC", "On the grocery list")])

detail(os.path.join(img_dir, "04-recipes.jpg"), "See what each meal costs",
       "Cost per serving from your own prices, and how often each recipe is on this week's plan",
       close.shot("Recipes"), [("#D8F0DC", "On this week's plan")])

img = canvas()
y = title(img, "Inside the file", "Five tabs, settings and a Start Here page. You type in the yellow cells and the rest is calculated.")
grid(img, [
    (content(r.page("Week plan")), "Week plan", "Seven days, four meals, people per day"),
    (content(r.page("Grocery list")), "Grocery list", "Builds itself, in store order, with the cost"),
    (content(r.page("Recipes")), "Recipes", "Serves, minutes, cost per serving"),
    (content(r.page("Pantry")), "Pantry", "Packs, prices and what you have at home"),
], y + 80)
save(img, os.path.join(img_dir, "05-whats-inside.jpg"))
