"""Check every published listing against its LISTING.md: active, price, category, the cover as photo 1,
photo and file counts, and one video where one was sent (published.json says so).

    python3 etsy/check_live.py        read only: it changes nothing on Etsy
"""
import json

import publish as P


def check(s, done, cats):
    """The problems found, one line each. A listing with a problem does not stop the check of the others."""
    out = []
    for li in P.listings():
        rec = done.get(str(li["n"]))
        if not rec:
            out.append(f"{li['n']} not published")
            continue
        lid = rec["listing_id"]
        x = P.call(s, "GET", f"/listings/{lid}")
        shown = sorted(P.call(s, "GET", f"/listings/{lid}/images")["results"], key=lambda im: im["rank"])
        # Photo 1 is the cover, and every photo has its own place. A photo put up by hand may have no alt text.
        if (not shown or [im["rank"] for im in shown] != list(range(1, len(shown) + 1))
                or not (shown[0].get("alt_text") or "").endswith("Sheets and Excel")):
            out.append(f"{li['n']} {lid} photo order: {[(im['rank'], im.get('alt_text')) for im in shown]}")
            continue
        files = P.call(s, "GET", f"/shops/{s['shop_id']}/listings/{lid}/files")["count"]
        clips = P.call(s, "GET", f"/listings/{lid}/videos")["count"]
        if rec.get("video") and clips != 1:
            out.append(f"{li['n']} {lid} videos: {clips}")
            continue
        price = x["price"]["amount"] / x["price"]["divisor"]
        category = cats.get(li["folder"])        # a listing put up with --taxonomy may have none in taxonomy.json
        ok = (x["state"] == "active" and abs(price - li["price"]) < 0.005
              and (category is None or x["taxonomy_id"] == category)
              and len(shown) == len(li["photos"]) and files == len(li["files"]) and x["title"] == li["title"])
        if not ok:
            out.append(f"{li['n']} {lid} {x['state']} {price} {li['price']} {x['taxonomy_id']} {len(shown)} "
                       f"{len(li['photos'])} {files} {len(li['files'])}")
    return out


if __name__ == "__main__":
    found = check(P.load(), json.loads(P.DONE.read_text()), json.loads(P.CATS.read_text()))
    if found:
        print("\n".join(found))
    print("listings checked:", len(P.listings()), "| problems:", len(found))
