"""How shops like ours do on Etsy. For a few searches it takes the shops behind the first 100 results and groups
them by age, with how many have sold anything. It answers "does a new shop sell at all?" with numbers.

    python3 etsy/market.py            about 5 minutes, then prints the table
    python3 etsy/market.py niches     how many listings compete with each of ours in a buyer's search, fewest first

Uses the same keys as publish.py and only reads public data. Shops that gave up and took their listings down
are not in the results, so the real numbers are somewhat lower than these.
"""
import sys
import time

import publish as P

WORDS = ["budget spreadsheet", "adhd budget spreadsheet", "google sheets budget template",
         "cash stuffing spreadsheet", "debt payoff spreadsheet", "wedding budget spreadsheet",
         "landlord rental property spreadsheet", "small business spreadsheet template"]
AGES = [(0, 30), (30, 60), (60, 120), (120, 365), (365, None)]  # shop age in days
BIG = 30   # a catalog about the size of ours (44 listings)
EVEN = 6   # sales that pay back what opening the shop cost
DAY = 86400
# What a buyer would type for a listing, where its first tag alone reads oddly. The bundle has no search of its own.
SEARCH = {"subscriptions": "subscription tracker", "fees": "etsy fee calculator", "food-batches": "bakery inventory",
          "trainer": "personal trainer client tracker", "glucose": "blood sugar log", "rental": "vacation rental",
          "trip-split": "split expenses", "house-bills": "roommate bills", "freelancer": "freelancer tax tracker",
          "maker-orders": "order tracker", "net-worth": "net worth tracker", "envelopes": "cash stuffing",
          "teacher": "teacher planner", "landlord": "landlord", "bundle": None}


def shops(s):
    ids = set()
    for word in WORDS:
        r = P.call(s, "GET", "/listings/active", params={"keywords": word, "limit": 100, "sort_on": "score"})
        ids |= {li["shop_id"] for li in r["results"]}
    found = (P.call(s, "GET", f"/shops/{i}", allow=(404,)) for i in sorted(ids))
    return [sh for sh in found if sh]


def line(label, group):
    def part(n):
        return f"{n:>3} ({100 * n / len(group):.0f}%)" if group else "  -"
    sold = sum(sh["transaction_sold_count"] > 0 for sh in group)
    even = sum(sh["transaction_sold_count"] >= EVEN for sh in group)
    return f"{label:<20} {len(group):>4} shops   sold once or more: {part(sold)}   sold {EVEN} or more: {part(even)}"


def main():
    s = P.load()
    now = time.time()
    everyone = shops(s)
    for lo, hi in AGES:
        group = [sh for sh in everyone if lo * DAY <= now - sh["create_date"] < (hi or 10 ** 6) * DAY]
        print(line(f"{lo} to {hi} days" if hi else f"over {lo} days", group))
        print(line(f"  with {BIG}+ listings", [sh for sh in group if sh["listing_active_count"] >= BIG]))


def niches():
    """Few competitors is where a new shop, with no reviews yet, still shows up in search. The favorites that
    the first 100 results carry are a rough sign that people look for the thing at all."""
    s = P.load()
    rows = []
    for li in P.listings():
        words = SEARCH.get(li["folder"], li["tags"][0])
        if words is None:
            continue
        words += " spreadsheet"
        r = P.call(s, "GET", "/listings/active", params={"keywords": words, "limit": 100, "sort_on": "score"})
        rows.append((r["count"], sum(x["num_favorers"] for x in r["results"]), li["n"], words))
    for count, favorites, n, words in sorted(rows):
        print(f"{n:>3}  {count:>7} listings  {favorites:>6} favorites on the first 100   {words}")


if __name__ == "__main__":
    niches() if sys.argv[1:] == ["niches"] else main()
