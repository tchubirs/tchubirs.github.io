"""Round-trip test: draw synthetic statements (EU and US layouts), extract, compare."""
import datetime as dt
import os
import random
import sys
import tempfile

import pymupdf
from openpyxl import load_workbook

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
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
            page.insert_text((50, 90), "Date      Libelle / Description                         Montant     Solde", fontsize=8)
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
        assert any("REF 8841" in (r[1].value or "") for r in ws.iter_rows(min_row=2)), "wrapped line lost"
        print(("EU" if eu else "US"), "layout:", len(got), "transactions match, balances reconcile")


if __name__ == "__main__":
    check(eu=True)
    check(eu=False)
