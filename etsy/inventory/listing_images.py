"""Etsy listing images for the Inventory & Sales Tracker (run build.py first)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import H, W, Renders, badges, canvas, card, chips, content, headline, inside, save  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
r = Renders(os.path.join(HERE, "Inventory-Sales-Tracker.xlsx"), os.path.join(HERE, "out"))
img_dir = os.path.join(HERE, "images")

img = canvas()
headline(img, "Inventory & Sales Tracker", "Stock, sales and profit for your small shop, updated from one log")
card(img, content(r.page("Your shop at a glance")), (100, 390, W - 100, H - 180))
badges(img, ["Google Sheets", "Excel", "Instant download"], H - 150)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

img = canvas()
headline(img, "Know what to reorder, before you run out", "Every product shows its stock now, margin and status")
card(img, content(r.page("Products"), keep=0.30), (80, 380, W - 80, 1500))
chips(img, [("#D8F0DC", "OK", "enough stock"), ("#FFE2B8", "Reorder now", "at your reorder level"),
            ("#F9C9C4", "Out of stock", "sold out")], 1600)
save(img, os.path.join(img_dir, "02-products.jpg"))

img = canvas()
headline(img, "What's inside", "4 tabs: you only type in the yellow cells")
inside(img, [
    ("Dashboard", "sales, profit, units per month, stock value"),
    ("Products", "cost, price, stock now, margin, status"),
    ("Stock Moves", "purchases, sales, returns, adjustments"),
    ("Start Here", "5 steps, 10 minutes"),
    ("For makers", "candles, jewelry, prints, crafts, resale"),
])
badges(img, ["Google Sheets + Excel", "No subscription", "Instant download"], H - 180)
save(img, os.path.join(img_dir, "03-whats-inside.jpg"))
