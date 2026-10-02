"""Public web pages -> Excel, CSV and JSON. Used to fulfil the Fiverr gig "web scraping".

A small JSON file describes the job: where to start, which block is one item, which fields to take
from it and how to reach the next page. Every site is different, so a new order usually needs a new
job file and nothing else.

Usage: python3 scrape.py job.json -o out        writes out.xlsx, out.csv and out.json
       (needs: pip install beautifulsoup4 requests openpyxl; example-job.json is a working job)

    {
      "start": "https://books.toscrape.com/",
      "item": "article.product_pod",
      "fields": {"title": "h3 a@title", "price": "p.price_color", "link": "h3 a@href"},
      "numbers": ["price"],
      "next": "li.next a@href",
      "max_pages": 50,
      "delay": 1
    }

A field is a CSS selector inside the item, and "@name" at the end takes that attribute instead of
the text. Links come out as full addresses. "start" can also be a list of pages. The fields named in
"numbers" become real numbers in Excel. The run stops at the page limit, when there is no next page,
or when the site's robots.txt does not allow the page.

Optional keys (example-detail-job.json uses the first one):
  "detail": {"link": "link", "fields": {"upc": "table tr td"}}
        opens the page in each row's "link" field and adds these fields, read from that whole page.
        A page that fails or that robots.txt keeps out leaves them empty, and the About sheet counts it.
  "render": true
        opens every page in headless Chromium first, for sites that build their content with
        JavaScript (needs: pip install playwright)
  "wait_for": "article.item"
        with "render", waits until this selector is on the page
  "key": "link"
        rows with the same value in this list field are duplicates (by default the whole row must match)
"""
import argparse
import csv
import datetime as dt
import json
import re
import sys
import time
import urllib.parse
import urllib.robotparser

import requests
from bs4 import BeautifulSoup
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

AGENT = "Mozilla/5.0 (compatible; scrape.py data export)"
RETRY = (429, 500, 502, 503, 504)


def pick(node, rule, base):
    """The text, or with "@attr" the attribute, of the first match of a CSS selector inside node."""
    css, _, attr = rule.rpartition("@") if "@" in rule else (rule, "", "")
    el = node.select_one(css) if css.strip() else node
    if el is None:
        return ""
    if attr:
        value = el.get(attr) or ""
        if isinstance(value, list):     # class and rel come back as a list of words
            value = " ".join(value)
        value = value.strip()
        return urllib.parse.urljoin(base, value) if value and attr in ("href", "src") else value
    return " ".join(el.get_text(" ", strip=True).split())


def number(text):
    """'£1,234.50', '1.234,50 €' or '-3' as a float; None when there is no number in it."""
    m = re.search("[-−]?\\d[\\d.,\\s]*", text or "")
    if not m:
        return None
    raw = re.sub(r"\s", "", m.group())
    negative = raw[0] in "-−"
    raw = raw.lstrip("-−").rstrip(".,")
    if "," in raw and "." in raw:          # the last one is the decimal mark
        dec = "," if raw.rfind(",") > raw.rfind(".") else "."
        raw = raw.replace("." if dec == "," else ",", "").replace(dec, ".")
    elif "," in raw:                        # 1,234 is thousands, 12,50 is decimals
        whole, _, tail = raw.rpartition(",")
        raw = raw.replace(",", "") if len(tail) == 3 else whole.replace(",", "") + "." + tail
    try:
        value = float(raw)
    except ValueError:
        return None
    return -value if negative else value


def columns(job):
    extra = job.get("detail", {}).get("fields", {})
    return list(job["fields"]) + [name for name in extra if name not in job["fields"]]


class Fetcher:
    errors = (requests.RequestException,)   # what a page that cannot be read raises

    def __init__(self, delay=1.0, agent=AGENT):
        self.delay, self.session, self.robots, self.last = delay, requests.Session(), {}, 0.0
        self.session.headers["User-Agent"] = agent

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def close(self):
        self.session.close()

    def allowed(self, url):
        root = "{0.scheme}://{0.netloc}".format(urllib.parse.urlparse(url))
        if root not in self.robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                r = self.session.get(root + "/robots.txt", timeout=30)
                rp.parse(r.text.splitlines() if r.status_code == 200 else [])
                rp.disallow_all = r.status_code in (401, 403)   # the same reading as urllib's own read()
            except requests.RequestException:
                rp.parse([])
            self.robots[root] = rp
        return self.robots[root].can_fetch(self.session.headers["User-Agent"], url)

    def pause(self):
        wait = self.last + self.delay - time.time()
        if wait > 0:
            time.sleep(wait)
        self.last = time.time()

    def get(self, url):
        for attempt in range(4):
            self.pause()
            r = self.session.get(url, timeout=60)
            if r.status_code not in RETRY:
                break
            time.sleep(2 ** (attempt + 1))
        r.raise_for_status()
        return r.text


class Browser(Fetcher):
    """For sites that build their pages with JavaScript: the same as Fetcher, but every page is opened in
    headless Chromium and read once it has loaded. robots.txt is still read the plain way."""

    def __init__(self, delay=1.0, agent=AGENT, wait_for=None):
        super().__init__(delay, agent)
        from playwright.sync_api import Error, TimeoutError, sync_playwright   # only needed here
        self.errors, self.timeout, self.wait_for = (requests.RequestException, Error), TimeoutError, wait_for
        self.pw = sync_playwright().start()
        self.browser = self.pw.chromium.launch()
        self.page = self.browser.new_page(user_agent=agent)

    def close(self):
        self.browser.close()
        self.pw.stop()
        super().close()

    def get(self, url):
        for attempt in range(4):
            self.pause()
            r = self.page.goto(url, wait_until="load", timeout=60000)
            status = r.status if r else 200
            if status not in RETRY:
                break
            time.sleep(2 ** (attempt + 1))
        if status >= 400:
            raise requests.HTTPError(f"{status} for {url}")
        if self.wait_for:
            self.page.wait_for_selector(self.wait_for, timeout=30000)
        else:
            try:
                self.page.wait_for_load_state("networkidle", timeout=10000)
            except self.timeout:
                pass    # some sites never go quiet; what has loaded by now is used
        return self.page.content()


def scrape(job, fetcher=None, log=print):
    if fetcher:
        return collect(job, fetcher, log)
    settings = job.get("delay", 1), job.get("user_agent", AGENT)
    with Browser(*settings, job.get("wait_for")) if job.get("render") else Fetcher(*settings) as fetcher:
        return collect(job, fetcher, log)


def collect(job, fetcher, log):
    queue = [job["start"]] if isinstance(job["start"], str) else list(job["start"])
    seen, rows, pages = set(), [], 0
    while queue and pages < job.get("max_pages", 50):
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        if not fetcher.allowed(url):
            log(f"robots.txt does not allow {url}, stopping there")
            break
        soup = BeautifulSoup(fetcher.get(url), "html.parser")
        pages += 1
        for node in soup.select(job["item"]):
            rows.append({name: pick(node, rule, url) for name, rule in job["fields"].items()})
        nxt = pick(soup, job["next"], url) if job.get("next") else ""
        if nxt and nxt not in seen:
            queue.insert(0, nxt)
    key = job.get("key")
    unique, keys = [], set()
    for row in rows:
        k = row[key] if key else tuple(row.values())
        if k not in keys:
            keys.add(k)
            unique.append(row)
    stats = {"pages": pages, "found": len(rows), "duplicates": len(rows) - len(unique)}
    if job.get("detail"):
        stats.update(details(job["detail"], unique, fetcher, log))
    for row in unique:
        for name in job.get("numbers", []):
            row[name] = number(row[name])
    return unique, stats


def details(detail, rows, fetcher, log):
    """Opens the page in each row's link field and adds the detail fields, read from that whole page."""
    read = 0
    for i, row in enumerate(rows, start=1):
        url, soup = row[detail["link"]], None
        if url and not fetcher.allowed(url):
            log(f"robots.txt does not allow {url}, its detail fields stay empty")
        elif url:
            try:
                soup = BeautifulSoup(fetcher.get(url), "html.parser")
                read += 1
            except fetcher.errors as e:
                log(f"could not read {url} ({e}), its detail fields stay empty")
        for name, rule in detail["fields"].items():
            row[name] = pick(soup, rule, url) if soup else ""
        if i % 100 == 0:
            log(f"detail pages: {i} of {len(rows)}")
    return {"details": read, "details_missing": len(rows) - read}


def write(rows, stats, job, out):
    names = columns(job)
    missing = {c: sum(1 for r in rows if r[c] in ("", None)) for c in names}

    wb = Workbook()
    ws = wb.active
    ws.title = "Data"
    ws.append(names)
    for c in ws[1]:
        c.font = Font(name="Arial", bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", start_color="1F6F78")
    for row in rows:
        ws.append([row[c] for c in names])
    for i, name in enumerate(names, start=1):
        longest = max([len(str(name))] + [len(str(r[name] or "")) for r in rows[:500]])
        ws.column_dimensions[get_column_letter(i)].width = min(60, max(10, longest + 2))
        if name in job.get("numbers", []):
            for (cell,) in ws.iter_rows(min_row=2, min_col=i, max_col=i):
                cell.number_format = "#,##0.00"
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(names))}{ws.max_row}"

    about = wb.create_sheet("About")
    start = job["start"] if isinstance(job["start"], str) else job["start"][0]
    lines = [("Source", start), ("Extracted", dt.date.today().isoformat()), ("Pages read", stats["pages"]),
             ("Rows", len(rows)), ("Duplicate rows removed", stats["duplicates"])]
    if "details" in stats:
        lines += [("Detail pages read", stats["details"]), ("Detail pages not read", stats["details_missing"])]
    for line in lines + [(f"Empty values in {c}", n) for c, n in missing.items()]:
        about.append(line)
    about.column_dimensions["A"].width = 32
    about.column_dimensions["B"].width = 60
    for (cell,) in about.iter_rows(max_col=1):
        cell.font = Font(bold=True)
    wb.save(f"{out}.xlsx")

    with open(f"{out}.csv", "w", newline="", encoding="utf-8-sig") as f:   # the BOM makes Excel read UTF-8
        w = csv.DictWriter(f, fieldnames=names)
        w.writeheader()
        w.writerows(rows)
    with open(f"{out}.json", "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    return missing


def main(argv=None):
    ap = argparse.ArgumentParser(description="Public web pages to Excel, CSV and JSON.")
    ap.add_argument("job", help="the job file (JSON)")
    ap.add_argument("-o", "--out", default="data", help="output name without extension")
    a = ap.parse_args(argv)
    with open(a.job, encoding="utf-8") as f:
        job = json.load(f)
    rows, stats = scrape(job)
    missing = write(rows, stats, job, a.out)
    dup = stats["duplicates"]
    print(f"{len(rows)} rows from {stats['pages']} pages, {dup} duplicate{'' if dup == 1 else 's'} removed")
    if "details" in stats:
        print(f"  {stats['details']} detail pages read, {stats['details_missing']} not read")
    for name, n in missing.items():
        if n:
            print(f"  {n} empty values in {name}")
    print(f"wrote {a.out}.xlsx, {a.out}.csv and {a.out}.json")
    return 0 if rows else 1


if __name__ == "__main__":
    sys.exit(main())
