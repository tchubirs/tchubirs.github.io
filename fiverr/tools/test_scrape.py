"""Scrape a small site served on this machine and compare every output with what the pages hold."""
import csv
import functools
import http.server
import json
import os
import sys
import tempfile
import threading

from openpyxl import load_workbook

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scrape  # noqa: E402

PAGES = {
    "robots.txt": "User-agent: *\nDisallow: /private/\n",
    "shop/page1.html": """<html><body>
<article class="p"><h3><a href="item/a.html" title="Alpha">Alpha</a></h3><p class="price">£1,234.50</p>
<p class="star-rating Three"></p></article>
<article class="p"><h3><a href="item/b.html" title="Beta">Beta</a></h3><p class="price">12,50 €</p></article>
<article class="p"><h3><a href="item/c.html" title="Gamma">Gamma</a></h3></article>
<ul><li class="next"><a href="page2.html">next</a></li></ul></body></html>""",
    "shop/page2.html": """<html><body>
<article class="p"><h3><a href="item/a.html" title="Alpha">Alpha</a></h3><p class="price">£1,234.50</p>
<p class="star-rating Three"></p></article>
<article class="p"><h3><a href="/shop/item/d.html" title="Delta">Delta
      Four</a></h3><p class="price">-3</p></article>
<ul><li class="next"><a href="page1.html">back to the first page</a></li></ul></body></html>""",
    "private/x.html": "<html><body><article class='p'><h3><a title='Hidden'>Hidden</a></h3></article></body></html>",
}


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def numbers():
    cases = {"£51.77": 51.77, "1.234,50 €": 1234.5, "1 234,50": 1234.5, "In stock (22 available)": 22,
             "−7": -7, "1,234": 1234, "12,50": 12.5, "none": None, "": None}
    for text, want in cases.items():
        assert scrape.number(text) == want, (text, scrape.number(text), want)
    print("numbers: all", len(cases), "read as expected")


def site():
    root = tempfile.mkdtemp()
    for path, body in PAGES.items():
        os.makedirs(os.path.dirname(os.path.join(root, path)) or root, exist_ok=True)
        with open(os.path.join(root, path), "w", encoding="utf-8") as f:
            f.write(body)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=root))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    job = {"start": base + "/shop/page1.html", "item": "article.p", "delay": 0, "numbers": ["price"],
           "fields": {"name": "h3 a@title", "text": "h3 a", "price": "p.price", "link": "h3 a@href",
                      "rating": "p.star-rating@class"},
           "next": "li.next a@href"}

    rows, stats = scrape.scrape(job, log=lambda *a: None)
    assert stats == {"pages": 2, "found": 5, "duplicates": 1}, stats
    assert [r["name"] for r in rows] == ["Alpha", "Beta", "Gamma", "Delta"], rows
    assert [r["price"] for r in rows] == [1234.5, 12.5, None, -3], rows
    assert rows[3]["text"] == "Delta Four", rows[3]
    assert rows[0]["rating"] == "star-rating Three" and rows[1]["rating"] == "", rows
    assert rows[0]["link"] == base + "/shop/item/a.html" and rows[3]["link"] == base + "/shop/item/d.html", rows

    out = os.path.join(root, "result")
    job_file = os.path.join(root, "job.json")
    with open(job_file, "w") as f:
        json.dump(job, f)
    assert scrape.main([job_file, "-o", out]) == 0
    wb = load_workbook(out + ".xlsx")
    sheet = [[c.value for c in r] for r in wb["Data"].iter_rows()]
    assert sheet[0] == ["name", "text", "price", "link", "rating"], sheet[0]
    assert [r[2] for r in sheet[1:]] == [1234.5, 12.5, None, -3], sheet
    about = {r[0].value: r[1].value for r in wb["About"].iter_rows()}
    assert about["Rows"] == 4 and about["Duplicate rows removed"] == 1 and about["Empty values in price"] == 1, about
    with open(out + ".csv", encoding="utf-8-sig") as f:
        assert len(list(csv.reader(f))) == 5
    with open(out + ".json", encoding="utf-8") as f:
        assert [r["name"] for r in json.load(f)] == ["Alpha", "Beta", "Gamma", "Delta"]
    print("site: 2 pages, 4 rows, 1 duplicate removed, the loop back to page 1 stopped, files match")

    hidden, stats = scrape.scrape(dict(job, start=base + "/private/x.html"), log=lambda *a: None)
    assert hidden == [] and stats["pages"] == 0, (hidden, stats)
    print("robots.txt: the disallowed page was not fetched")
    server.shutdown()


if __name__ == "__main__":
    numbers()
    site()
    print("all good")
