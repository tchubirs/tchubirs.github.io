"""Check every published listing against its LISTING.md: active, price, category, photo and file counts."""
import json

import publish as P

s = P.load()
done = json.loads(P.DONE.read_text())
cats = json.loads(P.CATS.read_text())
bad = 0
for li in P.listings():
    rec = done.get(str(li["n"]))
    if not rec:
        print(li["n"], "not published"); bad += 1; continue
    lid = rec["listing_id"]
    x = P.call(s, "GET", f"/listings/{lid}")
    imgs = P.call(s, "GET", f"/listings/{lid}/images")["count"]
    files = P.call(s, "GET", f"/shops/{s['shop_id']}/listings/{lid}/files")["count"]
    price = x["price"]["amount"] / x["price"]["divisor"]
    ok = (x["state"] == "active" and abs(price - li["price"]) < 0.005 and x["taxonomy_id"] == cats[li["folder"]]
          and imgs == len(li["photos"]) and files == len(li["files"]) and x["title"] == li["title"])
    if not ok:
        bad += 1
        print(li["n"], lid, x["state"], price, li["price"], x["taxonomy_id"], imgs, len(li["photos"]), files, len(li["files"]))
print("listings checked:", len(P.listings()), "| problems:", bad)
