"""Personal Loan Tracker for money lent to or borrowed from friends and family (Excel + Google Sheets).

Each loan with an optional payment plan (every week, two weeks or month) and simple interest; payments as they come
in or go out; the balance, the next payment and what is overdue; a statement to print or share for any loan, with a
reminder message ready to send; and a Dashboard with who owes what and the next payments. Only functions both apps
have.
"""
import datetime as dt
import os
import sys

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from sheetkit import (BAD, DATE, MONEY, MUTED, OK, TEAL, TEAL_D, WARN, box, fill, font, header,  # noqa: E402
                      sheet_base, style)

today = dt.date.today()
N0, N1 = 6, 305        # loans
Q0, Q1 = 6, 805        # payments
ME, CUR, SOON = "Settings!$C$4", "Settings!$C$5", "Settings!$C$6"
MON_LIST = '"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"'
LN = lambda c: f"Loans!${c}${N0}:${c}${N1}"
LN1 = lambda c: f"Loans!${c}$1:${c}${N1}"
PY = lambda c: f"Payments!${c}${Q0}:${c}${Q1}"
PY1 = lambda c: f"Payments!${c}$1:${c}${Q1}"


def long_date(d):
    return f'DAY({d})&" "&CHOOSE(MONTH({d}),{MON_LIST})&" "&YEAR({d})'


def money(x):
    return f'FIXED({x},2)&IF({CUR}="",""," "&{CUR})'


def edate(d, n):
    return f"EDATE({d},{n})"


D = lambda n: today + dt.timedelta(days=n)


def add_months(d, n):
    m = d.month - 1 + n
    y, m = d.year + m // 12, m % 12 + 1
    last = [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return dt.date(y, m, min(d.day, last[m - 1]))


first_of = lambda k: add_months(today.replace(day=1), -k)

# ---------------------------------------------------------------- example data (made-up friends and family)
loans = [
    # person, direction, date, amount, interest % a year, payments, every, first payment, notes
    ("Sam", "I lent", add_months(first_of(5), 0) - dt.timedelta(days=10), 500, None, 10, "Month",
     first_of(5), "Car repair"),
    ("Priya", "I lent", first_of(7) + dt.timedelta(days=2), 1200, 3, 12, "Month",
     first_of(6) + dt.timedelta(days=14), "Deposit for the flat"),
    ("Jonah", "I lent", D(-40), 80, None, None, None, None, "Festival ticket"),
    ("Aunt Rosa", "I borrowed", first_of(10), 2000, None, 20, "Month", first_of(9), "Laptop for college"),
    ("Leo", "I lent", D(-60), 150, None, 3, "2 weeks", D(-46), None),
    ("Mira", "I borrowed", D(-9), 60, None, None, None, None, "Train tickets"),
    ("Sam", "I lent", D(-75), 40, None, None, None, None, "Concert"),
    ("Dev", "I lent", D(-20), 240, None, 8, "Week", D(-13), "Phone screen"),
]
payments = []


sam, priya, rosa, leo, dev = loans[0], loans[1], loans[3], loans[4], loans[7]
for k in range(4):                                             # Sam paid four and then missed one
    payments.append([add_months(sam[7], k) + dt.timedelta(days=1), "1 Sam", 50, "Bank transfer", None])
for k in range(7):                                             # Priya on time every month
    if add_months(priya[7], k) < today:
        payments.append([add_months(priya[7], k), "2 Priya", 103, "Bank transfer", None])
payments.append([D(-30), "3 Jonah", 30, "Cash", "Paid part at the pub"])
for k in range(12):                                            # I pay Aunt Rosa back
    if add_months(rosa[7], k) < today:
        payments.append([add_months(rosa[7], k), "4 Aunt Rosa", 100, "Bank transfer", None])
for k in range(3):
    payments.append([leo[7] + dt.timedelta(days=14 * k), "5 Leo", 50, "App", None])
payments.append([D(-70), "7 Sam", 40, "Cash", None])
for k in range(2):
    payments.append([dev[7] + dt.timedelta(days=7 * k), "8 Dev", 30, "App", None])
payments.sort(key=lambda p: p[0])

wb = Workbook()


def dropdown(ws, formula, cells, strict=True):
    dv = DataValidation(type="list", formula1=formula, allow_blank=True, showErrorMessage=strict)
    ws.add_data_validation(dv)
    dv.add(cells)


def tile(ws, c, row, label, formula, fmt, colour=TEAL):
    ws[f"{c}{row}"] = label
    ws[f"{c}{row}"].font = font(10, True, MUTED)
    ws[f"{c}{row + 1}"] = formula
    ws[f"{c}{row + 1}"].number_format = fmt
    ws[f"{c}{row + 1}"].font = font(16, True, colour)
    ws[f"{c}{row + 1}"].alignment = Alignment(horizontal="right")
    for r in (row, row + 1):
        ws[f"{c}{r}"].border = box
    ws.row_dimensions[row + 1].height = 34


def status_colours(ws, rng, first, cell):
    for text, colour in (("Overdue", BAD), ("Due soon", WARN)):
        ws.conditional_formatting.add(rng, FormulaRule(formula=[f'{cell}{first}="{text}"'], fill=fill(colour)))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'{cell}{first}="Paid off"'], font=Font(color="8A9699")))


# ---------------------------------------------------------------- Settings
se = wb.active
se.title = "Settings"
sheet_base(se, "Settings", "Your name for the statements, the currency, and when a payment counts as due soon.",
           [3, 30, 22, 4, 60], rows=10)
for r, label, value, fmt, note in (
        (4, "Your name", "Alex", None, "On the statements and in the messages."),
        (5, "Currency", "USD", None, "Shown after amounts in the statements and messages."),
        (6, "Due soon: days before", 7, "0", "A payment this close shows as Due soon.")):
    se[f"B{r}"] = label
    se[f"B{r}"].font = font(11, True)
    style(se[f"C{r}"], True, fmt, r == 4, "center" if r == 6 else None)
    se[f"C{r}"] = value
    se.cell(r, 5, note).font = font(10, color=MUTED, italic=True)

# ---------------------------------------------------------------- Loans
ln = wb.create_sheet("Loans")
sheet_base(ln, "Loans", "Each loan once. A plan is optional: how many payments and how often. Interest is simple, "
           "on the amount of the loan.", [3, 5, 14, 12, 12, 10, 9, 9, 10, 12, 22, 11, 10, 11, 11, 12, 11, 12],
           rows=N1 + 2)
header(ln, 5, 2, ["No.", "Person", "Who lent", "Date", "Amount", "Interest (% a year)", "Payments", "Every",
                  "First payment", "Notes", "To repay", "Each payment", "Paid so far", "Still to pay", "Next due",
                  "Next amount", "Status"])
for r in range(N0, N1 + 1):
    x = loans[r - N0] if r - N0 < len(loans) else (None,) * 9
    person, way, date, amount, rate, n, every, first, notes = x
    ln.cell(r, 2, r - N0 + 1).font = font(10, color=MUTED)
    ln.cell(r, 2).alignment = Alignment(horizontal="center")
    ln.cell(r, 2).border = box
    for c, v, fmt in zip(range(3, 12), x, (None, None, DATE, MONEY, "0.##", "0", None, DATE, None)):
        style(ln.cell(r, c, v), True, fmt, c == 3, "center" if c in (4, 5, 7, 8, 9, 10) else None)
    years = (f'IF(N(H{r})>0,N(H{r})*IF(I{r}="Week",7/365,IF(I{r}="2 weeks",14/365,1/12)),'
             f'IF(ISNUMBER(E{r}),MAX(0,TODAY()-E{r})/365,0))')
    style(ln.cell(r, 12, f'=IF(C{r}="","",ROUND(N(F{r})*(1+N(G{r})/100*{years}),2))'), False, MONEY)
    style(ln.cell(r, 13, f'=IF(OR(C{r}="",N(H{r})<=0),"",ROUND(L{r}/N(H{r}),2))'), False, MONEY)
    style(ln.cell(r, 14, f'=IF(C{r}="","",SUMIFS({PY("D")},{PY("G")},B{r}))'), False, MONEY)
    style(ln.cell(r, 15, f'=IF(C{r}="","",ROUND(L{r}-N{r},2))'), False, MONEY, True)
    step = lambda k: f'IF(I{r}="Week",J{r}+7*{k},IF(I{r}="2 weeks",J{r}+14*{k},{edate(f"J{r}", k)}))'
    ln[f"U{r}"] = (f'=IF(OR(M{r}="",NOT(ISNUMBER(J{r}))),"",IF(N(M{r})<=0,"",'
                   f'MIN(N(H{r})-1,INT(ROUND(N{r}/M{r},6)))))')                                # U: payments covered
    style(ln.cell(r, 16, f'=IF(OR(U{r}="",N(O{r})<=0),"",{step(f"U{r}")})'), False, DATE, align="center")
    style(ln.cell(r, 17, f'=IF(P{r}="","",IF(U{r}=N(H{r})-1,O{r},ROUND(M{r}*(U{r}+1)-N{r},2)))'), False, MONEY)
    past = "(TODAY()-1)"
    months = f"((YEAR({past})-YEAR(J{r}))*12+MONTH({past})-MONTH(J{r}))"
    count = (f'IF(I{r}="Week",IF({past}<J{r},0,INT(({past}-J{r})/7)+1),IF(I{r}="2 weeks",IF({past}<J{r},0,'
             f'INT(({past}-J{r})/14)+1),IF({months}<0,0,IF({edate(f"J{r}", months)}<={past},{months}+1,{months}))))')
    ln[f"T{r}"] = f'=IF(OR(M{r}="",NOT(ISNUMBER(J{r}))),"",MIN(N(H{r}),{count}))'           # T: payments due by now
    ln[f"V{r}"] = f'=IF(T{r}="","",IF(T{r}>=N(H{r}),L{r},M{r}*T{r}))'                        # V: due by now
    ln[f"W{r}"] = f'=IF(V{r}="",0,MAX(0,ROUND(V{r}-N{r},2)))'                                # W: overdue
    style(ln.cell(r, 18, f'=IF(C{r}="","",IF(O{r}<=0,"Paid off",IF(OR(M{r}="",NOT(ISNUMBER(J{r}))),"Open",IF(W{r}>0,"Overdue",'
                         f'IF(AND(ISNUMBER(P{r}),P{r}-TODAY()<={SOON}),"Due soon","On track")))))'), False,
          bold=True, align="center")
    ln[f"S{r}"] = f'=IF(C{r}="","",B{r}&" "&C{r})'                                            # S: name to pick
    ln[f"X{r}"] = f'=IF(OR(R{r}="",R{r}="Paid off",NOT(ISNUMBER(P{r}))),"",P{r}*1000+ROW())'  # X: next payments
    ln[f"Y{r}"] = (f'=IF(C{r}="","",IF(AND(COUNTIF(C${N0}:C{r},C{r})=1,SUMIFS({LN("O")},{LN("C")},C{r},'
                   f'{LN("O")},">0")>0),ROW(),""))')                                         # Y: people who owe
    ln[f"Z{r}"] = f'=IF(OR(C{r}="",P{r}=""),"",IF(D{r}="I borrowed","From you","To you"))'   # Z: which way
for c in "STUVWXYZ":
    ln.column_dimensions[c].hidden = True
status_colours(ln, f"L{N0}:R{N1}", N0, "$R")
dropdown(ln, '"I lent,I borrowed"', f"D{N0}:D{N1}")
dropdown(ln, '"Week,2 weeks,Month"', f"I{N0}:I{N1}")
ln.freeze_panes = "D6"

# ---------------------------------------------------------------- Payments
py = wb.create_sheet("Payments")
sheet_base(py, "Payments", "Every payment, whichever way it goes. Pick the loan by its number and name.",
           [3, 13, 18, 11, 14, 28, 6, 16, 8], rows=Q1 + 2)
header(py, 5, 2, ["Date", "Loan", "Amount", "How", "Note", "No.", "Person", "Way"])
for r in range(Q0, Q1 + 1):
    x = payments[r - Q0] if r - Q0 < len(payments) else (None,) * 5
    for c, v, fmt in zip(range(2, 7), x, (DATE, None, MONEY, None, None)):
        style(py.cell(r, c, v), True, fmt, c == 3, "center" if c in (2, 5) else None)
    style(py.cell(r, 7, f'=IF(C{r}="","",IFERROR(VALUE(LEFT(C{r},FIND(" ",C{r}&" ")-1)),""))'), False, "0",
          align="center")
    who = f"INDEX({LN('C')},MATCH(G{r},{LN('B')},0))"
    style(py.cell(r, 8, f'=IF(C{r}="","",IF(G{r}="","Pick a loan",IFERROR(IF({who}="","Not a loan",{who}),'
                        f'"Not a loan")))'), False, bold=True)
    way = f"INDEX({LN('D')},MATCH(G{r},{LN('B')},0))"
    style(py.cell(r, 9, f'=IF(OR(G{r}="",H{r}="Not a loan"),"",IF({way}="I borrowed","Out","In"))'), False,
          align="center")
    py[f"J{r}"] = f'=IF(NOT(ISNUMBER(B{r})),"",YEAR(B{r})*100+MONTH(B{r}))'                 # J: month
    py[f"K{r}"] = f'=IF(OR(G{r}="",NOT(ISNUMBER(B{r}))),"",IF(G{r}=Statement!$H$2,B{r}*1000+ROW(),""))'  # K
for c in "JK":
    py.column_dimensions[c].hidden = True
py.conditional_formatting.add(f"H{Q0}:H{Q1}", FormulaRule(
    formula=[f'OR(H{Q0}="Not a loan",H{Q0}="Pick a loan")'], fill=fill(BAD)))
dropdown(py, f"={LN('S')}", f"C{Q0}:C{Q1}", strict=False)
dropdown(py, '"Bank transfer,Cash,App,Other"', f"E{Q0}:E{Q1}", strict=False)
py.freeze_panes = "C6"

# ---------------------------------------------------------------- Statement (to print or share)
stt = wb.create_sheet("Statement")
sheet_base(stt, "Loan statement", "", [3, 24, 16, 16, 26], rows=40)
stt["B3"] = "Pick a loan in the yellow box. Print it, or copy the message at the bottom."
stt["B3"].font = font(10, color=MUTED, italic=True)
stt["B4"] = "Loan"
stt["B4"].font = font(12, True)
style(stt["C4"], True, bold=True)
stt["C4"] = "1 Sam"
stt.merge_cells("C4:D4")
dropdown(stt, f"={LN('S')}", "C4", strict=False)
stt["H2"] = '=IF(C4="","",IFERROR(VALUE(LEFT(C4,FIND(" ",C4&" ")-1)),""))'                     # H2: loan number
stt["H3"] = f'=IF(H2="","",IFERROR(MATCH(H2,{LN("B")},0)+{N0 - 1},""))'                         # H3: row on Loans
at = lambda c: f"INDEX({LN1(c)},$H$3)"
stt["H4"] = f'=IF(H3="","",IF({at("C")}="","",{at("C")}))'                                     # H4: person
stt["H5"] = f'=IF(H4="","",{at("D")}="I borrowed")'                                            # H5: borrowed
rows = [
    ("Lent by", f'=IF(H4="","",IF(H5,H4,{ME}))', None),
    ("Borrowed by", f'=IF(H4="","",IF(H5,{ME},H4))', None),
    ("Date of the loan", f'=IF(H4="","",IF(ISNUMBER({at("E")}),{at("E")},""))', DATE),
    ("Amount", f'=IF(H4="","",N({at("F")}))', MONEY),
    ("Interest (% a year)", f'=IF(H4="","",N({at("G")}))', "0.##"),
    ("To repay", f'=IF(H4="","",{at("L")})', MONEY),
    ("Paid so far", f'=IF(H4="","",{at("N")})', MONEY),
    ("Still to pay", f'=IF(H4="","",{at("O")})', MONEY),
    ("Next payment", f'=IF(H4="","",IF(ISNUMBER({at("Q")}),{at("Q")},""))', MONEY),
    ("Due on", f'=IF(H4="","",IF(ISNUMBER({at("P")}),{at("P")},""))', DATE),
    ("Status", f'=IF(H4="","",{at("R")})', None),
]
for k, (label, formula, fmt) in enumerate(rows):
    r = 6 + k
    stt.cell(r, 2, label).font = font(11, True, MUTED)
    c = style(stt.cell(r, 3, formula), False, fmt, k in (0, 1, 7, 10), "left" if fmt in (None, DATE) else None)
    stt.row_dimensions[r].height = 18
stt.conditional_formatting.add("C16", FormulaRule(formula=['C16="Overdue"'], fill=fill(BAD)))
stt.conditional_formatting.add("C16", FormulaRule(formula=['C16="Paid off"'], fill=fill(OK)))
stt["B18"] = "Payments made"
stt["B18"].font = font(12, True, TEAL_D)
header(stt, 19, 2, ["Date", "Amount", "How", "Note"])
for m in range(12):
    r = 20 + m
    stt[f"I{r}"] = f"=IFERROR(SMALL({PY('K')},{m + 1}),\"\")"                                   # I: payment row
    p = lambda c: f"INDEX({PY1(c)},MOD(I{r},1000))"
    style(stt.cell(r, 2, f'=IF(I{r}="","",{p("B")})'), False, DATE, align="center")
    style(stt.cell(r, 3, f'=IF(I{r}="","",N({p("D")}))'), False, MONEY)
    style(stt.cell(r, 4, f'=IF(I{r}="","",IF({p("E")}="","",{p("E")}))'), False, align="center")
    style(stt.cell(r, 5, f'=IF(I{r}="","",IF({p("F")}="","",{p("F")}))'), False)
stt["B32"] = f'=IF(COUNT({PY("K")})>12,"And "&(COUNT({PY("K")})-12)&" more on the Payments tab","")'
stt["B32"].font = font(9, color=MUTED, italic=True)
stt["B34"] = "A message you can send"
stt["B34"].font = font(12, True, TEAL_D)
nxt, due = at("Q"), at("P")
paid_line = f'" So far "&IF(H5,"I have","you have")&" paid "&{money(at("N"))}&" of "&{money(at("L"))}&"."'
msg = (f'=IF(H4="","",IF({at("R")}="Paid off",IF(H5,"Hi "&H4&", that is everything paid back to you: "&'
       f'{money(at("L"))}&" in all. Thank you for the help.","Hi "&H4&", that is everything paid back: "&'
       f'{money(at("L"))}&" in all. Thank you."),IF(NOT(ISNUMBER({due})),"Hi "&H4&", "&IF(H5,"I still owe you ",'
       f'"a friendly note: there is still ")&{money(at("O"))}&IF(H5," and will pay it back soon."," to pay back '
       f'when you can.")&" Thanks.",IF(H5,"Hi "&H4&", my next payment of "&{money(nxt)}&" is due on "&'
       f'{long_date(due)}&"."&{paid_line},"Hi "&H4&", a friendly reminder: "&{money(nxt)}&IF({at("R")}="Overdue",'
       f'" was due on "," is due on ")&{long_date(due)}&"."&{paid_line}&" Thank you."))))')
stt["B35"] = msg
stt.merge_cells("B35:E38")
stt["B35"].alignment = Alignment(wrap_text=True, vertical="top")
stt["B35"].font = font(11)
for r in range(35, 39):
    for c in range(2, 6):
        stt.cell(r, c).border = box
for c in "HI":
    stt.column_dimensions[c].hidden = True
stt.page_setup.orientation = "portrait"
stt.page_setup.fitToHeight = 1

# ---------------------------------------------------------------- Dashboard
db = wb.create_sheet("Dashboard", 0)
sheet_base(db, "Money lent and borrowed", "Who owes what, the next payments, and what came in and went out.",
           [3, 16, 13, 13, 13, 3, 16, 14, 14, 14, 3], rows=45)
open_ = lambda d: f'SUMIFS({LN("O")},{LN("D")},"{d}",{LN("O")},">0")'
this = "(YEAR(TODAY())*100+MONTH(TODAY()))"
tile(db, "B", 4, "Owed to you", f"={open_('I lent')}", MONEY)
tile(db, "C", 4, "Overdue to you", f'=SUMIFS({LN("W")},{LN("D")},"I lent")', MONEY, "B23B2E")
tile(db, "D", 4, "In this month", f'=SUMIFS({PY("D")},{PY("I")},"In",{PY("J")},{this})', MONEY)
tile(db, "E", 4, "Open loans", "=" + "+".join(f'COUNTIF({LN("R")},"{s}")'
                                             for s in ("Open", "Overdue", "Due soon", "On track")), "0")
tile(db, "G", 4, "You owe", f"={open_('I borrowed')}", MONEY)
tile(db, "H", 4, "You are late on", f'=SUMIFS({LN("W")},{LN("D")},"I borrowed")', MONEY, "B23B2E")
tile(db, "I", 4, "Out this month", f'=SUMIFS({PY("D")},{PY("I")},"Out",{PY("J")},{this})', MONEY)
tile(db, "J", 4, "Paid off", f'=COUNTIF({LN("R")},"Paid off")', "0")

header(db, 7, 2, ["Next payments", "Which way", "Due on", "Amount"])
for n in range(8):
    r = 8 + n
    db[f"M{r}"] = f"=IFERROR(SMALL({LN('X')},{n + 1}),\"\")"                                     # M: loan row
    a = lambda c: f"INDEX({LN1(c)},MOD(M{r},1000))"
    style(db.cell(r, 2, f'=IF(M{r}="","",{a("C")})'), False, bold=True)
    style(db.cell(r, 3, f'=IF(M{r}="","",{a("Z")})'), False, align="center")
    style(db.cell(r, 4, f'=IF(M{r}="","",{a("P")})'), False, DATE, align="center")
    style(db.cell(r, 5, f'=IF(M{r}="","",{a("Q")})'), False, MONEY)
    db[f"N{r}"] = f'=IF(M{r}="","",{a("R")})'                                                     # N: status
db.conditional_formatting.add("B8:E15", FormulaRule(formula=['$N8="Overdue"'], fill=fill(BAD)))
db.conditional_formatting.add("B8:E15", FormulaRule(formula=['$N8="Due soon"'], fill=fill(WARN)))

header(db, 7, 7, ["Who owes what", "Owes you", "You owe", "Open loans"])
for n in range(8):
    r = 8 + n
    db[f"O{r}"] = f"=IFERROR(SMALL({LN('Y')},{n + 1}),\"\")"                                     # O: first row
    style(db.cell(r, 7, f'=IF(O{r}="","",INDEX({LN1("C")},O{r}))'), False, bold=True)
    for c, way in ((8, "I lent"), (9, "I borrowed")):
        style(db.cell(r, c, f'=IF(G{r}="","",SUMIFS({LN("O")},{LN("C")},G{r},{LN("D")},"{way}",{LN("O")},">0"))'),
              False, MONEY)
    live = "+".join(f'COUNTIFS({LN("C")},G{r},{LN("R")},"{s_}")' for s_ in ("Open", "Overdue", "Due soon", "On track"))
    style(db.cell(r, 10, f'=IF(G{r}="","",{live})'), False, "0", align="center")

header(db, 18, 2, ["Month", "In", "Out"])
for k in range(12):
    r = 19 + k
    start = f"DATE(YEAR(TODAY()),MONTH(TODAY())-{11 - k},1)"
    db[f"P{r}"] = f"=YEAR({start})*100+MONTH({start})"                                           # P: month key
    style(db.cell(r, 2, f'=CHOOSE(MONTH({start}),{MON_LIST})&" "&YEAR({start})'), False, bold=True)
    style(db.cell(r, 3, f'=SUMIFS({PY("D")},{PY("I")},"In",{PY("J")},P{r})'), False, MONEY)
    style(db.cell(r, 4, f'=SUMIFS({PY("D")},{PY("I")},"Out",{PY("J")},P{r})'), False, MONEY)
for c in "MNOP":
    db.column_dimensions[c].hidden = True
for r in list(range(8, 16)) + list(range(19, 31)):
    db.row_dimensions[r].height = 18
    for c in range(2, 11):
        cell = db.cell(r, c)
        cell.alignment = Alignment(horizontal=cell.alignment.horizontal, vertical="center")

chart = BarChart()
chart.type = "col"
chart.title = "Paid back by month"
chart.height, chart.width = 7.2, 12.8
chart.add_data(Reference(db, min_col=3, max_col=4, min_row=18, max_row=30), titles_from_data=True)
chart.set_categories(Reference(db, min_col=2, min_row=19, max_row=30))
for s, colour in zip(chart.series, (TEAL, "E07A5F")):
    s.graphicalProperties.solidFill = colour
chart.y_axis.number_format = "#,##0"
db.add_chart(chart, "G18")

# ---------------------------------------------------------------- Start Here
st = wb.create_sheet("Start Here")
sheet_base(st, "Start here", "Type only in the yellow cells.", [3, 6, 108])
steps = [
    ("1", "Settings: your name for the statements and the currency."),
    ("2", "Loans: each loan once, lent or borrowed. A plan is optional: how many payments and how often."),
    ("3", "Payments: each payment as it happens. Pick the loan by its number and name."),
    ("4", "Statement: pick a loan to print it, or copy the reminder message at the bottom."),
    ("5", "Dashboard: who owes what, the next payments, and what is overdue."),
]
for k, (n_, text) in enumerate(steps):
    r = 5 + k * 2
    st.cell(r, 2, n_).font = font(18, True, TEAL)
    st.cell(r, 3, text).font = font(13)
for k, text in enumerate(["The example people, loans and payments are made up. Delete them and add your own.",
                          "Interest is simple: so much a year on the amount of the loan, over the time of the plan.",
                          "Works in Google Sheets and Microsoft Excel, in any currency."]):
    st.cell(16 + k * 2, 3, text).font = font(11, color=MUTED, italic=True)

order = ["Dashboard", "Loans", "Payments", "Statement", "Settings", "Start Here"]
wb._sheets = [wb[name] for name in order]
wb.active = 0
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Personal-Loan-Tracker.xlsx")
wb.save(out)
print("saved", out, len(loans), "loans", len(payments), "payments")
