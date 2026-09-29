"""Check every published listing against its LISTING.md: active, price, category, the cover as photo 1,
photo and file counts, and one video where video.py made one."""
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
    shown = sorted(P.call(s, "GET", f"/listings/{lid}/images")["results"], key=lambda im: im["rank"])
    imgs = len(shown)
    # Photo 1 is the cover, and every photo has its own place.
    if [im["rank"] for im in shown] != list(range(1, imgs + 1)) or not shown[0]["alt_text"].endswith("Sheets and Excel"):
        print(li["n"], lid, "photo order:", [(im["rank"], im["alt_text"]) for im in shown])
        bad += 1
        continue
    files = P.call(s, "GET", f"/shops/{s['shop_id']}/listings/{lid}/files")["count"]
    clips = P.call(s, "GET", f"/listings/{lid}/videos")["count"]
    if (P.VIDEOS / f"{li['folder']}.mp4").exists() and clips != 1:
        print(li["n"], lid, "videos:", clips)
        bad += 1
        continue
    price = x["price"]["amount"] / x["price"]["divisor"]
    ok = (x["state"] == "active" and abs(price - li["price"]) < 0.005 and x["taxonomy_id"] == cats[li["folder"]]
          and imgs == len(li["photos"]) and files == len(li["files"]) and x["title"] == li["title"])
    if not ok:
        bad += 1
        print(li["n"], lid, x["state"], price, li["price"], x["taxonomy_id"], imgs, len(li["photos"]), files, len(li["files"]))
print("listings checked:", len(P.listings()), "| problems:", bad)
