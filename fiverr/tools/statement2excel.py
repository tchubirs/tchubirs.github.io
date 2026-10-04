"""Bank statement PDF -> clean Excel (Transactions + Monthly summary + checks).

Used to fulfil the Fiverr gig "convert bank statement PDF to Excel". Works on
text-based PDFs (not scans). Every bank lays pages out differently, so this is
a strong first pass that is then checked against the statement's own totals.

Usage: python3 statement2excel.py statement.pdf [more.pdf ...] -o out.xlsx
       [--dates dmy|mdy] (default: guess from the data)

Separate debit and credit columns are read from the heading line (Debit/Credit, Withdrawals/Deposits,
Paid out/Paid in, Débit/Crédit, Cargos/Abonos and so on): a number under the debit heading is money out.
The opening and closing balance lines are not transactions; they go to the Checks sheet, where the
opening balance plus every movement must give the closing balance. Dates without a year move to the
next year when the statement crosses 31 December. Once a table with money columns has been read, the
heading of any other table (cheques, daily balances, a loan) ends it, and a second transaction table
after that, usually another account, is counted in the Checks sheet instead of being mixed in.
"""
import argparse
import datetime as dt
import re
import sys
import unicodedata

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
LEADING_DATE = re.compile(r"^\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\s+")   # the value date after the operation date
OPENING = re.compile(r"(?i)solde pr[ée]c[ée]dent|ancien solde|solde (initial|d'ouverture)|previous balance|"
                     r"opening balance|balance (brought )?forward|brought forward|saldo anterior|saldo inicial")
CLOSING = re.compile(r"(?i)nouveau solde|solde final|closing balance|new balance|ending balance|saldo final|"
                     r"saldo atual|saldo actual")
EITHER = re.compile(r"(?i)solde (cr[ée]diteur|d[ée]biteur|au)\b")   # opening before the transactions, closing after
CARRIED = re.compile(r"(?i)carried forward|[àa] reporter|report de la page|suma y sigue|a transportar|"
                     r"total des op[ée]rations|totaux")
HEADS = {"debit": "out", "debits": "out", "withdrawal": "out", "withdrawals": "out", "out": "out",
         "debito": "out", "debitos": "out", "retiros": "out", "cargos": "out", "saidas": "out",
         "levantamentos": "out", "depenses": "out",
         "credit": "in", "credits": "in", "deposit": "in", "deposits": "in", "in": "in", "credito": "in",
         "creditos": "in", "abonos": "in", "ingresos": "in", "entradas": "in", "depositos": "in",
         "recettes": "in",
         "balance": "balance", "solde": "balance", "saldo": "balance"}
DATE_WORDS = {"date", "dates", "fecha", "data", "datum"}
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


def plain_word(word):
    return unicodedata.normalize("NFKD", word).encode("ascii", "ignore").decode().lower().strip(".:()/")


def heading(words):
    """x positions of the money columns named on a heading line, or None when the line is not one."""
    names = [plain_word(w) for _, _, w, _, _ in words]
    if not DATE_WORDS & set(names):
        return None
    found = {}
    for (x0, x1, *_), name in zip(words, names):
        kind = HEADS.get(name)
        if kind and kind not in found:
            found[kind] = (x0, x1)
    return found if "out" in found and "in" in found else None


def foreign(words):
    """The heading of some other table: a date word among its first two words, no digits, no money columns."""
    names = [plain_word(w) for _, _, w, _, _ in words]
    return (len(names) >= 3 and bool(DATE_WORDS & set(names[:2]))
            and not any(c.isdigit() for _, _, w, _, _ in words for c in w))


def column(cols, words, m):
    """Which money column an amount sits in, or "text" when it is left of them all (part of the description)."""
    inside = [(x0, x1) for x0, x1, _, start, end in words if start < m.end() and end > m.start()]
    if not inside:
        return None
    x0, x1 = min(a for a, _ in inside), max(b for _, b in inside)
    if x1 < min(a for a, _ in cols.values()) - 20:
        return "text"
    return min(cols, key=lambda k: min(abs((cols[k][0] + cols[k][1]) / 2 - (x0 + x1) / 2), abs(cols[k][1] - x1)))


def signed(value, kind):
    return -abs(value) if kind == "out" else abs(value) if kind == "in" else value


def extract(paths, order=None):
    """Transactions as {date, desc, values, kinds}, the date order, the opening balance, every closing
    balance the statement prints, and how many other transaction tables were left out."""
    lines = []
    for p in paths:
        doc = pymupdf.open(p)
        for page in doc:
            # Rebuild visual lines: words sharing a baseline, left to right, with where each one sits.
            rows = {}
            for x0, y0, x1, y1, word, *_ in page.get_text("words"):
                rows.setdefault(round(y1 / 3), []).append((x0, x1, word))
            for key in sorted(rows):
                text, words = "", []
                for x0, x1, word in sorted(rows[key]):
                    text += " " if text else ""
                    words.append((x0, x1, word, len(text), len(text) + len(word)))
                    text += word
                lines.append((text, words))
    order = order or guess_order([text for text, _ in lines])
    year_hint = dt.date.today().year
    for text, _ in lines:
        y = re.search(r"\b(20\d{2})\b", text)
        if y:
            year_hint = int(y.group(1))
            break
    tx, cols, closed, extra, opening, closings, last = [], None, False, 0, None, [], None
    for line, words in lines:
        amounts = list(AMOUNT_RE.finditer(line))
        heads = None if amounts else heading(words)
        if heads:
            if closed and tx:
                extra += 1
            else:
                cols, closed = heads, False
            continue
        if cols and not amounts and foreign(words):
            cols, closed = None, True
            continue
        if closed:
            continue
        placed = [(a, parse_amount(a), column(cols, words, a) if cols else None) for a in amounts]
        placed = [p for p in placed if p[2] != "text"]
        if placed and (OPENING.search(line) or CLOSING.search(line) or EITHER.search(line) or CARRIED.search(line)):
            value = signed(*placed[-1][1:])
            if CARRIED.search(line):
                pass                                 # a page total or a balance carried to the next page
            elif OPENING.search(line) or (EITHER.search(line) and not tx):
                opening = value if not tx else opening   # the table's own line comes after any summary
            else:
                closings.append(value)
            continue
        dm = DATE_RE.match(line)
        if dm and placed:
            date = parse_date(dm, order, year_hint)
            yearless = not (dm.group("y") or dm.group("iy") or dm.group("ty"))
            if date and yearless and last and (last - date).days > 180:
                year_hint += 1                       # December, then January
                date = parse_date(dm, order, year_hint)
            if not date or (cols and all(k == "balance" for _, _, k in placed)):
                continue                             # no date, or a balance printed on a row of its own
            desc = LEADING_DATE.sub("", line[dm.end():placed[0][0].start()].strip(" -|"))
            after = [x0 for x0, _, _, start, _ in words if start >= dm.end()]
            tx.append({"date": date, "desc": desc, "values": [v for _, v, _ in placed],
                       "kinds": [k for _, _, k in placed], "desc_x": after[0] if after else None})
            last = date
        elif tx and line.strip() and not amounts and not dm:
            # A wrapped description starts under the description; a page heading starts at the margin.
            under = tx[-1]["desc_x"] is not None and words[0][0] >= tx[-1]["desc_x"] - 5
            if under and len(tx[-1]["desc"]) < 120 and not re.search(r"(?i)page \d|balance|solde|total", line):
                tx[-1]["desc"] = (tx[-1]["desc"] + " " + line.strip()).strip()
    return tx, order, opening, closings, extra


def columns(tx, opening=None):
    """Split each row's amounts into signed amount and running balance.

    With debit and credit columns, the column gives the sign. Otherwise two numbers on a row are
    amount and balance, and the sign of the amount comes from the balance movement when possible.
    """
    rows = []
    prev_bal = opening
    for t in tx:
        v, kinds = t["values"], t.get("kinds") or [None] * len(t["values"])
        if any(kinds):
            moves = [signed(x, k) for x, k in zip(v, kinds) if k in ("in", "out")]
            bals = [x for x, k in zip(v, kinds) if k == "balance"]
            amount, balance = sum(moves), (bals[-1] if bals else None)
        else:
            amount, balance = (v[0], None) if len(v) == 1 else (v[-2], v[-1])
        if balance is not None and prev_bal is not None and abs(abs(balance - prev_bal) - abs(amount)) < 0.005:
            amount = balance - prev_bal
        rows.append((t["date"], t["desc"], round(amount, 2), balance))
        if balance is not None:
            prev_bal = balance
    return rows


def write(rows, out, order, opening=None, closings=(), extra=0):
    wb = Workbook()
    ws = wb.active
    ws.title = "Transactions"
    head = ["Date", "Description", "Money in", "Money out", "Balance"]
    ws.append(head)
    for c in ws[1]:
        c.font = Font(name="Arial", bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", start_color="1F6F78")
    for d, desc, amount, bal in rows:
        ws.append([d, desc, amount if amount > 0 else None, -amount if amount < 0 else None, bal])
    for r in range(2, ws.max_row + 1):
        for c in range(1, 6):
            ws.cell(r, c).font = Font(name="Arial")
        ws.cell(r, 1).number_format = "yyyy-mm-dd"
        for c in (3, 4, 5):
            ws.cell(r, c).number_format = "#,##0.00"
    for i, w in enumerate([12, 40, 13, 13, 13], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:E{ws.max_row}"
    ws.page_setup.orientation = "landscape"  # prints on one page width
    ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True

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
    bals = ([(-1, opening)] if opening is not None else []) + [(i, b) for i, (_, _, _, b) in enumerate(rows)
                                                                if b is not None]
    mismatches = 0
    for (i0, b0), (i1, b1) in zip(bals, bals[1:]):
        moved = sum(rows[k][2] for k in range(i0 + 1, i1 + 1))
        if abs((b1 - b0) - moved) > 0.01:
            mismatches += 1
    closes, closing = "not checked", (closings[-1] if closings else None)
    if closings and bals:
        start, base = bals[-1]
        reached = base + sum(r[2] for r in rows[start + 1:])
        same = [c for c in closings if abs(reached - c) < 0.01]
        closing, closes = (same[0], "yes") if same else (closings[-1], "no")
        mismatches += closes == "no"
    ck.append(["Transactions", len(rows)])
    ck.append(["Date order used", order])
    ck.append(["Opening balance", opening if opening is not None else "not on the statement"])
    ck.append(["Closing balance", closing if closing is not None else "not on the statement"])
    ck.append(["Opening balance plus movements gives the closing balance", closes])
    ck.append(["Balance steps checked", max(0, len(bals) - 1)])
    ck.append(["Balance mismatches", mismatches])
    if extra:
        ck.append(["Other transaction tables left out", extra])
    ck.column_dimensions["A"].width = 52
    wb.save(out)
    return mismatches


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("pdfs", nargs="+")
    ap.add_argument("-o", "--out", default="statement.xlsx")
    ap.add_argument("--dates", choices=["dmy", "mdy"])
    a = ap.parse_args(argv)
    tx, order, opening, closings, extra = extract(a.pdfs, a.dates)
    rows = columns(tx, opening)
    bad = write(rows, a.out, order, opening, closings, extra)
    print(f"{len(rows)} transactions, dates {order}, balance mismatches {bad} -> {a.out}")
    return 0 if rows else 1


if __name__ == "__main__":
    sys.exit(main())
