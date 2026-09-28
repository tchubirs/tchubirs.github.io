"""Bank statement PDF -> clean Excel (Transactions + Monthly summary + checks).

Used to fulfil the Fiverr gig "convert bank statement PDF to Excel". Works on
text-based PDFs (not scans). Every bank lays pages out differently, so this is
a strong first pass that is then checked against the statement's own totals.

Usage: python3 statement2excel.py statement.pdf [more.pdf ...] -o out.xlsx
       [--dates dmy|mdy] (default: guess from the data)
"""
import argparse
import datetime as dt
import re
import sys

import pymupdf
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}
MONTHS.update({"fév": 2, "fev": 2, "avr": 4, "mai": 5, "juin": 6, "juil": 7, "aoû": 8, "aou": 8, "déc": 12})

DATE_RE = re.compile(
    r"^(?P<d>\d{1,2})[./-](?P<m>\d{1,2})(?:[./-](?P<y>\d{2,4}))?\b"         # 12/09/2026, 12.09.26, 12/09
    r"|^(?P<iy>\d{4})-(?P<im>\d{2})-(?P<id>\d{2})\b"                          # 2026-09-12
    r"|^(?P<td>\d{1,2})\s+(?P<tm>[A-Za-zéû]{3,4})\.?(?:\s+(?P<ty>\d{4}))?\b")  # 12 Sep 2026, 12 sept.
AMOUNT_RE = re.compile(
    r"(?<![\w.,])(?P<neg>[-−(])?\s?(?P<cur>[$€£])?\s?"
    r"(?P<num>\d{1,3}(?:[ ,.  ]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})"
    r"\)?\s?(?P<sign>CR|DR|Cr|Dr|-)?(?![\w])")


def parse_amount(m):
    num = m.group("num").replace(" ", "").replace(" ", "").replace(" ", "")
    if re.search(r"[.,]\d{2}$", num):
        whole, dec = num[:-3], num[-2:]
        whole = whole.replace(",", "").replace(".", "")
        value = float(f"{whole}.{dec}")
    else:
        value = float(num.replace(",", "").replace(".", ""))
    neg = m.group("neg") in ("-", "−", "(") or (m.group("sign") or "").upper() in ("DR", "-")
    return -value if neg else value


def parse_date(m, order, year_hint):
    if m.group("iy"):
        return dt.date(int(m.group("iy")), int(m.group("im")), int(m.group("id")))
    if m.group("td"):
        mon = MONTHS.get(m.group("tm")[:3].lower()) or MONTHS.get(m.group("tm").lower())
        if not mon:
            return None
        year = int(m.group("ty")) if m.group("ty") else year_hint
        return dt.date(year, mon, int(m.group("td")))
    a, b = int(m.group("d")), int(m.group("m"))
    y = m.group("y")
    year = year_hint if not y else (int(y) + 2000 if len(y) == 2 else int(y))
    day, month = (a, b) if order == "dmy" else (b, a)
    try:
        return dt.date(year, month, day)
    except ValueError:
        return None


def guess_order(lines):
    """dmy unless a first number above 12 never appears but a second one does."""
    first_big = second_big = 0
    for line in lines:
        m = re.match(r"^(\d{1,2})[./-](\d{1,2})", line)
        if m:
            first_big += int(m.group(1)) > 12
            second_big += int(m.group(2)) > 12
    return "mdy" if second_big > first_big else "dmy"


def extract(paths, order=None):
    lines = []
    for p in paths:
        doc = pymupdf.open(p)
        for page in doc:
            # Rebuild visual lines: words sharing a baseline, left to right.
            rows = {}
            for x0, y0, x1, y1, word, *_ in page.get_text("words"):
                rows.setdefault(round(y1 / 3), []).append((x0, word))
            for key in sorted(rows):
                lines.append(" ".join(w for _, w in sorted(rows[key])))
    order = order or guess_order(lines)
    year_hint = dt.date.today().year
    for line in lines:
        y = re.search(r"\b(20\d{2})\b", line)
        if y:
            year_hint = int(y.group(1))
            break
    tx = []
    for line in lines:
        dm = DATE_RE.match(line.strip())
        amounts = list(AMOUNT_RE.finditer(line))
        if dm and amounts:
            date = parse_date(dm, order, year_hint)
            if not date:
                continue
            desc = line[dm.end():amounts[0].start()].strip(" -|")
            values = [parse_amount(a) for a in amounts]
            tx.append({"date": date, "desc": desc, "values": values})
        elif tx and line.strip() and not amounts and not DATE_RE.match(line.strip()):
            if len(tx[-1]["desc"]) < 120 and not re.search(r"(?i)page \d|balance|solde|total", line):
                tx[-1]["desc"] = (tx[-1]["desc"] + " " + line.strip()).strip()
    return tx, order


def columns(tx):
    """Split each row's amounts into signed amount and running balance.

    Two numbers on a row = amount + balance; the sign of the amount comes from
    the balance movement when possible (debit and credit columns look alike).
    """
    rows = []
    prev_bal = None
    for t in tx:
        v = t["values"]
        amount, balance = (v[0], None) if len(v) == 1 else (v[-2], v[-1])
        if balance is not None and prev_bal is not None and abs(abs(balance - prev_bal) - abs(amount)) < 0.005:
            amount = balance - prev_bal
        rows.append((t["date"], t["desc"], amount, balance))
        if balance is not None:
            prev_bal = balance
    return rows


def write(rows, out, order):
    wb = Workbook()
    ws = wb.active
    ws.title = "Transactions"
    head = ["Date", "Description", "Money in", "Money out", "Balance"]
    ws.append(head)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", start_color="1F6F78")
    for d, desc, amount, bal in rows:
        ws.append([d, desc, amount if amount > 0 else None, -amount if amount < 0 else None, bal])
    for r in range(2, ws.max_row + 1):
        ws.cell(r, 1).number_format = "yyyy-mm-dd"
        for c in (3, 4, 5):
            ws.cell(r, c).number_format = "#,##0.00"
    for i, w in enumerate([12, 60, 14, 14, 14], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:E{ws.max_row}"

    sm = wb.create_sheet("Monthly summary")
    sm.append(["Month", "Money in", "Money out", "Net"])
    months = sorted({(d.year, d.month) for d, *_ in rows})
    for y, m in months:
        inn = sum(a for d, _, a, _ in rows if (d.year, d.month) == (y, m) and a > 0)
        out_ = -sum(a for d, _, a, _ in rows if (d.year, d.month) == (y, m) and a < 0)
        sm.append([f"{y}-{m:02d}", round(inn, 2), round(out_, 2), round(inn - out_, 2)])
    for c in sm[1]:
        c.font = Font(bold=True)
    for i in (1, 2, 3, 4):
        sm.column_dimensions[get_column_letter(i)].width = 14

    ck = wb.create_sheet("Checks")
    bals = [(i, b) for i, (_, _, _, b) in enumerate(rows) if b is not None]
    mismatches = 0
    for (i0, b0), (i1, b1) in zip(bals, bals[1:]):
        moved = sum(rows[k][2] for k in range(i0 + 1, i1 + 1))
        if abs((b1 - b0) - moved) > 0.01:
            mismatches += 1
    ck.append(["Transactions", len(rows)])
    ck.append(["Date order used", order])
    ck.append(["Balance steps checked", max(0, len(bals) - 1)])
    ck.append(["Balance mismatches", mismatches])
    wb.save(out)
    return mismatches


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("pdfs", nargs="+")
    ap.add_argument("-o", "--out", default="statement.xlsx")
    ap.add_argument("--dates", choices=["dmy", "mdy"])
    a = ap.parse_args(argv)
    tx, order = extract(a.pdfs, a.dates)
    rows = columns(tx)
    bad = write(rows, a.out, order)
    print(f"{len(rows)} transactions, dates {order}, balance mismatches {bad} -> {a.out}")
    return 0 if rows else 1


if __name__ == "__main__":
    sys.exit(main())
