"""Debt Payoff Planner (Excel + Google Sheets): snowball vs avalanche, month by
month, with the debt-free date and one clear action for this month.

Each schedule sheet simulates up to 180 months. Every debt has three columns
(Due, Rem, Bal) under a header row that names the column type and one that
holds the debt's payoff rank, so SUMIF/SUMIFS can walk the row:
  Due = last balance plus a month of interest
  Rem = Due minus the minimum payment
  Bal = Rem minus the extra money that reaches this debt after every debt
        ranked before it has been cleared (the snowball rolls over).
"""
import datetime as dt
import os
import sys

from openpyxl import Workbook
from openpyxl.chart import AreaChart, Reference
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from sheetkit import (BAD, DATE, INFO, MONEY, MUTED, OK, TEAL, TEAL_D, WARN, F,  # noqa: E402
                      box, fill, font, header, sheet_base, style)

N = 10          # debts
MONTHS = 180    # 15 years
D0, D1 = 6, 6 + N - 1   # debt rows on the Debts sheet
today = dt.date.today()
start = (today.replace(day=28) + dt.timedelta(days=4)).replace(day=1)  # first day of next month

wb = Workbook()

# ---------------------------------------------------------------- Debts (inputs)
de = wb.active
de.title = "Debts"
sheet_base(de, "Your debts", "One line per debt. Only the yellow cells.", [3, 24, 14, 10, 14, 11, 11, 14, 3, 30, 16])
header(de, 5, 2, ["Debt", "Balance now", "Interest % per year", "Minimum payment", "Snowball order",
                  "Avalanche order", "Pay this month"])
sample = [("Credit card", 3200, 24.9, 96), ("Store card", 850, 29.9, 35), ("Car loan", 7400, 6.9, 210),
          ("Personal loan", 2100, 11.5, 85), ("Medical bill", 600, 0, 50)]
for k in range(N):
    r = D0 + k
    s = sample[k] if k < len(sample) else (None, None, None, None)
    style(de.cell(r, 2, s[0]), True)
    style(de.cell(r, 3, s[1]), True, MONEY)
    style(de.cell(r, 4, s[2]), True, "0.0")
    style(de.cell(r, 5, s[3]), True, MONEY)
    active = f'AND($B{r}<>"",N($C{r})>0)'
    snow = (f'=IF({active},COUNTIFS($C${D0}:$C${D1},"<"&$C{r},$B${D0}:$B${D1},"<>",$C${D0}:$C${D1},">0")'
            f'+COUNTIFS($C${D0}:$C{r},$C{r},$B${D0}:$B{r},"<>"),"")')
    aval = (f'=IF({active},COUNTIFS($D${D0}:$D${D1},">"&N($D{r}),$B${D0}:$B${D1},"<>",$C${D0}:$C${D1},">0")'
            f'+COUNTIFS($D${D0}:$D{r},N($D{r}),$B${D0}:$B{r},"<>",$C${D0}:$C{r},">0"),"")')
    style(de.cell(r, 6, snow), False, "0", align="center")
    style(de.cell(r, 7, aval), False, "0", align="center")
de.cell(D1 + 1, 2, "Total").font = font(11, True)
style(de.cell(D1 + 1, 3, f"=SUM(C{D0}:C{D1})"), False, MONEY, True)
style(de.cell(D1 + 1, 5, f"=SUMIFS(E{D0}:E{D1},C{D0}:C{D1},\">0\")"), False, MONEY, True)
TOTAL_DEBT, TOTAL_MIN = f"Debts!$C${D1 + 1}", f"Debts!$E${D1 + 1}"

settings = [
    (6, "Extra you can add every month", 200, MONEY),
    (9, "Method (Avalanche or Snowball)", "Avalanche", None),
    (12, "First payment month", start, "MMM YYYY"),
]
for r, label, value, fmt in settings:
    de.cell(r, 10, label).font = font(11, True, TEAL_D)
    c = style(de.cell(r + 1, 10, value), True, fmt, bold=True)
    c.font = font(14, True)
dv = DataValidation(type="list", formula1='"Avalanche,Snowball"', allow_blank=False)
de.add_data_validation(dv)
dv.add("J10")
de["J15"] = "Avalanche: highest interest first (saves the most money)."
de["J16"] = "Snowball: smallest balance first (quick wins, more motivation)."
for a in ("J15", "J16"):
    de[a].font = font(10, color=MUTED, italic=True)
EXTRA, METHOD, START = "Debts!$J$7", "Debts!$J$10", "Debts!$J$13"

# ---------------------------------------------------------------- schedules
first_row, last_row = 8, 8 + MONTHS - 1
DEBT_COL0 = 8  # column H
last_col = DEBT_COL0 + 3 * N - 1
TYPE_ROW = f"${L(DEBT_COL0)}$5:${L(last_col)}$5"
RANK_ROW = f"${L(DEBT_COL0)}$4:${L(last_col)}$4"


def schedule(name, rank_col):
    ws = wb.create_sheet(name)
    sheet_base(ws, f"{name}: month by month", "Calculated for you. Nothing to type here.",
               [3, 8, 11, 12, 12, 12, 13] + [11] * (3 * N), rows=last_row + 2)
    for c, label in zip(range(2, 8), ["Month", "Date", "Paying", "Extra left", "Interest", "Total owed"]):
        cell = ws.cell(6, c, label)
        cell.font = font(10, True, "FFFFFF")
        cell.fill = fill(TEAL)
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
    for k in range(N):
        dr = D0 + k
        for t, typ in enumerate(("Due", "Rem", "Bal")):
            c = DEBT_COL0 + 3 * k + t
            ws.cell(4, c, f"=IF(Debts!${rank_col}${dr}=\"\",\"\",Debts!${rank_col}${dr})").font = font(8, color=MUTED)
            ws.cell(5, c, typ).font = font(8, color=MUTED)
            h = ws.cell(6, c, f'=IF(Debts!$B${dr}="","",Debts!$B${dr}&" · {typ.lower()}")' if typ != "Bal"
                        else f'=IF(Debts!$B${dr}="","",Debts!$B${dr})')
            h.font = font(9, True, "FFFFFF")
            h.fill = fill(TEAL if typ == "Bal" else "4F8A90")
            h.alignment = Alignment(horizontal="center", wrap_text=True)
            if typ != "Bal":
                ws.column_dimensions[L(c)].hidden = True
    ws.row_dimensions[6].height = 34
    # Month 0: starting balances.
    ws.cell(7, 2, 0)
    for k in range(N):
        c = DEBT_COL0 + 3 * k + 2
        ws.cell(7, c, f"=N(Debts!$C${D0 + k})").number_format = MONEY
    ws.cell(7, 7, f"=SUMIF({TYPE_ROW},\"Bal\",{L(DEBT_COL0)}7:{L(last_col)}7)").number_format = MONEY
    for r in range(first_row, last_row + 1):
        row = f"{L(DEBT_COL0)}{r}:{L(last_col)}{r}"
        prev = f"{L(DEBT_COL0)}{r - 1}:{L(last_col)}{r - 1}"
        ws.cell(r, 2, r - first_row + 1)
        ws.cell(r, 3, f"=EDATE({START},B{r}-1)").number_format = "MMM YYYY"
        ws.cell(r, 4, f"=IF(G{r - 1}<=0.005,0,{TOTAL_MIN}+{EXTRA})").number_format = MONEY
        ws.cell(r, 5, f"=MAX(0,D{r}-(SUMIF({TYPE_ROW},\"Due\",{row})-SUMIF({TYPE_ROW},\"Rem\",{row})))").number_format = MONEY
        ws.cell(r, 6, f"=SUMIF({TYPE_ROW},\"Due\",{row})-SUMIF({TYPE_ROW},\"Bal\",{prev})").number_format = MONEY
        ws.cell(r, 7, f"=SUMIF({TYPE_ROW},\"Bal\",{row})").number_format = MONEY
        for k in range(N):
            dr = D0 + k
            cd, cr, cb = (L(DEBT_COL0 + 3 * k + t) for t in range(3))
            ws[f"{cd}{r}"] = f"={cb}{r - 1}*(1+N(Debts!$D${dr})/1200)"
            ws[f"{cr}{r}"] = f"={cd}{r}-MIN(N(Debts!$E${dr}),{cd}{r})"
            ws[f"{cb}{r}"] = (f"=IF({cr}{r}<=0.005,0,{cr}{r}-MIN({cr}{r},MAX(0,$E{r}-SUMIFS({row},{TYPE_ROW},\"Rem\","
                              f"{RANK_ROW},\"<\"&{cb}$4))))")
            for c in (cd, cr, cb):
                ws[f"{c}{r}"].number_format = MONEY
    ws.freeze_panes = "D7"
    ws.conditional_formatting.add(f"{L(DEBT_COL0)}{first_row}:{L(last_col)}{last_row}",
                                  FormulaRule(formula=[f'AND({L(DEBT_COL0)}$5="Bal",{L(DEBT_COL0)}{first_row}<=0.005,'
                                                       f'{L(DEBT_COL0)}{first_row - 1}>0.005)'],
                                              fill=fill(OK), font=Font(name=F, bold=True, color="2F6B3A")))
    return ws


snow = schedule("Snowball", "F")
aval = schedule("Avalanche", "G")

# Per-debt payment in month 1 for the chosen method, and each debt's payoff month.
for k in range(N):
    r = D0 + k
    cd, cb = L(DEBT_COL0 + 3 * k), L(DEBT_COL0 + 3 * k + 2)
    pay = (f'=IF($B{r}="","",IF({METHOD}="Snowball",Snowball!{cd}{first_row}-Snowball!{cb}{first_row},'
           f'Avalanche!{cd}{first_row}-Avalanche!{cb}{first_row}))')
    style(de.cell(r, 8, pay), False, MONEY, True)
de.conditional_formatting.add(f"B{D0}:H{D1}", FormulaRule(
    formula=[f'AND($B{D0}<>"",IF($J$10="Snowball",$F{D0},$G{D0})=1)'], fill=fill(OK)))


def months_to_zero(sheet, col):
    rng = f"{sheet}!${col}${first_row}:${col}${last_row}"
    return f'IF(COUNTIF({rng},">0.005")>={MONTHS},"",COUNTIF({rng},">0.005")+1)'


# ---------------------------------------------------------------- Dashboard
db = wb.create_sheet("Dashboard", 0)
sheet_base(db, "Your way out of debt", "Change the method or the extra amount on the Debts tab: everything updates.",
           [3, 24, 16, 16, 16, 16, 3, 22, 18, 18])
free = {m: months_to_zero(m, "G") for m in ("Snowball", "Avalanche")}
interest = {m: f"SUM({m}!$F${first_row}:$F${last_row})" for m in ("Snowball", "Avalanche")}
chosen_months = f'IF({METHOD}="Snowball",{free["Snowball"]},{free["Avalanche"]})'
tiles = [
    ("B", "Total debt now", f"={TOTAL_DEBT}", MONEY, "B4541F"),
    ("C", "Paying per month", f"={TOTAL_MIN}+{EXTRA}", MONEY, TEAL),
    ("D", "Interest you will pay", f'=IF({METHOD}="Snowball",{interest["Snowball"]},{interest["Avalanche"]})', MONEY, "B4541F"),
    ("E", "Months to go", f"={chosen_months}", "0", TEAL),
]
for col, label, formula, fmt, colour in tiles:
    db[f"{col}6"] = label
    db[f"{col}6"].font = font(10, True, MUTED)
    db[f"{col}7"] = formula
    db[f"{col}7"].number_format = fmt
    db[f"{col}7"].font = font(18, True, colour)
    for r in (6, 7):
        db[f"{col}{r}"].fill = fill("FFFFFF")
        db[f"{col}{r}"].border = box
db["F6"] = "Debt-free in"
db["F7"] = f'=IF({chosen_months}="","15+ years",EDATE({START},{chosen_months}-1))'
db["F7"].number_format = "MMMM YYYY"
for a, size in (("F6", 11), ("F7", 20)):
    db[a].font = font(size, True, "FFFFFF")
    db[a].fill = fill(TEAL_D)
    db[a].alignment = Alignment(horizontal="center", vertical="center")
db.row_dimensions[7].height = 40

focus = f'INDEX(Debts!$B${D0}:$B${D1},MATCH(1,IF({METHOD}="Snowball",Debts!$F${D0}:$F${D1},Debts!$G${D0}:$G${D1}),0))'
focus_pay = f'INDEX(Debts!$H${D0}:$H${D1},MATCH(1,IF({METHOD}="Snowball",Debts!$F${D0}:$F${D1},Debts!$G${D0}:$G${D1}),0))'
db["B9"] = "This month"
db["B9"].font = font(12, True, "FFFFFF")
db["B9"].fill = fill(TEAL)
db["B10"] = (f'=IFERROR("Pay the minimum on every debt, and "&FIXED({focus_pay},2)&" on "&{focus}'
             f'&". That is your focus debt.","Add your debts on the Debts tab.")')
db["B10"].font = font(13, True)
db["B10"].fill = fill("FFFFFF")
db.merge_cells("B10:F10")
db.row_dimensions[10].height = 30
db["B10"].alignment = Alignment(vertical="center", wrap_text=True)

header(db, 12, 2, ["Compare", "Months", "Debt-free", "Interest", "Difference"])
for i, m in enumerate(("Avalanche", "Snowball")):
    r = 13 + i
    style(db.cell(r, 2, m), False, bold=True)
    style(db.cell(r, 3, f"={free[m]}"), False, "0", align="center")
    style(db.cell(r, 4, f'=IF(C{r}="","15+ years",EDATE({START},C{r}-1))'), False, "MMM YYYY", align="center")
    style(db.cell(r, 5, f"={interest[m]}"), False, MONEY)
style(db.cell(13, 6, '=IF(E14-E13>0.5,"saves "&FIXED(E14-E13,0)&" in interest","same interest")'), False)
style(db.cell(14, 6, f'="1st debt gone in "&MIN(Debts!$M${D0}:$M${D1})&" mo (vs "&MIN(Debts!$N${D0}:$N${D1})&")"'), False)
# Google Sheets only accepts other-sheet references in conditional formatting through INDIRECT.
db.conditional_formatting.add("B13:F14", FormulaRule(formula=['$B13=INDIRECT("Debts!J10")'], fill=fill(OK)))

header(db, 16, 2, ["Debt", "Balance now", "Interest %", "Paid off in", "Order"])
for k in range(N):
    r, dr = 17 + k, D0 + k
    style(db.cell(r, 2, f'=IF(Debts!B{dr}="","",Debts!B{dr})'), False, bold=True)
    style(db.cell(r, 3, f'=IF(Debts!B{dr}="","",Debts!C{dr})'), False, MONEY)
    style(db.cell(r, 4, f'=IF(Debts!B{dr}="","",Debts!D{dr})'), False, "0.0", align="center")
    style(db.cell(r, 5, f'=IF(OR(Debts!B{dr}="",Debts!I{dr}=""),"",EDATE({START},Debts!I{dr}-1))'), False, "MMM YYYY",
          align="center")
    style(db.cell(r, 6, f'=IF(Debts!B{dr}="","",IF({METHOD}="Snowball",Debts!F{dr},Debts!G{dr}))'), False, "0",
          align="center")
db.conditional_formatting.add(f"B17:F{16 + N}", FormulaRule(formula=["$F17=1"], fill=fill(OK)))
db.column_dimensions["F"].width = 30

# Payoff month per debt: M snowball, N avalanche, I the chosen one (helpers, hidden).
de["I5"], de["M5"], de["N5"] = "Paid off (month #)", "Snowball month #", "Avalanche month #"
for k in range(N):
    r = D0 + k
    col = L(DEBT_COL0 + 3 * k + 2)
    de.cell(r, 13, f'=IF($B{r}="","",{months_to_zero("Snowball", col)})')
    de.cell(r, 14, f'=IF($B{r}="","",{months_to_zero("Avalanche", col)})')
    de.cell(r, 9, f'=IF($B{r}="","",IF({METHOD}="Snowball",M{r},N{r}))')
for col in ("I", "M", "N"):
    de.column_dimensions[col].hidden = True

# Chart data: the chosen plan's balance per debt, first 60 months (hidden sheet).
cd_ws = wb.create_sheet("Chart data")
CHART_MONTHS = 48
cd_ws["A1"] = "Month"
for k in range(N):
    cd_ws.cell(1, 2 + k, f'=IF(Debts!$B${D0 + k}=""," ",Debts!$B${D0 + k})')
for m in range(CHART_MONTHS + 1):
    cd_ws.cell(2 + m, 1, m)
    for k in range(N):
        col = L(DEBT_COL0 + 3 * k + 2)
        cd_ws.cell(2 + m, 2 + k, f'=IF({METHOD}="Snowball",Snowball!{col}{7 + m},Avalanche!{col}{7 + m})')
cd_ws.sheet_state = "hidden"

chart = AreaChart()
chart.grouping = "stacked"
chart.title = "Watch each debt disappear"
chart.height, chart.width = 8.5, 17
chart.x_axis.title = "Months from now"
chart.y_axis.majorGridlines = None
chart.add_data(Reference(cd_ws, min_col=2, max_col=1 + N, min_row=1, max_row=2 + CHART_MONTHS), titles_from_data=True)
chart.set_categories(Reference(cd_ws, min_col=1, min_row=2, max_row=2 + CHART_MONTHS))
palette = ["1F6F78", "E0A21B", "B4541F", "6B8F71", "8C6BB1", "4F8A90", "C98A0B", "9B1C1C", "5E6E72", "2F6B3A"]
for s, colour in zip(chart.series, palette):
    s.graphicalProperties.solidFill = colour
    s.graphicalProperties.line.noFill = True
db.add_chart(chart, "H12")

# ---------------------------------------------------------------- Start Here
st = wb.create_sheet("Start Here")
sheet_base(st, "Start here: 3 minutes", "Only type in YELLOW cells.", [3, 6, 100])
steps = [
    ("1", "Debts tab: one line per debt: balance, yearly interest %, minimum payment."),
    ("2", "Debts tab: how much EXTRA you can pay every month (even 20 helps), and the first payment month."),
    ("3", "Pick a method: Avalanche (least interest) or Snowball (quick wins). The Dashboard compares both."),
    ("★", "Dashboard: your debt-free date, and ONE thing to do this month: which debt gets the extra money."),
    ("↻", "Every month: update the balances from your statements. The plan re-calculates."),
]
for k, (n, text) in enumerate(steps):
    r = 5 + k * 2
    st.cell(r, 2, n).font = font(18, True, TEAL)
    st.cell(r, 3, text).font = font(13)
st["C17"] = "Snowball and Avalanche tabs show the month-by-month plan. Green cell = the month a debt is gone."
st["C17"].font = font(11, color=MUTED, italic=True)
st["C19"] = "A planning tool, not financial advice. Works in Google Sheets and Microsoft Excel."
st["C19"].font = font(11, color=MUTED, italic=True)

wb.active = 0
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Debt-Payoff-Planner.xlsx")
wb.save(out)
print("saved", out)
