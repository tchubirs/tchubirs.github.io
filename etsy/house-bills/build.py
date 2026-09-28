"""Shared House Bills: roommate bill splitter with a chore rota (Excel + Google Sheets).

Every bill the house pays, who paid it and how it is split (equally, by room, or only between some people);
each housemate's share and balance, and the fewest payments to settle up; the bills due in a month, paid or
late; housemates who move in or out part of the way through the year; a chore rota that moves every week;
and the year by month and category. Only functions both apps have.
"""
import datetime as dt
import os
import random
import sys

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from sheetkit import (BAD, DATE, MONEY, MUTED, OK, TEAL, TEAL_D, WARN, F,  # noqa: E402
                      box, fill, font, header, sheet_base, style)

today = dt.date.today()
Y = today.year
N = 8                  # housemates
H0 = 8                 # first housemate row on the Housemates tab
B0, B1 = 6, 25         # bills
E0, E1 = 6, 605        # payments
SH0 = 6                # column F: first share column on Payments and first split column (H) on Bills is SPLIT0
SPLIT0 = 8
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
MON = [m[:3] for m in MONTHS]
MON_LIST = ",".join(f'"{m}"' for m in MON)
CATS = ["Rent", "Energy", "Water", "Internet", "Subscriptions", "Insurance", "Groceries", "Household", "Other"]
OFTEN = ["Monthly", "Every 2 months", "Every 3 months", "Every 6 months", "Yearly", "When needed"]
PERIOD = {"Monthly": 1, "Every 2 months": 2, "Every 3 months": 3, "Every 6 months": 6, "Yearly": 12}
BACK = "Paying back"
PAY = lambda col: f"Payments!${col}${E0}:${col}${E1}"
BL = lambda col: f"Bills!${col}${B0}:${col}${B1}"
NAMES = f"Housemates!$B${H0}:$B${H0 + N - 1}"
KEYS = f"Housemates!$I${H0}:$I${H0 + N - 1}"
M0, M1 = "Dashboard!$AK$2", "Dashboard!$AK$3"
NET = '#,##0.00;[Red]-#,##0.00'
W0, WSUM, S0 = 19, 27, 28      # Payments: weights in S..Z, their sum in AA, shares in AB..AI
BW0 = 27                       # Bills: default weights in AA..AH


def short(d):
    """A date as text, like 3 Oct, without TEXT() and its format codes."""
    return f'DAY({d})&" "&CHOOSE(MONTH({d}),{MON_LIST})'


# ---------------------------------------------------------------- example data (made-up people and amounts)
def month_start(k):            # k = 0..8, and 8 is this month
    m = today.month - 8 + k
    return dt.date(Y + (m - 1) // 12, (m - 1) % 12 + 1, 1)


def month_end(d):
    return (d.replace(day=28) + dt.timedelta(days=4)).replace(day=1) - dt.timedelta(days=1)


def on_day(ms, day):
    return ms.replace(day=min(day, month_end(ms).day))


S = [month_start(k) for k in range(9)]
people = [("Maya", None, None), ("Leo", None, None), ("Priya", None, None), ("Tom", None, month_end(S[4])),
          ("Zoe", S[5], None)]
bills = [
    # bill, category, usual amount, how often, first due, usually paid by, split {person: weight or "x"}
    ("Rent", "Rent", 2400, "Monthly", on_day(S[0], 1), "Maya", {"Maya": 30, "Leo": 25, "Priya": 25, "Tom": 20, "Zoe": 20}),
    ("Electricity", "Energy", 110, "Monthly", on_day(S[0], 15), "Leo", {}),
    ("Gas", "Energy", 190, "Every 3 months", on_day(S[1], 20), "Priya", {}),
    ("Water", "Water", 75, "Every 2 months", on_day(S[0], 10), "Maya", {}),
    ("Internet", "Internet", 45, "Monthly", on_day(S[0], 5), "Leo", {}),
    ("Streaming", "Subscriptions", 15.96, "Monthly", on_day(S[0], 22), "Priya", {"Leo": "x", "Priya": "x", "Tom": "x", "Zoe": "x"}),
    ("Home insurance", "Insurance", 264, "Yearly", on_day(S[2], 3), "Maya", {}),
    ("Groceries", "Groceries", None, "When needed", None, None, {}),
    ("Cleaning and household", "Household", None, "When needed", None, None, {}),
]
chores = ["Clean the kitchen", "Clean the bathroom", "Vacuum and mop", "Take out the bins", "Tidy the living room"]
BILL = {b[0]: b for b in bills}
WHO = [p[0] for p in people]


def lives(name, d):
    _, came, left = next(p for p in people if p[0] == name)
    return (came is None or came <= d) and (left is None or left >= d)


def weights(bill, d, shares):
    """The same rule as the formulas: marks on the line win, else the bill's split for the people living there."""
    out = {}
    for name in WHO:
        if shares:
            v = shares.get(name)
            out[name] = 0 if v is None else (v if isinstance(v, (int, float)) else 1)
        elif bill == BACK:
            out[name] = 0
        else:
            split = BILL[bill][6] if bill in BILL else {}
            base = 1 if not split else (0 if split.get(name) is None else
                                        (split[name] if isinstance(split[name], (int, float)) else 1))
            out[name] = base if lives(name, d) else 0
    return out


def balances(lines, until):
    bal = {n: 0.0 for n in WHO}
    for d, bill, amount, payer, shares in lines:
        if d > until:
            continue
        w = weights(bill, d, shares)
        total = sum(w.values())
        bal[payer] += amount
        for n in WHO:
            bal[n] -= amount * w[n] / total if total else 0
    return {n: round(v, 2) for n, v in bal.items()}


def settle(bal):
    """Largest debt pays largest credit, as on the Dashboard."""
    order = WHO + [None] * (N - len(WHO))
    b = [bal.get(n, 0) if n else 0 for n in order]
    out = []
    for _ in range(N - 1):
        hi, lo = max(b), min(b)
        amt = round(min(hi, -lo), 2)
        if amt < 0.01:
            break
        get, pay = b.index(hi), b.index(lo)
        out.append((order[pay], order[get], amt))
        b[get] = round(b[get] - amt, 2)
        b[pay] = round(b[pay] + amt, 2)
    return out


rng = random.Random(23)
# Example amounts are multiples of 0.12, so they split into whole cents between 3 or 4 people.
even = lambda x: round(round(x / 0.12) * 0.12, 2)
SEASON = [1.35, 1.3, 1.15, 1.0, 0.9, 0.85, 0.9, 0.9, 0.95, 1.05, 1.2, 1.3]
payments = []
late = None
for k in range(9):
    ms, last = S[k], (today if k == 8 else month_end(S[k]))
    due_now = []
    for name, cat, usual, often, first, payer, split in bills:
        if often not in PERIOD:
            continue
        since = (ms.year - first.year) * 12 + ms.month - first.month
        if since >= 0 and since % PERIOD[often] == 0:
            due_now.append((on_day(ms, first.day), name, usual, payer))
    if k == 8:
        passed = [x for x in due_now if x[0] < today and x[1] != "Rent"]
        late = max(passed)[1] if passed else None
    for due, name, usual, payer in due_now:
        paid_on = max(ms, due - dt.timedelta(days=rng.randint(0, 3)))
        if k == 8 and (paid_on > today or name == late):
            continue
        if name in ("Electricity", "Gas"):
            usual = even(usual * SEASON[ms.month - 1] * rng.uniform(0.92, 1.08))
        elif name == "Water":
            usual = even(usual * rng.uniform(0.9, 1.12))
        payments.append((paid_on, name, usual, payer, {}))
    for bill, times, lo, hi in (("Groceries", 3, 38, 96), ("Cleaning and household", 1, 12, 35)):
        for _ in range(times):
            d = ms + dt.timedelta(days=rng.randint(0, (last - ms).days))
            payments.append((d, bill, even(rng.uniform(lo, hi)), rng.choice([n for n in WHO if lives(n, d)]), {}))
    if k == 6:
        d = ms + dt.timedelta(days=12)
        payments.append((d, "Takeaway on film night", 64.50, "Leo", {"Leo": "x", "Priya": "x", "Zoe": "x"}))
    if k in (2, 4, 6):          # everyone settles up at the end of these months, and before Tom moves out
        end = month_end(ms)
        for payer, getter, amt in settle(balances(payments, end)):
            payments.append((end, BACK, amt, payer, {getter: "x"}))
payments.sort(key=lambda p: p[0])

wb = Workbook()


def dropdown(ws, formula, cells, strict=True):
    dv = DataValidation(type="list", formula1=formula, allow_blank=True, showErrorMessage=strict)
    ws.add_data_validation(dv)
    dv.add(cells)


def name_headers(ws, row, col):
    for k in range(N):
        c = ws.cell(row, col + k, f'=IF(Housemates!$B${H0 + k}="","",Housemates!$B${H0 + k})')
        c.font = font(10, True, "FFFFFF")
        c.fill = fill(TEAL)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = box


# ---------------------------------------------------------------- Housemates
hm = wb.active
hm.title = "Housemates"
sheet_base(hm, "Housemates", "Everyone who lives in the house, and when they moved in or out.",
           [3, 18, 14, 14, 16, 4, 72], rows=30)
hm["B4"] = "Home"
hm["B4"].font = font(11, True)
style(hm["C4"], True, bold=True)
hm["C4"] = "Rowan Street"
hm.merge_cells("C4:D4")
header(hm, 7, 2, ["Name", "Moved in", "Moved out", "Lives here now"])
for k in range(N):
    r = H0 + k
    name, came, left = people[k] if k < len(people) else (None, None, None)
    style(hm.cell(r, 2, name), True, bold=True)
    style(hm.cell(r, 3, came), True, DATE)
    style(hm.cell(r, 4, left), True, DATE)
    style(hm.cell(r, 5, f'=IF(B{r}="","",IF(AND(OR(C{r}="",C{r}<=TODAY()),OR(D{r}="",D{r}>=TODAY())),"Yes","No"))'),
          False, align="center")
    hm.cell(r, 9, f'=IF(E{r}="Yes",{k + 1},"")')                                   # I: key for the chore rota
hm.column_dimensions["I"].hidden = True
hm.conditional_formatting.add(f"B{H0}:E{H0 + N - 1}", FormulaRule(formula=[f'$E{H0}="No"'],
                                                                  font=Font(name=F, color="9AA7A9")))
for k, text in enumerate(["Leave Moved in empty for someone who was there from the start.",
                          "When someone moves out, type the date. Bills after it are no longer split with them.",
                          "Up to 8 people. Payments and Bills get one column for each."]):
    hm.cell(H0 + k, 7, text).font = font(10, color=MUTED, italic=True)

# ---------------------------------------------------------------- Bills
bl = wb.create_sheet("Bills")
sheet_base(bl, "Bills", "Every bill the house pays, how often, and how it is split. Leave the split empty to share "
           "it equally, put an x under the people who share it, or numbers, like the size of each room.",
           [3, 24, 14, 11, 15, 12, 13] + [7] * N + [13, 11], rows=B1 + 4)
header(bl, 5, 2, ["Bill", "Category", "Usual amount", "How often", "First due", "Usually paid by"])
name_headers(bl, 5, SPLIT0)
header(bl, 5, SPLIT0 + N, ["Next due", "Split"])
for r in range(B0, B1 + 1):
    b = bills[r - B0] if r - B0 < len(bills) else (None,) * 6 + ({},)
    name, cat, usual, often, first, payer, split = b
    style(bl.cell(r, 2, name), True, bold=True)
    style(bl.cell(r, 3, cat), True)
    style(bl.cell(r, 4, usual), True, MONEY)
    style(bl.cell(r, 5, often), True)
    style(bl.cell(r, 6, first), True, DATE)
    style(bl.cell(r, 7, payer), True)
    for k in range(N):
        v = split.get(people[k][0]) if k < len(people) else None
        style(bl.cell(r, SPLIT0 + k, v), True, "0.##", align="center")
        c = L(SPLIT0 + k)
        bl.cell(r, BW0 + k, f'=IF(Housemates!$B${H0 + k}="",0,IF($T{r}=0,1,IF({c}{r}="",0,IF(ISNUMBER({c}{r}),{c}{r},1))))')
    bl.cell(r, 19, f'=IF(B{r}="","",IF(E{r}="Monthly",1,IF(E{r}="Every 2 months",2,IF(E{r}="Every 3 months",3,'
                   f'IF(E{r}="Every 6 months",6,IF(E{r}="Yearly",12,0))))))')                          # S: months apart
    bl.cell(r, 20, f"=COUNTA(H{r}:O{r})")                                                              # T: marks
    since = f"((YEAR({M0})-YEAR(F{r}))*12+MONTH({M0})-MONTH(F{r}))"
    bl.cell(r, 21, f'=IF(OR(N(S{r})=0,F{r}=""),0,IF(AND({since}>=0,MOD({since},S{r})=0),1,0))')      # U: due that month
    bl.cell(r, 22, f'=IF(U{r}=1,DATE(YEAR({M0}),MONTH({M0}),MIN(DAY(F{r}),DAY({M1}))),"")')            # V: its date
    bl.cell(r, 23, f'=IF(B{r}="",0,SUMIFS({PAY("D")},{PAY("C")},B{r},{PAY("B")},">="&{M0},{PAY("B")},"<="&{M1}))')  # W
    bl.cell(r, 24, f'=IF(U{r}=1,V{r}+ROW()/10000000,"")')                                              # X: order
    bl.cell(r, 25, f'=IF(OR(N(S{r})=0,F{r}=""),"",(YEAR(TODAY())-YEAR(F{r}))*12+MONTH(TODAY())-MONTH(F{r}))')  # Y
    bl.cell(r, 26, f'=IF(Y{r}="",0,SUMIFS({PAY("D")},{PAY("C")},B{r},{PAY("B")},">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),'
                   f'{PAY("B")},"<="&EOMONTH(TODAY(),0)))')                                            # Z: paid this month
    off = f"IF(MOD(Y{r},S{r})=0,IF(Z{r}>0,S{r},0),S{r}-MOD(Y{r},S{r}))"
    month = f"DATE(YEAR(TODAY()),MONTH(TODAY())+{off},1)"
    style(bl.cell(r, SPLIT0 + N, f'=IF(Y{r}="","",IF(Y{r}<0,F{r},DATE(YEAR({month}),MONTH({month}),'
                                 f'MIN(DAY(F{r}),DAY(EOMONTH({month},0))))))'), False, DATE, align="center")
    style(bl.cell(r, SPLIT0 + N + 1, f'=IF(B{r}="","",IF(T{r}=0,"Everyone",IF(COUNT(H{r}:O{r})>0,"By shares",'
                                     f'IF(T{r}=1,"1 person",T{r}&" people"))))'), False, align="center")
    bl.cell(r, 35, f'=IF(P{r}="","",P{r}+ROW()/10000000)')                                             # AI: next due
    bl.cell(r + 1, 37, f'=IF(B{r}="","",B{r})')                                                        # AK: dropdown list
bl["AK6"] = BACK
for c in range(19, 38):
    bl.column_dimensions[L(c)].hidden = True
dropdown(bl, f'"{",".join(CATS)}"', f"C{B0}:C{B1}")
dropdown(bl, f'"{",".join(OFTEN)}"', f"E{B0}:E{B1}")
dropdown(bl, f"={NAMES}", f"G{B0}:G{B1}", strict=False)
bl.conditional_formatting.add(f"H{B0}:O{B1}", FormulaRule(formula=[f'AND(H{B0}<>"",H$5<>"")'], fill=fill("CFE8E4"),
                                                          font=Font(name=F, bold=True, color=TEAL_D)))
bl.conditional_formatting.add(f"P{B0}:P{B1}", FormulaRule(formula=[f'AND($P{B0}<>"",$P{B0}<TODAY())'], fill=fill(BAD)))
bl.conditional_formatting.add(f"P{B0}:P{B1}", FormulaRule(formula=[f'AND($P{B0}<>"",$P{B0}-TODAY()<=3)'], fill=fill(WARN)))
bl.freeze_panes = "C6"
bl[f"B{B1 + 2}"] = ("Next due is the first date from this month on that is not paid yet. A bill counts as paid when a "
                    "payment for it is dated in the month it is due.")
bl[f"B{B1 + 2}"].font = font(9, color=MUTED, italic=True)

# ---------------------------------------------------------------- Payments
pm = wb.create_sheet("Payments")
sheet_base(pm, "Payments", "One line per bill paid or shared buy. Leave the shares empty to use the bill's split. "
           "Put an x under the people who share it, or a number for more or less than one share.",
           [3, 12, 26, 11, 12] + [7] * N + [13, 14], rows=E1 + 2)
header(pm, 5, 2, ["Date", "Bill or what", "Amount", "Paid by"])
name_headers(pm, 5, SH0)
header(pm, 5, SH0 + N, ["Split", "Category"])
for r in range(E0, E1 + 1):
    p = payments[r - E0] if r - E0 < len(payments) else (None,) * 4 + ({},)
    d_, bill, amount, payer, shares = p
    style(pm.cell(r, 2, d_), True, DATE)
    style(pm.cell(r, 3, bill), True)
    style(pm.cell(r, 4, amount), True, MONEY)
    style(pm.cell(r, 5, payer), True, bold=True)
    for k in range(N):
        v = shares.get(people[k][0]) if k < len(people) else None
        style(pm.cell(r, SH0 + k, v), True, "0.##", align="center")
    pm.cell(r, 17, f'=IF(C{r}="",0,IFERROR(MATCH(C{r},{BL("B")},0),0))')                            # Q: which bill
    pm.cell(r, 18, f"=COUNTA(F{r}:M{r})")                                                          # R: marks
    for k in range(N):
        c, mate = L(SH0 + k), f"$B${H0 + k}"
        came, left = f"Housemates!$C${H0 + k}", f"Housemates!$D${H0 + k}"
        default = f"IF($Q{r}=0,1,INDEX(Bills!${L(BW0 + k)}${B0}:${L(BW0 + k)}${B1},$Q{r}))"
        pm.cell(r, W0 + k, f'=IF(OR($D{r}="",$B{r}="",Housemates!{mate}=""),0,IF($R{r}>0,IF({c}{r}="",0,IF(ISNUMBER({c}{r}),{c}{r},1)),'
                           f'IF($C{r}="{BACK}",0,IF(AND(OR({came}="",{came}<=$B{r}),OR({left}="",{left}>=$B{r})),{default},0))))')
    pm.cell(r, WSUM, f"=SUM(S{r}:Z{r})")                                                           # AA
    for k in range(N):
        pm.cell(r, S0 + k, f"=IF(AA{r}=0,0,D{r}*{L(W0 + k)}{r}/AA{r})")                             # AB..AI shares
    pm.cell(r, 36, f'=IF(OR(C{r}="",B{r}=""),"",C{r}&"|"&(YEAR(B{r})*100+MONTH(B{r})))')           # AJ: bill and month
    marked = f'COUNTIF(S{r}:Z{r},">0")'
    style(pm.cell(r, SH0 + N, f'=IF(D{r}="","",IF(B{r}="","No date",IF(AND(C{r}="{BACK}",R{r}=0),"To whom?",IF(AA{r}=0,"Nobody",'
                              f'IF(C{r}="{BACK}","To "&INDEX({NAMES},MATCH(MAX(S{r}:Z{r}),S{r}:Z{r},0)),'
                              f'IF(R{r}>0,IF({marked}=1,"1 person",{marked}&" people"),'
                              f'IF(Q{r}=0,"Everyone",INDEX({BL("Q")},Q{r}))))))))'), False, align="center")
    cat = f"INDEX({BL('C')},Q{r})"
    style(pm.cell(r, SH0 + N + 1, f'=IF(D{r}="","",IF(C{r}="{BACK}","{BACK}",IF(Q{r}=0,"Other",IF({cat}="","Other",{cat}))))'),
          False)
for c in range(16, 37):
    pm.column_dimensions[L(c)].hidden = True
dropdown(pm, f"=Bills!$AK${B0}:$AK${B1 + 1}", f"C{E0}:C{E1}", strict=False)
dropdown(pm, f"={NAMES}", f"E{E0}:E{E1}")
pm.conditional_formatting.add(f"F{E0}:M{E1}", FormulaRule(formula=[f'AND(F{E0}<>"",F$5<>"")'], fill=fill("CFE8E4"),
                                                          font=Font(name=F, bold=True, color=TEAL_D)))
pm.conditional_formatting.add(f"N{E0}:N{E1}", FormulaRule(formula=[f'OR(N{E0}="Nobody",N{E0}="To whom?",N{E0}="No date")'], fill=fill(BAD)))
pm.conditional_formatting.add(f"E{E0}:E{E1}", FormulaRule(formula=[f'AND(E{E0}<>"",COUNTIF({NAMES},E{E0})=0)'], fill=fill(BAD)))
pm.conditional_formatting.add(f"B{E0}:O{E1}", FormulaRule(formula=[f'$C{E0}="{BACK}"'], font=Font(name=F, italic=True,
                                                                                                  color=MUTED)))
pm.freeze_panes = "C6"

# ---------------------------------------------------------------- Dashboard
db = wb.create_sheet("Dashboard", 0)
sheet_base(db, "House bills", "Pick a month: what everyone paid and shared, who owes whom, and the bills due.",
           [3, 16, 14, 14, 14, 22, 3, 26, 13, 3, 3], rows=45)
db["B2"] = '=IF(Housemates!$C$4="","House bills","House bills: "&Housemates!$C$4)'
db["B4"] = "Month"
db["B4"].font = font(11, True)
style(db["C4"], True, None, True, "center")
db["C4"] = MONTHS[today.month - 1]
db["D4"] = "Year"
db["D4"].font = font(11, True)
db["D4"].alignment = Alignment(horizontal="right")
style(db["E4"], True, "0", True, "center")
db["E4"] = Y
dropdown(db, '"' + ",".join(MONTHS) + '"', "C4")
db["AK1"] = "=MATCH(C4,{" + ",".join(f'"{m}"' for m in MONTHS) + "},0)"
db["AK2"] = "=DATE(E4,AK1,1)"
db["AK3"] = "=EOMONTH(AK2,0)"
IN_MONTH = f'{PAY("B")},">="&$AK$2,{PAY("B")},"<="&$AK$3'
nxt = f"MIN({BL('AI')})"
tiles = [("B", "Spent this month", f'=SUMIFS({PAY("D")},{IN_MONTH},{PAY("C")},"<>{BACK}")', MONEY, TEAL),
         ("C", "Still to pay", f'=SUMIFS({BL("D")},{BL("U")},1,{BL("W")},0)', MONEY, "B4541F"),
         ("D", "Late bills", f'=COUNTIFS({BL("U")},1,{BL("W")},0,{BL("V")},"<"&TODAY())', "0", "B4541F"),
         ("E", "Next bill", f'=IFERROR(INDEX({BL("B")},MATCH({nxt},{BL("AI")},0))&", "&{short(f"INT({nxt})")},"None")', "@",
          TEAL)]
for col, label, formula, fmt, colour in tiles:
    db[f"{col}6"] = label
    db[f"{col}6"].font = font(10, True, MUTED)
    db[f"{col}7"] = formula
    db[f"{col}7"].number_format = fmt
    db[f"{col}7"].font = font(16 if col != "E" else 14, True, colour)
    db[f"{col}7"].alignment = Alignment(horizontal="right")
    for r in (6, 7):
        db[f"{col}{r}"].border = box
db.merge_cells("E6:F6")
db.merge_cells("E7:F7")
for r in (6, 7):
    db[f"F{r}"].border = box
db.row_dimensions[7].height = 34

header(db, 9, 2, ["Housemate", "Paid this month", "Share this month", "Balance", "Status"])
for k in range(N):
    r, name = 10 + k, f"Housemates!B{H0 + k}"
    col = L(S0 + k)
    style(db.cell(r, 2, f'=IF({name}="","",{name})'), False, bold=True)
    style(db.cell(r, 3, f'=IF(B{r}="","",SUMIFS({PAY("D")},{PAY("E")},B{r},{IN_MONTH},{PAY("C")},"<>{BACK}"))'), False, MONEY)
    style(db.cell(r, 4, f'=IF(B{r}="","",SUMIFS({PAY(col)},{IN_MONTH},{PAY("C")},"<>{BACK}"))'), False, MONEY)
    style(db.cell(r, 5, f'=IF(B{r}="","",ROUND(SUMIFS({PAY("D")},{PAY("E")},B{r},{PAY("B")},"<="&$AK$3)'
                        f'-SUMIFS({PAY(col)},{PAY("B")},"<="&$AK$3),2))'), False, NET, True)
    style(db.cell(r, 6, f'=IF(B{r}="","",IF(ABS(E{r})<0.005,"Settled",IF(E{r}>0,"Gets back "&FIXED(E{r},2),'
                        f'"Owes "&FIXED(-E{r},2))))'), False)
db.conditional_formatting.add("F10:F17", FormulaRule(formula=['LEFT(F10,4)="Gets"'], fill=fill(OK)))
db.conditional_formatting.add("F10:F17", FormulaRule(formula=['LEFT(F10,4)="Owes"'], fill=fill(WARN)))
db.conditional_formatting.add("F10:F17", FormulaRule(formula=['F10="Settled"'], fill=fill("EEF1F1")))
db["B18"] = "Balance counts everything up to the end of the month, money paid back included."
db["B18"].font = font(9, color=MUTED, italic=True)

# Settle up: the largest debt pays the largest credit, again and again. The work is hidden in columns AA to AI:
# rows 60 to 67 hold everyone's balance after each payment, rows 69 to 73 the payment itself.
SC, R0, T0 = 27, 60, 69
for k in range(N):
    db.cell(R0 + k, SC, f'=IF(B{10 + k}="",0,E{10 + k})')
for step in range(1, N):
    prev = L(SC + step - 1)
    rng_ = f"{prev}${R0}:{prev}${R0 + N - 1}"
    db[f"{prev}{T0}"] = f"=MAX({rng_})"
    db[f"{prev}{T0 + 1}"] = f"=MIN({rng_})"
    db[f"{prev}{T0 + 2}"] = f"=ROUND(MIN({prev}{T0},-{prev}{T0 + 1}),2)"
    db[f"{prev}{T0 + 3}"] = f"=MATCH({prev}{T0},{rng_},0)"
    db[f"{prev}{T0 + 4}"] = f"=MATCH({prev}{T0 + 1},{rng_},0)"
    for k in range(N):
        db.cell(R0 + k, SC + step, f"=ROUND({prev}{R0 + k}-IF({k + 1}={prev}${T0 + 3},{prev}${T0 + 2},0)"
                                   f"+IF({k + 1}={prev}${T0 + 4},{prev}${T0 + 2},0),2)")
header(db, 9, 8, ["Settle up", "Amount"])
for step in range(1, N):
    r = 9 + step
    prev = L(SC + step - 1)
    who = lambda row: f"INDEX($B$10:$B$17,{prev}{row})"
    none = '"Everyone is settled"' if step == 1 else '""'
    style(db.cell(r, 8, f'=IF(N({prev}{T0 + 2})<0.01,{none},{who(T0 + 4)}&" pays "&{who(T0 + 3)})'), False, bold=True)
    style(db.cell(r, 9, f'=IF(N({prev}{T0 + 2})<0.01,"",{prev}{T0 + 2})'), False, MONEY)
db["H18"] = "The fewest payments that bring every balance to zero."
db["H18"].font = font(9, color=MUTED, italic=True)

header(db, 20, 2, ["Due", "Bill", "Amount", "Paid by", "Status"])
LIST = 12                      # bills shown; a line under them counts the rest
for i in range(LIST):
    r = 21 + i
    key = f"AL{r}"
    db[key] = f'=IFERROR(SMALL({BL("X")},{i + 1}),"")'
    row = f'MATCH({key},{BL("X")},0)'
    paid = f"INDEX({BL('W')},{row})"
    style(db.cell(r, 2, f'=IF({key}="","",INT({key}))'), False, "ddd d mmm", align="center")
    empty = '"No bills due this month"' if i == 0 else '""'
    style(db.cell(r, 3, f'=IF({key}="",{empty},INDEX({BL("B")},{row}))'), False, bold=True)
    style(db.cell(r, 4, f'=IF({key}="","",IF({paid}>0,{paid},INDEX({BL("D")},{row})))'), False, MONEY)
    style(db.cell(r, 5, f'=IF({key}="","",IF({paid}>0,IFERROR(INDEX({PAY("E")},MATCH(C{r}&"|"&(YEAR($AK$2)*100+MONTH($AK$2)),'
                        f'{PAY("AJ")},0)),""),INDEX({BL("G")},{row})))'), False)
    style(db.cell(r, 6, f'=IF({key}="","",IF({paid}>0,"Paid",IF(B{r}<TODAY(),"Late",IF(B{r}=TODAY(),"Due today",'
                        f'IF(B{r}-TODAY()<=3,"Due in "&(B{r}-TODAY())&IF(B{r}-TODAY()=1," day"," days"),"Coming")))))'),
          False, align="center")
db[f"B{21 + LIST}"] = f'=IF(COUNT({BL("X")})>{LIST},"And "&(COUNT({BL("X")})-{LIST})&" more due this month, on the Bills tab.","")'
db[f"B{21 + LIST}"].font = font(9, color=MUTED, italic=True)
db.conditional_formatting.add("F21:F32", FormulaRule(formula=['F21="Paid"'], fill=fill(OK)))
db.conditional_formatting.add("F21:F32", FormulaRule(formula=['F21="Late"'], fill=fill(BAD)))
db.conditional_formatting.add("F21:F32", FormulaRule(formula=['LEFT(F21,3)="Due"'], fill=fill(WARN)))
db.conditional_formatting.add("E21:E32", FormulaRule(formula=['AND(E21<>"",F21<>"Paid")'], font=Font(name=F, italic=True,
                                                                                                     color=MUTED)))
header(db, 20, 8, ["Category", "This month"])
for k, cat in enumerate(CATS):
    r = 21 + k
    style(db.cell(r, 8, cat), False, bold=True)
    style(db.cell(r, 9, f'=SUMIFS({PAY("D")},{PAY("O")},H{r},{IN_MONTH})'), False, MONEY)
db["H31"] = "Paid by: who paid it, or in grey who usually pays it."
db["H31"].font = font(9, color=MUTED, italic=True)
for c in range(SC, 39):
    db.column_dimensions[L(c)].hidden = True
for r in list(range(R0, R0 + N)) + list(range(T0, T0 + 5)):
    db.row_dimensions[r].hidden = True

# ---------------------------------------------------------------- Year
yr = wb.create_sheet("Year")
sheet_base(yr, "Year", "Every month by category, and what each housemate paid and shared in the year.",
           [3, 10] + [11] * len(CATS) + [12, 3, 14, 12, 12], rows=40)
yr["B4"] = "Year"
yr["B4"].font = font(11, True)
style(yr["C4"], True, "0", True, "center")
yr["C4"] = Y
header(yr, 6, 2, ["Month"] + CATS + ["Total"])
for m in range(12):
    r = 7 + m
    start = f"DATE($C$4,{m + 1},1)"
    style(yr.cell(r, 2, MON[m]), False, bold=True, align="center")
    for k in range(len(CATS)):
        style(yr.cell(r, 3 + k, f'=SUMIFS({PAY("D")},{PAY("O")},{L(3 + k)}$6,{PAY("B")},">="&{start},'
                                f'{PAY("B")},"<="&EOMONTH({start},0))'), False, "#,##0.00;;")
    style(yr.cell(r, 3 + len(CATS), f"=SUM(C{r}:{L(2 + len(CATS))}{r})"), False, MONEY, True)
style(yr.cell(19, 2, "Total"), False, bold=True, align="center")
for k in range(len(CATS) + 1):
    c = L(3 + k)
    style(yr.cell(19, 3 + k, f"=SUM({c}7:{c}18)"), False, MONEY, True)
chart = BarChart()
chart.type = "col"
chart.title = "Spent by month"
chart.height, chart.width = 7, 16
chart.add_data(Reference(yr, min_col=3 + len(CATS), min_row=6, max_row=18), titles_from_data=True)
chart.set_categories(Reference(yr, min_col=2, min_row=7, max_row=18))
chart.series[0].graphicalProperties.solidFill = TEAL
chart.legend = None
chart.y_axis.number_format = "#,##0"
yr.add_chart(chart, "B21")
PC = 4 + len(CATS)                  # the housemate table, after a spacer
header(yr, 6, PC + 1, ["Housemate", "Paid", "Share"])
in_year = f'{PAY("B")},">="&DATE($C$4,1,1),{PAY("B")},"<="&DATE($C$4,12,31),{PAY("C")},"<>{BACK}"'
for k in range(N):
    r = 7 + k
    nm = L(PC + 1)
    style(yr.cell(r, PC + 1, f'=IF(Housemates!B{H0 + k}="","",Housemates!B{H0 + k})'), False, bold=True)
    style(yr.cell(r, PC + 2, f'=IF({nm}{r}="","",SUMIFS({PAY("D")},{PAY("E")},{nm}{r},{in_year}))'), False, MONEY)
    style(yr.cell(r, PC + 3, f'=IF({nm}{r}="","",SUMIFS({PAY(L(S0 + k))},{in_year}))'), False, MONEY)
yr.cell(16, PC + 1, "Money paid back between you is left out here.").font = font(9, color=MUTED, italic=True)

# ---------------------------------------------------------------- Chores
ch = wb.create_sheet("Chores")
sheet_base(ch, "Chores", "A rota that moves one step every Monday, between the people who live here now.",
           [3, 26] + [14] * 6 + [3, 56], rows=30)
header(ch, 5, 2, ["Chore", "This week", "Next week"] + [""] * 4)
for k in range(2, 6):
    monday = f"(TODAY()-WEEKDAY(TODAY(),3)+{7 * k})"
    ch.cell(5, 3 + k, f'="Week of "&{short(monday)}')
n_now = f"COUNT({KEYS})"
for i in range(10):
    r = 6 + i
    style(ch.cell(r, 2, chores[i] if i < len(chores) else None), True, bold=True)
    for k in range(6):
        week = f"INT((TODAY()-WEEKDAY(TODAY(),3)+{7 * k}-DATE(2024,1,1))/7)"
        style(ch.cell(r, 3 + k, f'=IF(OR($B{r}="",{n_now}=0),"",INDEX({NAMES},SMALL({KEYS},MOD({week}+{i},{n_now})+1)))'),
              False, align="center")
ch.conditional_formatting.add("C6:C15", FormulaRule(formula=['C6<>""'], fill=fill("CFE8E4"),
                                                    font=Font(name=F, bold=True, color=TEAL_D)))
for k, text in enumerate(["Everyone who lives here now takes a turn, and each chore moves to the next person every Monday.",
                          "More chores than people? Some get two in a week.",
                          "Add or rename chores in column B."]):
    ch.cell(6 + k, 10, text).font = font(10, color=MUTED, italic=True)

# ---------------------------------------------------------------- Start Here
st = wb.create_sheet("Start Here")
sheet_base(st, "Start here", "Type only in the yellow cells. Everything else is calculated.", [3, 6, 106])
steps = [
    ("1", "Housemates: the people who live in the house, and the date for anyone who moved in or out."),
    ("2", "Bills: each bill once, with how often it comes, the first date it is due, and how it is split."),
    ("3", "Payments: one line each time someone pays a bill or buys something for the house."),
    ("4", "When someone pays another housemate back, add it as Paying back, with an x under the one who gets it."),
    ("5", "Dashboard: pick a month to see who owes whom, the fewest payments to settle up, and the bills due."),
]
for k, (n, text) in enumerate(steps):
    r = 5 + k * 2
    st.cell(r, 2, n).font = font(18, True, TEAL)
    st.cell(r, 3, text).font = font(13)
for k, text in enumerate(["The example house, its people and its amounts are made up. Delete them and add your own.",
                          "Chores: list the jobs and the rota shares them out every week.",
                          "Works in Google Sheets and Microsoft Excel, in any currency."]):
    st.cell(16 + k * 2, 3, text).font = font(11, color=MUTED, italic=True)

order = ["Dashboard", "Payments", "Bills", "Chores", "Year", "Housemates", "Start Here"]
wb._sheets = [wb[name] for name in order]
wb.active = 0
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Roommate-Bill-Splitter.xlsx")
wb.save(out)
print("saved", out, len(payments), "payments", len(people), "housemates, late:", late)
