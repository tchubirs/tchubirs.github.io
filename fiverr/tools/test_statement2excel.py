"""Round-trip test: draw synthetic statements (EU, US, French and UK layouts), extract, compare; then
scan them and read them back with OCR."""
import contextlib
import csv
import datetime as dt
import io
import json
import os
import random
import shutil
import sys
import tempfile
from difflib import SequenceMatcher

import numpy as np
import pymupdf
from openpyxl import load_workbook
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audit_sheet  # noqa: E402
import statement2excel as s2e  # noqa: E402

SHOPS = ["CARREFOUR MARKET", "SNCF VOYAGES", "AMAZON EU SARL", "PHARMACIE CENTRALE", "SALAIRE ACME SAS",
         "LOYER AGENCE DU PORT", "BOULANGERIE PAUL", "FREE MOBILE", "VIREMENT MAMAN", "UBER EATS"]


def fmt(x, eu):
    s = f"{abs(x):,.2f}"
    if eu:
        s = s.replace(",", " ").replace(".", ",").replace(" ", ".")
    return ("-" if x < 0 else "") + s


def make(path, eu, n=45, seed=1):
    rnd = random.Random(seed)
    bal = 1200.00
    truth = []
    doc = pymupdf.open()
    page, y = None, 0
    day = dt.date(2026, 7, 1)
    for i in range(n):
        if page is None or y > 760:
            page = doc.new_page()
            page.insert_text((50, 40), "RELEVE DE COMPTE" if eu else "ACCOUNT STATEMENT", fontsize=12)
            page.insert_text((50, 60), f"Page {doc.page_count}", fontsize=8)
            page.insert_text((50, 90), "Date      Libelle / Description                         Montant     Solde",
                             fontsize=8)
            y = 110
        day += dt.timedelta(days=rnd.randint(0, 2))
        shop = rnd.choice(SHOPS)
        amount = round(rnd.uniform(2100, 2400), 2) if shop.startswith("SALAIRE") else -round(rnd.uniform(3, 180), 2)
        bal = round(bal + amount, 2)
        truth.append((day, amount, bal))
        date_s = day.strftime("%d/%m/%Y") if eu else day.strftime("%m/%d/%Y")
        page.insert_text((50, y), date_s, fontsize=9)
        page.insert_text((115, y), f"{'CB ' if amount < 0 else ''}{shop}", fontsize=9)
        page.insert_text((400, y), fmt(amount, eu), fontsize=9)
        page.insert_text((480, y), fmt(bal, eu), fontsize=9)
        y += 14
        if i % 7 == 3:  # a wrapped description line
            page.insert_text((115, y), "REF 8841-" + str(i), fontsize=8)
            y += 12
    doc.save(path)
    return truth


def check(eu):
    with tempfile.TemporaryDirectory() as tmp:
        pdf, out = os.path.join(tmp, "s.pdf"), os.path.join(tmp, "s.xlsx")
        truth = make(pdf, eu, seed=7 if eu else 11)
        assert s2e.main([pdf, "-o", out]) == 0
        wb = load_workbook(out)
        ws = wb["Transactions"]
        got = [(r[0].value.date() if hasattr(r[0].value, "date") else r[0].value,
                (r[2].value or 0) - (r[3].value or 0), r[4].value) for r in ws.iter_rows(min_row=2)]
        assert len(got) == len(truth), (len(got), len(truth))
        for (gd, ga, gb), (td, ta, tb) in zip(got, truth):
            assert gd == td, (gd, td)
            assert abs(ga - ta) < 0.005, (ga, ta)
            assert abs(gb - tb) < 0.005, (gb, tb)
        checks = {r[0].value: r[1].value for r in wb["Checks"].iter_rows()}
        assert checks["Balance mismatches"] == 0, checks
        descs = [r[1].value or "" for r in ws.iter_rows(min_row=2)]
        assert any("REF 8841" in d for d in descs), "wrapped line lost"
        assert not [d for d in descs if "RELEVE" in d or "STATEMENT" in d], "a page heading went into a description"
        print(("EU" if eu else "US"), "layout:", len(got), "transactions match, balances reconcile")


def make_columns(path, us, n=40, seed=3, split=False):
    """Money out and money in in separate columns, without signs, between opening and closing balance lines.
    French: no balance column, dates without a year from December to January, a value date after each
    date and an amount inside one description. US: a balance column carried to the next page, a summary
    above the table whose previous balance is not the table's, then a daily balance table and a savings
    account with the same columns, which must stay out. With `split`, the heading of the later pages is on
    two lines, the first of which looks like the heading of some other table."""
    rnd = random.Random(seed)
    opening = bal = 1234.56
    truth = []
    doc = pymupdf.open()
    out_x, in_x, bal_x = (360, 430, 500) if us else (400, 470, None)
    state = {"page": None, "y": 0}

    def put(x, text):
        state["page"].insert_text((x, state["y"]), text, fontsize=9)

    def new_page():
        if state["page"] is not None and us:
            put(115, "BALANCE CARRIED FORWARD")
            put(bal_x, fmt(bal, False))
        state["page"], state["y"] = doc.new_page(), 40
        put(50, "ACCOUNT STATEMENT 12/01/2026 to 01/31/2027" if us else "RELEVE DE COMPTE du 01/12/2026 au 31/01/2027")
        state["y"] = 70
        heads = ([(50, "Date"), (115, "Description"), (out_x, "Withdrawals"), (in_x, "Deposits"), (bal_x, "Balance")]
                 if us else [(50, "Date"), (95, "Valeur"), (140, "Libellé"), (out_x, "Débit"), (in_x, "Crédit")])
        if split and doc.page_count > 1:
            heads = heads[:2] + [(250, "Reference")]
            for x, word in [(out_x, "Withdrawals"), (in_x, "Deposits"), (bal_x, "Balance")]:
                state["y"] = 80
                put(x, word)
            state["y"] = 70
        for x, word in heads:
            put(x, word)
        state["y"] = 90
        if us:
            put(115, "BALANCE BROUGHT FORWARD")
            put(bal_x, fmt(bal, False))
            state["y"] += 14

    new_page()
    if not us:
        put(140, "SOLDE PRECEDENT AU 30/11/2026")
        put(in_x, fmt(opening, True))
        state["y"] += 14
    day = dt.date(2026, 12, 1)
    for i in range(n):
        if state["y"] > 600:
            new_page()
        day += dt.timedelta(days=rnd.randint(0, 2))
        pay = day.day in (5, 6) and not any(t[0].month == day.month and t[1] > 0 for t in truth)
        shop = "VIR SALAIRE ACME" if pay else ("RETRAIT DAB 50,00" if i == 9 else "CB " + rnd.choice(SHOPS))
        amount = 2150.00 if pay else (-50.00 if i == 9 else -round(rnd.uniform(3, 180), 2))
        bal = round(bal + amount, 2)
        truth.append((day, amount, bal if us else None))
        if us:
            put(50, day.strftime("%m/%d/%Y"))
            put(115, shop)
        else:
            put(50, day.strftime("%d/%m"))
            put(95, (day + dt.timedelta(days=rnd.randint(0, 2))).strftime("%d/%m"))
            put(140, shop)
        put(in_x if amount > 0 else out_x, fmt(abs(amount), not us))
        if us:
            put(bal_x, fmt(bal, False))
        state["y"] += 14
    if not us:
        put(140, "TOTAL DES OPERATIONS")
        put(out_x, fmt(-sum(t[1] for t in truth if t[1] < 0), True))
        put(in_x, fmt(sum(t[1] for t in truth if t[1] > 0), True))
        state["y"] += 14
    put(115 if us else 140, "CLOSING BALANCE" if us else "NOUVEAU SOLDE AU 31/01/2027")
    put(bal_x if us else (in_x if bal > 0 else out_x), fmt(abs(bal), not us))
    if us:
        first = doc[0]
        first.insert_text((50, 50), "Previous balance $999.99", fontsize=9)
        first.insert_text((50, 60), f"Ending balance ${fmt(bal, False)}", fontsize=9)
        heads = [(50, "Date"), (115, "Description"), (out_x, "Withdrawals"), (in_x, "Deposits"), (bal_x, "Balance")]
        for x_words in ([(50, "DAILY BALANCE SUMMARY")],
                        [(50, "Date"), (150, "Amount"), (250, "Date"), (350, "Amount")],
                        [(50, "12/01/2026"), (150, "$1,100.00"), (250, "12/02/2026"), (350, "$900.00")],
                        [(50, "SAVINGS Account Number: 9999")], heads,
                        [(50, "12/15/2026"), (115, "TRANSFER"), (in_x, "100.00"), (bal_x, "2,000.00")]):
            state["y"] += 14
            for x, word in x_words:
                put(x, word)
    doc.save(path)
    return truth, opening, bal


def check_columns(us, split=False):
    with tempfile.TemporaryDirectory() as tmp:
        pdf, out = os.path.join(tmp, "c.pdf"), os.path.join(tmp, "c.xlsx")
        truth, opening, closing = make_columns(pdf, us, split=split)
        assert s2e.main([pdf, "-o", out]) == 0
        wb = load_workbook(out)
        ws = wb["Transactions"]
        got = [(r[0].value.date(), (r[2].value or 0) - (r[3].value or 0), r[4].value, r[1].value)
               for r in ws.iter_rows(min_row=2)]
        assert len(got) == len(truth), (len(got), len(truth))
        for (gd, ga, gb, desc), (td, ta, tb) in zip(got, truth):
            assert (gd, round(ga, 2), gb) == (td, ta, tb), ((gd, ga, gb, desc), (td, ta, tb))
            assert not s2e.LEADING_DATE.match(desc or ""), desc
            assert not any(w in (desc or "") for w in ("RELEVE", "STATEMENT", "BALANCE", "Date")), desc
        assert got[-1][0].year == 2027 and any(g[3] == "RETRAIT DAB 50,00" for g in got) or us, got[-3:]
        checks = {r[0].value: r[1].value for r in wb["Checks"].iter_rows()}
        assert (checks["Opening balance"], checks["Closing balance"]) == (opening, closing), checks
        assert checks["Opening balance plus movements gives the closing balance"] == "yes", checks
        assert checks["Balance mismatches"] == 0, checks
        assert checks["Balance steps checked"] == (len(truth) if us else 0), checks
        assert checks.get("Other transaction tables left out") == (1 if us else None), checks
        print(("US withdrawals and deposits" if us else "French debit and credit") + " columns"
              + (", heading on two lines after page 1" if split else "") + ":", len(got),
              "transactions with the right sign, opening and closing balances agree")


def check_bank_header():
    """A bank name and a card line above the table ("CREDIT AGRICOLE", "Carte de debit", "Date d'arret")
    must not be taken for the money columns of a statement that has one amount column."""
    with tempfile.TemporaryDirectory() as tmp:
        pdf, out = os.path.join(tmp, "s.pdf"), os.path.join(tmp, "s.xlsx")
        truth = make(pdf, eu=True, seed=7)
        doc = pymupdf.open(pdf)
        for page in doc:
            for y, text in ((18, "CREDIT AGRICOLE"), (26, "Carte de débit"), (34, "Date d'arrêté du relevé")):
                page.insert_text((50, y), text, fontsize=8)
        doc.saveIncr()
        with contextlib.redirect_stdout(io.StringIO()):
            assert s2e.main([pdf, "-o", out]) == 0
        got = [(r[0].date(), round((r[2] or 0) - (r[3] or 0), 2), r[4])
               for r in load_workbook(out)["Transactions"].iter_rows(min_row=2, values_only=True)]
        assert got == truth, [(g, t) for g, t in zip(got, truth) if g != t][:3]
    print("bank name above the table: not taken for debit and credit columns")


UK_SHOPS = ["TESCO STORES 2041", "CARD PAYMENT TO COSTA COFFEE", "DIRECT DEBIT EE LIMITED", "TFL TRAVEL CH",
            "AMAZON MKTPLACE", "2 FOR 1 PIZZA CO"]


def make_uk(path, n=36, seed=5):
    """A UK layout: the heading spread over three lines (Paid above out and in), dates like 3 February only
    on the first row of each day, and the balance brought forward at the top and carried forward at the end."""
    rnd = random.Random(seed)
    opening = bal = 2500.00
    truth = []
    doc = pymupdf.open()
    page = doc.new_page()

    def put(x, y, text):
        page.insert_text((x, y), text, fontsize=9)

    put(50, 40, "Your statement 1 February to 1 March 2026")
    for x, y, word in [(330, 70, "Paid"), (400, 70, "Paid"), (50, 80, "Date"), (110, 80, "Description"),
                       (330, 90, "out"), (400, 90, "in"), (470, 90, "Balance")]:
        put(x, y, word)
    y = 110
    put(110, y, "Balance brought forward")
    put(470, y, fmt(bal, False))
    day, shown = dt.date(2026, 2, 1), None
    for i in range(n):
        y += 14
        day += dt.timedelta(days=rnd.choice([0, 0, 1, 2]))
        amount = 2400.00 if i == 10 else -round(rnd.uniform(2, 120), 2)
        bal = round(bal + amount, 2)
        truth.append((day, amount, bal))
        if day != shown:
            put(50, y, f"{day.day} {day.strftime('%B')}")
            shown = day
        put(110, y, "SALARY ACME LTD" if i == 10 else rnd.choice(UK_SHOPS))
        put(330 if amount < 0 else 400, y, fmt(abs(amount), False))
        put(470, y, fmt(bal, False))
    put(110, y + 14, "Balance carried forward")
    put(470, y + 14, fmt(bal, False))
    doc.save(path)
    return truth, opening, bal


def check_uk():
    with tempfile.TemporaryDirectory() as tmp:
        pdf, out = os.path.join(tmp, "uk.pdf"), os.path.join(tmp, "uk.xlsx")
        truth, opening, closing = make_uk(pdf)
        with contextlib.redirect_stdout(io.StringIO()):
            assert s2e.main([pdf, "-o", out]) == 0
        wb = load_workbook(out)
        got = [(r[0].date(), round((r[2] or 0) - (r[3] or 0), 2), r[4], r[1])
               for r in wb["Transactions"].iter_rows(min_row=2, values_only=True)]
        assert [g[:3] for g in got] == truth, [(g, t) for g, t in zip(got, truth) if g[:3] != t][:3]
        assert any(g[3] == "2 FOR 1 PIZZA CO" for g in got), "a description that starts like a date was lost"
        checks = {r[0].value: r[1].value for r in wb["Checks"].iter_rows()}
        assert (checks["Opening balance"], checks["Closing balance"]) == (opening, closing), checks
        assert checks["Opening balance plus movements gives the closing balance"] == "yes", checks
        assert checks["Balance mismatches"] == 0, checks
    shared = sum(1 for a, b in zip(truth, truth[1:]) if a[0] == b[0])
    print(f"UK layout: {len(got)} transactions, {shared} of them without a printed date, the heading on three "
          "lines, balances brought and carried forward")


EXPECTED = {"CARREFOUR MARKET": "Groceries", "SNCF VOYAGES": "Transport", "AMAZON EU SARL": "Shopping",
            "PHARMACIE CENTRALE": "Health", "SALAIRE ACME SAS": "Salary and income",
            "LOYER AGENCE DU PORT": "Housing", "BOULANGERIE PAUL": "Groceries", "FREE MOBILE": "Phone and internet",
            "VIREMENT MAMAN": "Transfers", "UBER EATS": "Restaurants and takeaway"}


def check_rules():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "rules.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"Health": ["pharmac*"], "Going out": ["bar"], "Food": ["épicerie"]}, f)
        rules = s2e.load_rules(path)
        rows = [(None, d, 0, None) for d in ["CB PHARMACIE DU PORT", "BARCLAYS FEE", "BAR TABAC", "EPICERIE FINE", "X"]]
        assert s2e.categorise(rows, rules) == ["Health", "", "Going out", "Food", ""]
    print("category rules: whole words, a * for longer words, accents and capitals ignored")


def check_categories():
    """Categories on the EU statement, the By category formulas recalculated in LibreOffice, and CSV."""
    with tempfile.TemporaryDirectory() as tmp:
        pdf, out, out_csv = (os.path.join(tmp, name) for name in ("s.pdf", "s.xlsx", "s.csv"))
        make(pdf, eu=True, seed=7)
        assert s2e.main([pdf, "-o", out, "--categories", "--date-format", "dd/mm/yyyy"]) == 0
        wb = load_workbook(out)
        ws = wb["Transactions"]
        assert [c.value for c in ws[1]][-1] == "Category" and ws["A2"].number_format == "dd/mm/yyyy"
        rows = list(ws.iter_rows(min_row=2, values_only=True))
        for r in rows:
            shop = next(k for k in EXPECTED if k in r[1])
            assert r[5] == EXPECTED[shop], (r[1], r[5])
        assert {r[0].value: r[1].value for r in wb["Checks"].iter_rows()}["Rows without a category, under Other"] == 0

        found = audit_sheet.audit_files([out])[0]
        assert not found["must_fix"] and not found["odd"], found
        calc = load_workbook(audit_sheet.recalculate([out], tempfile.mkdtemp(dir=tmp))[0], data_only=True)
        totals = {r[0]: r[1:] for r in calc["By category"].iter_rows(min_row=2, values_only=True)}
        assert set(totals) == set(EXPECTED.values()), totals
        for name, (inn, out_, net, count) in totals.items():
            mine = [r for r in rows if r[5] == name]
            assert abs(inn - sum(r[2] or 0 for r in mine)) < 0.005 and abs(out_ - sum(r[3] or 0 for r in mine)) < 0.005
            assert abs(net - (inn - out_)) < 0.005 and count == len(mine), (name, totals[name])

        assert s2e.main([pdf, "-o", out_csv, "--categories", "--date-format", "dd/mm/yyyy",
                         "--sep", ";", "--decimal", ","]) == 0
        with open(out_csv, encoding="utf-8-sig", newline="") as f:
            lines = list(csv.reader(f, delimiter=";"))
        assert lines[0] == ["Date", "Description", "Money in", "Money out", "Balance", "Category"], lines[0]
        assert len(lines) == len(rows) + 1
        for line, r in zip(lines[1:], rows):
            money = ["" if v is None else f"{v:.2f}".replace(".", ",") for v in r[2:5]]
            assert line == [r[0].strftime("%d/%m/%Y"), r[1], *money, r[5]], (line, r)
    print("categories:", len(rows), "rows sorted into", len(totals), "categories; the By category formulas give the "
          "same totals in LibreOffice; the CSV with ; and decimal commas matches the Excel file")


def scan(src, dst, angle, dpi=200, turn=0, seed=1):
    """What a scanner makes of a printed PDF: each page a grey JPEG picture, tilted by `angle` degrees,
    grainy and a little blurred, and turned by `turn` degrees (90 is on its side, 180 upside down)."""
    grain = np.random.default_rng(seed)
    out = pymupdf.open()
    for page in pymupdf.open(src):
        pix = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
        img = Image.frombytes("L", (pix.width, pix.height), pix.samples)
        img = img.rotate(angle, resample=Image.BICUBIC, fillcolor=255).rotate(turn, expand=True)
        dots = np.asarray(img, dtype=np.float64) * 0.9 + 12 + grain.normal(0, 14, (img.height, img.width))
        img = Image.fromarray(np.clip(dots, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=60)
        w, h = (page.rect.width, page.rect.height)[::1 if turn % 180 == 0 else -1]
        sheet = out.new_page(width=w, height=h)
        sheet.insert_image(sheet.rect, stream=buf.getvalue())
    out.save(dst)


def read(pdf, out, *flags):
    """Exit code, Transactions rows, Checks sheet and what was printed."""
    with contextlib.redirect_stdout(io.StringIO()) as said:
        code = s2e.main([pdf, "-o", out, *flags])
    if code:
        return code, [], {}, said.getvalue()
    wb = load_workbook(out)
    return (code, list(wb["Transactions"].iter_rows(min_row=2, values_only=True)),
            {r[0]: r[1] for r in wb["Checks"].iter_rows(values_only=True)}, said.getvalue())


def check_footer_page():
    """A bank's own last page: a background image over the whole page and "Page 3 of 3". It is not a scan,
    so the statement converts even without Tesseract, and an image alone is still a scan."""
    with tempfile.TemporaryDirectory() as tmp:
        pdf, out = os.path.join(tmp, "s.pdf"), os.path.join(tmp, "s.xlsx")
        truth = make(pdf, eu=True, seed=7)
        doc = pymupdf.open(pdf)
        grey = io.BytesIO()
        Image.new("L", (850, 1100), 235).save(grey, "PNG")
        for words in ("Page 3 of 3", ""):
            page = doc.new_page()
            page.insert_image(page.rect, stream=grey.getvalue())
            if words:
                page.insert_text((50, 800), words, fontsize=8)
        assert not s2e.is_scan(doc[-2]) and s2e.is_scan(doc[-1])
        doc.delete_page(-1)
        doc.saveIncr()
        which = shutil.which
        shutil.which = lambda name: None
        try:
            code, rows, checks, _ = read(pdf, out)
        finally:
            shutil.which = which
        assert code == 0 and len(rows) == len(truth) and "Pages read from a scan (OCR)" not in checks, (code, checks)
    print("a last page with a background image and a footer: read as text, no OCR needed; an image alone is a scan")


def check_scans():
    """Each layout printed, scanned and read back with OCR must give what its text PDF gives: tilted up to
    2.5 degrees either way, upside down, on its side, at 150 or 200 dpi, grainy and blurred by JPEG."""
    if not shutil.which("tesseract"):
        print("scans: not checked, Tesseract is not installed (apt-get install tesseract-ocr tesseract-ocr-fra "
              "tesseract-ocr-por tesseract-ocr-spa)")
        return
    cases = [("EU, tilted 1.5 degrees", lambda p: make(p, eu=True, seed=7), {"angle": 1.5}),
             ("US withdrawals and deposits, upside down", lambda p: make_columns(p, us=True),
              {"angle": -0.7, "turn": 180}),
             ("French debit and credit, on its side and tilted 2.5 degrees", lambda p: make_columns(p, us=False),
              {"angle": 2.5, "turn": 90}),
             ("UK at 150 dpi, tilted 2.5 degrees the other way", make_uk, {"angle": -2.5, "dpi": 150})]
    with tempfile.TemporaryDirectory() as tmp:
        pdf, scanned = os.path.join(tmp, "text.pdf"), os.path.join(tmp, "scan.pdf")
        for name, build, how in cases:
            build(pdf)
            scan(pdf, scanned, **how)
            _, want, want_checks, _ = read(pdf, os.path.join(tmp, "text.xlsx"))
            code, got, checks, said = read(scanned, os.path.join(tmp, "scan.xlsx"))
            assert code == 0 and checks.pop("Pages read from a scan (OCR)") == pymupdf.open(pdf).page_count, name
            assert checks == want_checks, (name, checks, want_checks)
            assert [(r[0], r[2:5]) for r in got] == [(r[0], r[2:5]) for r in want], \
                (name, [(a, b) for a, b in zip(got, want) if (a[0], a[2:5]) != (b[0], b[2:5])][:3])
            alike = [SequenceMatcher(None, a[1] or "", b[1] or "").ratio() for a, b in zip(got, want)]
            assert min(alike) > 0.8 and sum(alike) / len(alike) > 0.97, (name, min(alike), sum(alike) / len(alike))
            assert "Pages read from a scan: " in said, said
            print(f"scan, {name}: the {len(got)} dates, amounts and balances of the text PDF, and the same checks")

        # The last statement again: forced through the OCR although it has text, then without Tesseract.
        code, got, checks, _ = read(pdf, os.path.join(tmp, "forced.xlsx"), "--ocr")
        assert code == 0 and checks["Pages read from a scan (OCR)"] == 1, checks
        assert [(r[0], r[2:5]) for r in got] == [(r[0], r[2:5]) for r in want]
        which = shutil.which
        shutil.which = lambda name: None
        try:
            code, _, _, said = read(scanned, os.path.join(tmp, "none.xlsx"))
        finally:
            shutil.which = which
        assert code == 2 and "scan.pdf page 1 is a scanned image" in said and "apt-get install" in said, said
        assert not os.path.exists(os.path.join(tmp, "none.xlsx"))
        code, _, _, said = read(scanned, os.path.join(tmp, "none.xlsx"), "--lang", "xyz")
        assert code == 2 and "Tesseract could not read the page" in said and "xyz" in said, said
        assert not os.path.exists(os.path.join(tmp, "none.xlsx"))
    print("scan: --ocr reads a text PDF as a scan; without Tesseract, or with a language it does not have, the "
          "page is named and nothing is written")


if __name__ == "__main__":
    check(eu=True)
    check(eu=False)
    check_columns(us=False)
    check_columns(us=True)
    check_columns(us=True, split=True)
    check_uk()
    check_bank_header()
    check_rules()
    check_categories()
    check_footer_page()
    check_scans()
    print("all good")
