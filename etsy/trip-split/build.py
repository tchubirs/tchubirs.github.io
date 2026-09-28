"""Group Trip Expense Splitter (Excel + Google Sheets).

Who paid what on a shared trip, in any currency, split between everyone or
only some people or in unequal shares; each person's balance; and the fewest
payments that settle everyone up. Only functions both apps have.
"""
import datetime as dt
import os
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
P0, P1 = 9, 20        # people on the Setup tab (12)
N = P1 - P0 + 1
K0, K1 = 9, 18        # currencies on the Setup tab
E0, E1 = 6, 505       # expense lines
SH0 = 8               # column H: first share column on Expenses
W0 = 35               # column AI: first hidden weight column on Expenses
A0 = 23               # column W: first hidden amount-per-person column on Expenses
EX = lambda col: f"Expenses!${col}${E0}:${col}${E1}"
PEOPLE = f"Setup!$B${P0}:$B${P1}"
CATS = ["Lodging", "Food", "Transport", "Activities", "Groceries", "Other", "Paying back"]
NET = '#,##0.00;[Red]-#,##0.00'

# ---------------------------------------------------------------- example data
people = ["Ana", "Ben", "Chloe", "Dev", "Emma"]
D = lambda d: dt.date(Y, 9, d)
expenses = [
    # date, what, category, amount, currency, paid by, shares {person: weight or "x"}
    (D(10), "Taxi from the airport", "Transport", 38, "EUR", "Ana", {}),
    (D(10), "Flat in Lisbon, 4 nights", "Lodging", 780, "EUR", "Ben", {}),
    (D(10), "Groceries for the flat", "Groceries", 64.30, "EUR", "Chloe", {}),
    (D(10), "Dinner in Alfama", "Food", 142, "EUR", "Dev", {}),
    (D(11), "Tram day passes", "Transport", 32, "EUR", "Emma", {}),
    (D(11), "Lunch at the market", "Food", 88.50, "EUR", "Ana", {}),
    (D(11), "Castle tickets", "Activities", 60, "EUR", "Ben", {"Ana": "x", "Ben": "x", "Chloe": "x", "Dev": "x"}),
    (D(11), "Dinner and fado", "Food", 196, "EUR", "Chloe", {}),
    (D(12), "Sintra train and palace", "Activities", 115, "EUR", "Dev", {}),
    (D(12), "Surf lesson", "Activities", 90, "EUR", "Ben", {"Ben": "x", "Dev": "x"}),
    (D(12), "Pastries in Belem", "Food", 21.60, "EUR", "Emma", {}),
    (D(12), "Dinner", "Food", 128, "EUR", "Ana", {}),
    (D(12), "Ana pays Ben back", "Paying back", 100, "EUR", "Ana", {"Ben": "x"}),
    (D(13), "Train to Porto", "Transport", 125, "EUR", "Dev", {}),
    (D(13), "Hotel in Porto, 3 nights", "Lodging", 540, "EUR", "Chloe", {}),
    (D(13), "Dinner by the river", "Food", 154, "EUR", "Emma", {}),
    (D(14), "Port wine tasting", "Activities", 75, "EUR", "Ben", {}),
    (D(14), "Wine to take home", "Other", 72, "EUR", "Chloe", {"Ana": 2, "Chloe": 1, "Emma": 1}),
    (D(14), "Bookshop tickets", "Activities", 50, "EUR", "Emma", {}),
    (D(14), "Lunch", "Food", 67, "EUR", "Dev", {}),
    (D(14), "Dinner", "Food", 139, "EUR", "Ben", {}),
    (D(15), "Boat tour on the Douro", "Activities", 95, "EUR", "Ana", {}),
    (D(15), "Groceries", "Groceries", 38.20, "EUR", "Emma", {}),
    (D(15), "Farewell dinner", "Food", 210, "EUR", "Chloe", {}),
    (D(16), "Taxi to the airport", "Transport", 34, "EUR", "Dev", {}),
    (D(16), "Airport snacks", "Food", 22.40, "EUR", "Ben", {}),
    (D(16), "Car home from the airport", "Transport", 58, "USD", "Emma", {"Ana": "x", "Emma": "x"}),
]
currencies = [("EUR", 1.08), ("GBP", 1.27), ("CAD", 0.74)]

wb = Workbook()


def dropdown(ws, formula, cells, strict=True):
    dv = DataValidation(type="list", formula1=formula, allow_blank=True, showErrorMessage=strict)
    ws.add_data_validation(dv)
    dv.add(cells)


# ---------------------------------------------------------------- Setup
se = wb.active
se.title = "Setup"
sheet_base(se, "Setup", "The trip, the people on it, and the currencies you pay in.", [3, 18, 4, 12, 16, 4, 60], rows=30)
se["B4"] = "Trip"
se["B4"].font = font(11, True)
style(se["D4"], True, bold=True)
se["D4"] = "Lisbon and Porto"
se.merge_cells("D4:E4")
se["B5"] = "Home currency"
se["B5"].font = font(11, True)
style(se["D5"], True, None, True, "center")
se["D5"] = "USD"
header(se, 8, 2, ["People"])
for k in range(N):
    style(se.cell(P0 + k, 2, people[k] if k < len(people) else None), True, bold=True)
header(se, 8, 4, ["Currency", "1 unit is worth"])
style(se.cell(K0, 4, "=$D$5"), False, bold=True, align="center")
style(se.cell(K0, 5, 1), False, "0.0000", align="center")
for k in range(1, K1 - K0 + 1):
    cur = currencies[k - 1] if k - 1 < len(currencies) else (None, None)
    style(se.cell(K0 + k, 4, cur[0]), True, bold=True, align="center")
    style(se.cell(K0 + k, 5, cur[1]), True, "0.0000", align="center")
for k, text in enumerate(["Up to 12 people. The Expenses tab gets one column for each.",
                          "Each currency's worth in your home currency, for example 1 EUR is worth 1.08 USD.",
                          "Every total on the Dashboard is in the home currency."]):
    se.cell(P0 + k, 7, text).font = font(10, color=MUTED, italic=True)
CURS = f"Setup!$D${K0}:$D${K1}"
RATES = f"Setup!$E${K0}:$E${K1}"

# ---------------------------------------------------------------- Expenses
ex = wb.create_sheet("Expenses")
sheet_base(ex, "Expenses", "One line per expense. Leave the shares empty to split it between everyone, or put an x "
           "under the people who share it. A number gives someone more or less than one share.",
           [3, 11, 26, 13, 10, 8, 11] + [7] * N + [12, 16], rows=E1 + 2)
header(ex, 5, 2, ["Date", "What", "Category", "Amount", "Currency", "Paid by"] + [f"=IF(Setup!B{P0 + k}=\"\",\"\",Setup!B{P0 + k})"
                                                                            for k in range(N)] + ["In home currency", "Shared by"])
count = f'COUNTIF({PEOPLE},"?*")'
for r in range(E0, E1 + 1):
    e = expenses[r - E0] if r - E0 < len(expenses) else (None,) * 6 + ({},)
    d_, what, cat, amount, cur, payer, shares = e
    style(ex.cell(r, 2, d_), True, DATE)
    style(ex.cell(r, 3, what), True)
    style(ex.cell(r, 4, cat), True)
    style(ex.cell(r, 5, amount), True, MONEY)
    style(ex.cell(r, 6, cur), True, align="center")
    style(ex.cell(r, 7, payer), True, bold=True)
    for k in range(N):
        v = shares.get(people[k]) if k < len(people) else None
        style(ex.cell(r, SH0 + k, v), True, "0.##", align="center")
        name = f"Setup!$B${P0 + k}"
        cell = f"{L(SH0 + k)}{r}"
        ex.cell(r, W0 + k, f'=IF({name}="",0,IF({cell}="",0,IF(ISNUMBER({cell}),{cell},1)))')          # AI..AT weight
    home = f'IF(F{r}="",1,IFERROR(INDEX({RATES},MATCH(F{r},{CURS},0)),0))'
    style(ex.cell(r, 20, f'=IF(N(E{r})=0,"",E{r}*{home})'), False, MONEY, True)
    wsum = f"SUM({L(W0)}{r}:{L(W0 + N - 1)}{r})"
    ex.cell(r, 22, f"={wsum}")                                                                     # V weights
    shared = (f'IF(T{r}="","",IF(V{r}=0,"Everyone",IF(COUNTIF({L(W0)}{r}:{L(W0 + N - 1)}{r},">0")={count},'
              f'"Everyone",COUNTIF({L(W0)}{r}:{L(W0 + N - 1)}{r},">0")&IF(COUNTIF({L(W0)}{r}:{L(W0 + N - 1)}{r},">0")=1,'
              f'" person"," people"))))')
    style(ex.cell(r, 21, f"={shared}"), False, align="center")
    for k in range(N):
        name = f"Setup!$B${P0 + k}"
        ex.cell(r, A0 + k, f'=IF(OR(T{r}="",{name}=""),0,IF(V{r}=0,T{r}/{count},T{r}*{L(W0 + k)}{r}/V{r}))')  # W..AH share
for c in range(22, W0 + N):
    ex.column_dimensions[L(c)].hidden = True
dropdown(ex, f'"{",".join(CATS)}"', f"D{E0}:D{E1}")
dropdown(ex, f"={CURS}", f"F{E0}:F{E1}")
dropdown(ex, f"={PEOPLE}", f"G{E0}:G{E1}")
ex.conditional_formatting.add(f"H{E0}:S{E1}", FormulaRule(formula=[f'AND(H{E0}<>"",H$5<>"")'], fill=fill("CFE8E4"),
                                                          font=Font(name=F, bold=True, color=TEAL_D)))
ex.conditional_formatting.add(f"B{E0}:U{E1}", FormulaRule(formula=[f'$D{E0}="Paying back"'], font=Font(name=F, italic=True,
                                                                                                        color=MUTED)))
ex.conditional_formatting.add(f"G{E0}:G{E1}", FormulaRule(formula=[f'AND(G{E0}<>"",COUNTIF({PEOPLE},G{E0})=0)'], fill=fill(BAD)))
ex.freeze_panes = "D6"

# ---------------------------------------------------------------- Dashboard
db = wb.create_sheet("Dashboard", 0)
sheet_base(db, "Trip expenses", "Who paid what, what everyone's share came to, and who pays whom to settle up.",
           [3, 16, 13, 13, 13, 24, 3, 26, 13, 3, 13, 11], rows=70)
db["B2"] = '="Trip expenses: "&Setup!$D$4'
db["B4"] = '="All amounts in "&Setup!$D$5'
db["B4"].font = font(10, True, MUTED)
spent = f'SUMIFS({EX("T")},{EX("D")},"<>Paying back")'
first, last = f'MIN({EX("B")})', f'MAX({EX("B")})'
tiles = [("B", "Spent in total", f"={spent}", MONEY), ("C", "Per person", f'=IF({count}=0,"",{spent}/{count})', MONEY),
         ("D", "Per day", f'=IF({first}=0,"",{spent}/({last}-{first}+1))', MONEY),
         ("E", "Days", f'=IF({first}=0,"",{last}-{first}+1)', "0"), ("F", "Expenses", f'=COUNTIFS({EX("T")},">0")', "0")]
for col, label, formula, fmt in tiles:
    db[f"{col}6"] = label
    db[f"{col}6"].font = font(10, True, MUTED)
    db[f"{col}7"] = formula
    db[f"{col}7"].number_format = fmt
    db[f"{col}7"].font = font(16, True, TEAL)
    db[f"{col}7"].alignment = Alignment(horizontal="right")
    for r in (6, 7):
        db[f"{col}{r}"].border = box
db.row_dimensions[7].height = 34

header(db, 9, 2, ["Person", "Paid", "Share of costs", "Balance", "Status"])
for k in range(N):
    r, name = 10 + k, f"Setup!B{P0 + k}"
    col = L(A0 + k)
    style(db.cell(r, 2, f'=IF({name}="","",{name})'), False, bold=True)
    style(db.cell(r, 3, f'=IF(B{r}="","",SUMIFS({EX("T")},{EX("G")},B{r}))'), False, MONEY)
    style(db.cell(r, 4, f'=IF(B{r}="","",SUMIFS({EX(col)},{EX("D")},"<>Paying back"))'), False, MONEY)
    style(db.cell(r, 5, f'=IF(B{r}="","",ROUND(C{r}-SUM({EX(col)}),2))'), False, NET, True)
    style(db.cell(r, 6, f'=IF(B{r}="","",IF(ABS(E{r})<0.005,"Settled",IF(E{r}>0,"Gets back "&FIXED(E{r},2),'
                        f'"Owes "&FIXED(-E{r},2))))'), False)
db.conditional_formatting.add("F10:F21", FormulaRule(formula=['LEFT(F10,4)="Gets"'], fill=fill(OK)))
db.conditional_formatting.add("F10:F21", FormulaRule(formula=['LEFT(F10,4)="Owes"'], fill=fill(WARN)))
db.conditional_formatting.add("F10:F21", FormulaRule(formula=['F10="Settled"'], fill=fill("EEF1F1")))
db["B22"] = "Share of costs leaves out money paid back between you. Balance counts it."
db["B22"].font = font(9, color=MUTED, italic=True)

# Settle up: pay the largest debt to the largest credit, again and again. The work is hidden in
# columns AA to AL: rows 60 to 71 hold everyone's balance after each payment, rows 73 to 77 the payment itself.
S, B0, T0 = 27, 60, 73
for k in range(N):
    db.cell(B0 + k, S, f"=IF(B{10 + k}=\"\",0,E{10 + k})")
for step in range(1, N):
    prev = L(S + step - 1)
    rng_ = f"{prev}${B0}:{prev}${B0 + N - 1}"
    db[f"{prev}{T0}"] = f"=MAX({rng_})"                              # largest credit
    db[f"{prev}{T0 + 1}"] = f"=MIN({rng_})"                          # largest debt
    db[f"{prev}{T0 + 2}"] = f"=ROUND(MIN({prev}{T0},-{prev}{T0 + 1}),2)"   # amount to pay
    db[f"{prev}{T0 + 3}"] = f"=MATCH({prev}{T0},{rng_},0)"          # who gets it
    db[f"{prev}{T0 + 4}"] = f"=MATCH({prev}{T0 + 1},{rng_},0)"      # who pays
    for k in range(N):
        db.cell(B0 + k, S + step, f"=ROUND({prev}{B0 + k}-IF({k + 1}={prev}${T0 + 3},{prev}${T0 + 2},0)"
                                  f"+IF({k + 1}={prev}${T0 + 4},{prev}${T0 + 2},0),2)")
for c in range(S, S + N + 1):
    db.column_dimensions[L(c)].hidden = True
for r in list(range(B0, B0 + N)) + list(range(T0, T0 + 5)):
    db.row_dimensions[r].hidden = True
header(db, 9, 8, ["Settle up", "Amount"])
for step in range(1, N):
    r = 9 + step
    prev = L(S + step - 1)
    who = lambda row: f"INDEX($B$10:$B$21,{prev}{row})"
    none = '"Everyone is settled"' if step == 1 else '""'
    style(db.cell(r, 8, f'=IF(N({prev}{T0 + 2})<0.01,{none},{who(T0 + 4)}&" pays "&{who(T0 + 3)})'), False, bold=True)
    style(db.cell(r, 9, f'=IF(N({prev}{T0 + 2})<0.01,"",{prev}{T0 + 2})'), False, MONEY)
db["H22"] = "The fewest payments that bring every balance to zero."
db["H22"].font = font(9, color=MUTED, italic=True)

header(db, 25, 2, ["Category", "Spent", "Share"])
for k, cat in enumerate(CATS[:-1]):
    r = 26 + k
    style(db.cell(r, 2, cat), False, bold=True)
    style(db.cell(r, 3, f'=SUMIFS({EX("T")},{EX("D")},B{r})'), False, MONEY)
    style(db.cell(r, 4, f'=IF(N($B$7)=0,"",C{r}/$B$7)'), False, "0%", align="center")
chart = BarChart()
chart.type = "bar"
chart.title = "Spent by category"
chart.height, chart.width = 6, 11
chart.add_data(Reference(db, min_col=3, min_row=25, max_row=31), titles_from_data=True)
chart.set_categories(Reference(db, min_col=2, min_row=26, max_row=31))
chart.series[0].graphicalProperties.solidFill = TEAL
chart.legend = None
chart.y_axis.number_format = "#,##0"
chart.x_axis.scaling.orientation = "maxMin"
db.add_chart(chart, "F25")

header(db, 25, 11, ["Day", "Spent"])
for k in range(21):
    r = 26 + k
    day = f"({first}+{k})"
    style(db.cell(r, 11, f'=IF(OR({first}=0,{day}>{last}),"",{day})'), False, "ddd d mmm", align="center")
    style(db.cell(r, 12, f'=IF(K{r}="","",SUMIFS({EX("T")},{EX("B")},K{r},{EX("D")},"<>Paying back"))'), False, MONEY)

# ---------------------------------------------------------------- Start Here
st = wb.create_sheet("Start Here")
sheet_base(st, "Start here", "Type only in the yellow cells. Everything else is calculated.", [3, 6, 106])
steps = [
    ("1", "Setup: the trip's name, your home currency, the people on the trip and what other currencies are worth."),
    ("2", "Expenses: one line per expense, with the amount, currency and who paid."),
    ("3", "Leave the shares empty to split an expense between everyone. Or put an x under the people who share it."),
    ("4", "A number instead of an x gives someone more shares, for example 2 for someone who had two tickets."),
    ("5", "Dashboard: what each person paid, their share, their balance, and who pays whom to settle up."),
]
for k, (n, text) in enumerate(steps):
    r = 5 + k * 2
    st.cell(r, 2, n).font = font(18, True, TEAL)
    st.cell(r, 3, text).font = font(13)
for k, text in enumerate(["When someone pays another person back, add it as an expense in the category Paying back, "
                          "paid by the one who pays, with an x under the one who gets the money.",
                          "The example trip shows how it works. Delete it and start with your own.",
                          "Works in Google Sheets and Microsoft Excel, with any currencies."]):
    st.cell(16 + k * 2, 3, text).font = font(11, color=MUTED, italic=True)

wb.active = 0
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Trip-Expense-Splitter.xlsx")
wb.save(out)
print("saved", out, len(expenses), "expenses", len(people), "people")
