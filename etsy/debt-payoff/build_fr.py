"""Plan de remboursement de dettes (version française de build.py; Excel + Google Sheets): snowball vs avalanche, month by
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
de.title = "Dettes"
sheet_base(de, "Vos dettes", "Une ligne par dette. Uniquement les cases jaunes.", [3, 24, 14, 10, 14, 11, 11, 14, 3, 30, 16])
header(de, 5, 2, ["Dette", "Solde actuel", "Taux % par an", "Paiement minimum", "Ordre boule de neige",
                  "Ordre avalanche", "À payer ce mois-ci"])
sample = [("Carte de crédit", 3200, 24.9, 96), ("Carte de magasin", 850, 29.9, 35), ("Prêt auto", 7400, 6.9, 210),
          ("Prêt personnel", 2100, 11.5, 85), ("Frais médicaux", 600, 0, 50)]
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
TOTAL_DEBT, TOTAL_MIN = f"Dettes!$C${D1 + 1}", f"Dettes!$E${D1 + 1}"

settings = [
    (6, "Montant en plus chaque mois", 200, MONEY),
    (9, "Méthode (Avalanche ou Boule de neige)", "Avalanche", None),
    (12, "Mois du premier paiement", start, "MMM YYYY"),
]
for r, label, value, fmt in settings:
    de.cell(r, 10, label).font = font(11, True, TEAL_D)
    c = style(de.cell(r + 1, 10, value), True, fmt, bold=True)
    c.font = font(14, True)
dv = DataValidation(type="list", formula1='"Avalanche,Boule de neige"', allow_blank=False)
de.add_data_validation(dv)
dv.add("J10")
de["J15"] = "Avalanche : le taux le plus élevé d’abord (le moins d’intérêts)."
de["J16"] = "Boule de neige : le plus petit solde d’abord (victoires rapides)."
for a in ("J15", "J16"):
    de[a].font = font(10, color=MUTED, italic=True)
EXTRA, METHOD, START = "Dettes!$J$7", "Dettes!$J$10", "Dettes!$J$13"

# ---------------------------------------------------------------- schedules
first_row, last_row = 8, 8 + MONTHS - 1
DEBT_COL0 = 8  # column H
last_col = DEBT_COL0 + 3 * N - 1
TYPE_ROW = f"${L(DEBT_COL0)}$5:${L(last_col)}$5"
RANK_ROW = f"${L(DEBT_COL0)}$4:${L(last_col)}$4"


def schedule(name, rank_col):
    ws = wb.create_sheet(name)
    sheet_base(ws, f"{ {'Snowball': 'Boule de neige'}.get(name, name)} : mois par mois", "Calculé pour vous. Rien à taper ici.",
               [3, 8, 11, 12, 12, 12, 13] + [11] * (3 * N), rows=last_row + 2)
    for c, label in zip(range(2, 8), ["Mois", "Date", "Versé", "Reste en plus", "Intérêts", "Total dû"]):
        cell = ws.cell(6, c, label)
        cell.font = font(10, True, "FFFFFF")
        cell.fill = fill(TEAL)
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
    for k in range(N):
        dr = D0 + k
        for t, typ in enumerate(("Due", "Rem", "Bal")):
            c = DEBT_COL0 + 3 * k + t
            ws.cell(4, c, f"=IF(Dettes!${rank_col}${dr}=\"\",\"\",Dettes!${rank_col}${dr})").font = font(8, color=MUTED)
            ws.cell(5, c, typ).font = font(8, color=MUTED)
            h = ws.cell(6, c, f'=IF(Dettes!$B${dr}="","",Dettes!$B${dr}&" · {typ.lower()}")' if typ != "Bal"
                        else f'=IF(Dettes!$B${dr}="","",Dettes!$B${dr})')
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
        ws.cell(7, c, f"=N(Dettes!$C${D0 + k})").number_format = MONEY
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
            ws[f"{cd}{r}"] = f"={cb}{r - 1}*(1+N(Dettes!$D${dr})/1200)"
            ws[f"{cr}{r}"] = f"={cd}{r}-MIN(N(Dettes!$E${dr}),{cd}{r})"
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
    pay = (f'=IF($B{r}="","",IF({METHOD}="Boule de neige",Snowball!{cd}{first_row}-Snowball!{cb}{first_row},'
           f'Avalanche!{cd}{first_row}-Avalanche!{cb}{first_row}))')
    style(de.cell(r, 8, pay), False, MONEY, True)
de.conditional_formatting.add(f"B{D0}:H{D1}", FormulaRule(
    formula=[f'AND($B{D0}<>"",IF($J$10="Boule de neige",$F{D0},$G{D0})=1)'], fill=fill(OK)))


def months_to_zero(sheet, col):
    rng = f"{sheet}!${col}${first_row}:${col}${last_row}"
    return f'IF(COUNTIF({rng},">0.005")>={MONTHS},"",COUNTIF({rng},">0.005")+1)'


# ---------------------------------------------------------------- Dashboard
db = wb.create_sheet("Tableau de bord", 0)
sheet_base(db, "Votre sortie de l’endettement", "Changez la méthode ou le montant en plus dans l’onglet Dettes : tout se met à jour.",
           [3, 24, 16, 16, 16, 16, 3, 22, 18, 18])
free = {m: months_to_zero(m, "G") for m in ("Snowball", "Avalanche")}
interest = {m: f"SUM({m}!$F${first_row}:$F${last_row})" for m in ("Snowball", "Avalanche")}
chosen_months = f'IF({METHOD}="Boule de neige",{free["Snowball"]},{free["Avalanche"]})'
tiles = [
    ("B", "Dette totale", f"={TOTAL_DEBT}", MONEY, "B4541F"),
    ("C", "Versé par mois", f"={TOTAL_MIN}+{EXTRA}", MONEY, TEAL),
    ("D", "Intérêts à payer", f'=IF({METHOD}="Boule de neige",{interest["Snowball"]},{interest["Avalanche"]})', MONEY, "B4541F"),
    ("E", "Mois restants", f"={chosen_months}", "0", TEAL),
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
db["F6"] = "Libre de dettes en"
db["F7"] = f'=IF({chosen_months}="","15+ ans",EDATE({START},{chosen_months}-1))'
db["F7"].number_format = "MMMM YYYY"
for a, size in (("F6", 11), ("F7", 20)):
    db[a].font = font(size, True, "FFFFFF")
    db[a].fill = fill(TEAL_D)
    db[a].alignment = Alignment(horizontal="center", vertical="center")
db.row_dimensions[7].height = 40

focus = f'INDEX(Dettes!$B${D0}:$B${D1},MATCH(1,IF({METHOD}="Boule de neige",Dettes!$F${D0}:$F${D1},Dettes!$G${D0}:$G${D1}),0))'
focus_pay = f'INDEX(Dettes!$H${D0}:$H${D1},MATCH(1,IF({METHOD}="Boule de neige",Dettes!$F${D0}:$F${D1},Dettes!$G${D0}:$G${D1}),0))'
db["B9"] = "Ce mois-ci"
db["B9"].font = font(12, True, "FFFFFF")
db["B9"].fill = fill(TEAL)
db["B10"] = (f'=IFERROR("Payez le minimum sur chaque dette, et "&FIXED({focus_pay},2)&" sur "&{focus}'
             f'&". C’est votre dette prioritaire.","Ajoutez vos dettes dans l’onglet Dettes.")')
db["B10"].font = font(13, True)
db["B10"].fill = fill("FFFFFF")
db.merge_cells("B10:F10")
db.row_dimensions[10].height = 30
db["B10"].alignment = Alignment(vertical="center", wrap_text=True)

header(db, 12, 2, ["Comparer", "Mois", "Libre en", "Intérêts", "Différence"])
for i, m in enumerate(("Avalanche", "Snowball")):
    r = 13 + i
    style(db.cell(r, 2, {"Snowball": "Boule de neige"}.get(m, m)), False, bold=True)
    style(db.cell(r, 3, f"={free[m]}"), False, "0", align="center")
    style(db.cell(r, 4, f'=IF(C{r}="","15+ ans",EDATE({START},C{r}-1))'), False, "MMM YYYY", align="center")
    style(db.cell(r, 5, f"={interest[m]}"), False, MONEY)
style(db.cell(13, 6, '=IF(E14-E13>0.5,"économise "&FIXED(E14-E13,0)&" d’intérêts","mêmes intérêts")'), False)
style(db.cell(14, 6, f'="1re dette soldée en "&MIN(Dettes!$M${D0}:$M${D1})&" mois (vs "&MIN(Dettes!$N${D0}:$N${D1})&")"'), False)
# Google Sheets only accepts other-sheet references in conditional formatting through INDIRECT.
db.conditional_formatting.add("B13:F14", FormulaRule(formula=['$B13=INDIRECT("Dettes!J10")'], fill=fill(OK)))

header(db, 16, 2, ["Dette", "Solde actuel", "Taux %", "Soldée en", "Ordre"])
for k in range(N):
    r, dr = 17 + k, D0 + k
    style(db.cell(r, 2, f'=IF(Dettes!B{dr}="","",Dettes!B{dr})'), False, bold=True)
    style(db.cell(r, 3, f'=IF(Dettes!B{dr}="","",Dettes!C{dr})'), False, MONEY)
    style(db.cell(r, 4, f'=IF(Dettes!B{dr}="","",Dettes!D{dr})'), False, "0.0", align="center")
    style(db.cell(r, 5, f'=IF(OR(Dettes!B{dr}="",Dettes!I{dr}=""),"",EDATE({START},Dettes!I{dr}-1))'), False, "MMM YYYY",
          align="center")
    style(db.cell(r, 6, f'=IF(Dettes!B{dr}="","",IF({METHOD}="Boule de neige",Dettes!F{dr},Dettes!G{dr}))'), False, "0",
          align="center")
db.conditional_formatting.add(f"B17:F{16 + N}", FormulaRule(formula=["$F17=1"], fill=fill(OK)))
db.column_dimensions["F"].width = 30

# Payoff month per debt: M snowball, N avalanche, I the chosen one (helpers, hidden).
de["I5"], de["M5"], de["N5"] = "Soldée (mois n°)", "Boule de neige n°", "Avalanche n°"
for k in range(N):
    r = D0 + k
    col = L(DEBT_COL0 + 3 * k + 2)
    de.cell(r, 13, f'=IF($B{r}="","",{months_to_zero("Snowball", col)})')
    de.cell(r, 14, f'=IF($B{r}="","",{months_to_zero("Avalanche", col)})')
    de.cell(r, 9, f'=IF($B{r}="","",IF({METHOD}="Boule de neige",M{r},N{r}))')
for col in ("I", "M", "N"):
    de.column_dimensions[col].hidden = True

# Chart data: the chosen plan's balance per debt, first 60 months (hidden sheet).
cd_ws = wb.create_sheet("Donnees graphique")
CHART_MONTHS = 48
cd_ws["A1"] = "Mois"
for k in range(N):
    cd_ws.cell(1, 2 + k, f'=IF(Dettes!$B${D0 + k}=""," ",Dettes!$B${D0 + k})')
for m in range(CHART_MONTHS + 1):
    cd_ws.cell(2 + m, 1, m)
    for k in range(N):
        col = L(DEBT_COL0 + 3 * k + 2)
        cd_ws.cell(2 + m, 2 + k, f'=IF({METHOD}="Boule de neige",Snowball!{col}{7 + m},Avalanche!{col}{7 + m})')
cd_ws.sheet_state = "hidden"

chart = AreaChart()
chart.grouping = "stacked"
chart.title = "Regardez chaque dette disparaître"
chart.height, chart.width = 8.5, 17
chart.x_axis.title = "Mois à partir de maintenant"
chart.y_axis.majorGridlines = None
chart.add_data(Reference(cd_ws, min_col=2, max_col=1 + N, min_row=1, max_row=2 + CHART_MONTHS), titles_from_data=True)
chart.set_categories(Reference(cd_ws, min_col=1, min_row=2, max_row=2 + CHART_MONTHS))
palette = ["1F6F78", "E0A21B", "B4541F", "6B8F71", "8C6BB1", "4F8A90", "C98A0B", "9B1C1C", "5E6E72", "2F6B3A"]
for s, colour in zip(chart.series, palette):
    s.graphicalProperties.solidFill = colour
    s.graphicalProperties.line.noFill = True
db.add_chart(chart, "H12")

# ---------------------------------------------------------------- Start Here
st = wb.create_sheet("Commencer ici")
sheet_base(st, "Commencer ici : 3 minutes", "Tapez uniquement dans les cases JAUNES.", [3, 6, 100])
steps = [
    ("1", "Onglet Dettes : une ligne par dette : solde, taux annuel %, paiement minimum."),
    ("2", "Onglet Dettes : combien vous pouvez payer EN PLUS chaque mois (même 20 aide), et le mois du premier paiement."),
    ("3", "Choisissez une méthode : Avalanche (moins d’intérêts) ou Boule de neige (victoires rapides). Le Tableau de bord compare les deux."),
    ("★", "Tableau de bord : votre date de liberté, et UNE chose à faire ce mois-ci : quelle dette reçoit l’argent en plus."),
    ("↻", "Chaque mois : mettez à jour les soldes d’après vos relevés. Le plan se recalcule."),
]
for k, (n, text) in enumerate(steps):
    r = 5 + k * 2
    st.cell(r, 2, n).font = font(18, True, TEAL)
    st.cell(r, 3, text).font = font(13)
st["C17"] = "Les onglets Snowball et Avalanche montrent le plan mois par mois. Case verte = le mois où une dette disparaît."
st["C17"].font = font(11, color=MUTED, italic=True)
st["C19"] = "Outil de planification, pas un conseil financier. Fonctionne dans Google Sheets et Microsoft Excel."
st["C19"].font = font(11, color=MUTED, italic=True)

wb.active = 0
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Plan-Remboursement-Dettes.xlsx")
wb.save(out)
print("saved", out)
