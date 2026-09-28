"""ADHD-Friendly Budget Spreadsheet (Excel + Google Sheets compatible).

Only functions both apps support: SUMIFS, COUNTIFS, IF, IFERROR, TODAY, DATE,
EOMONTH, DAY, MONTH, YEAR, REPT, MIN, MAX, TEXT, INDEX, MATCH. No dynamic
arrays, no macros, no data bars (Google drops them): progress bars are REPT.
"""
import datetime as dt
from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

F = "Arial"
TEAL, TEAL_D, INK, MUTED = "1F6F78", "15525A", "1E2A2F", "6B7B80"
PAPER, INPUT, LINE = "FFFFFF", "FFF4C2", "D5DBDB"
OK, WARN, BAD = "D8F0DC", "FFE2B8", "F9C9C4"
MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]
CATS = [("Rent / Housing", 900), ("Groceries", 350), ("Eating out", 120), ("Transport", 110),
        ("Subscriptions", 45), ("Health", 60), ("Fun", 90), ("Shopping", 80), ("Other", 60)]

thin = Side(style="thin", color=LINE)
box = Border(left=thin, right=thin, top=thin, bottom=thin)

def fill(c): return PatternFill("solid", start_color=c, end_color=c)
def font(size=11, bold=False, color=INK, italic=False): return Font(name=F, size=size, bold=bold, color=color, italic=italic)

def sheet_base(ws, title, subtitle, widths):
    ws.sheet_view.showGridLines = False
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for r in range(1, 80):
        for c in range(1, len(widths) + 2):
            ws.cell(r, c).fill = fill(PAPER)
    ws["B2"] = title
    ws["B2"].font = font(22, True, TEAL_D)
    ws["B3"] = subtitle
    ws["B3"].font = font(11, color=MUTED, italic=True)
    ws.row_dimensions[2].height = 32
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True

def header(ws, row, col, labels):
    for i, label in enumerate(labels):
        c = ws.cell(row, col + i, label)
        c.font = font(11, True, "FFFFFF")
        c.fill = fill(TEAL)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = box
    ws.row_dimensions[row].height = 22

def cellstyle(c, input_cell=False, fmt=None, bold=False, align=None):
    c.fill = fill(INPUT if input_cell else "FFFFFF")
    c.border = box
    c.font = font(11, bold)
    if fmt:
        c.number_format = fmt
    if align:
        c.alignment = Alignment(horizontal=align, vertical="center")

MONEY = '#,##0.00'

wb = Workbook()

# ---------------------------------------------------------------- Start Here
ws = wb.active
ws.title = "Start Here"
sheet_base(ws, "Start here", "Type only in the yellow cells. Everything else is calculated.", [3, 6, 90])
steps = [
    ("1", "Budget tab: type how much you want to spend per category each month."),
    ("2", "Bills tab: list your bills once, with the amount and the day of the month they are due."),
    ("3", "Log tab: each time you spend or get paid, add one line with the date, amount and category."),
    ("", ""),
    ("4", "Dashboard: pick the month. The big number is what you can spend per day for the rest of it."),
    ("5", "Impulse List: when you want to buy something, write it here and wait 48 hours."),
    ("6", "Goals: update what you have saved and the bars fill up."),
]
for i, (n, text) in enumerate(steps):
    r = 5 + i * 2
    ws.cell(r, 2, n).font = font(18, True, TEAL)
    ws.cell(r, 3, text).font = font(14)
    ws.row_dimensions[r].height = 26
ws["C21"] = "The example lines in Log, Bills and Goals show how it works. Delete them and add your own."
ws["C21"].font = font(11, color=MUTED, italic=True)
ws["C23"] = "Works in Google Sheets (File > Import, or open the file from Drive) and in Microsoft Excel."
ws["C23"].font = font(11, color=MUTED, italic=True)

# ---------------------------------------------------------------- Budget
bud = wb.create_sheet("Budget")
sheet_base(bud, "Monthly budget", "How much you plan to spend per category, every month.", [3, 26, 16, 4, 50])
header(bud, 5, 2, ["Category", "Monthly budget"])
for i, (name, amount) in enumerate(CATS):
    r = 6 + i
    cellstyle(bud.cell(r, 2, name), True)
    cellstyle(bud.cell(r, 3, amount), True, MONEY)
LAST_CAT = 6 + len(CATS) - 1
bud.cell(LAST_CAT + 1, 2, "Total").font = font(11, True)
c = bud.cell(LAST_CAT + 1, 3, f"=SUM(C6:C{LAST_CAT})"); cellstyle(c, False, MONEY, True)
bud["E6"] = "Rename or add categories here: the Log dropdown and the Dashboard follow."
bud["E6"].font = font(10, color=MUTED, italic=True)
bud["E7"] = "Monthly savings you want to set aside:"
bud["E7"].font = font(11, True)
cellstyle(bud["E8"], True, MONEY); bud["E8"] = 150

# ---------------------------------------------------------------- Log
log = wb.create_sheet("Log")
sheet_base(log, "Log: one line per purchase or payday", "Date, amount, type, category, and a note if you want.", [3, 14, 13, 11, 22, 34])
header(log, 5, 2, ["Date", "Amount", "Type", "Category", "Note"])
today = dt.date.today()
m0 = today.replace(day=1)
sample = [
    (1, 2100, "Income", "", "Salary"), (1, 900, "Expense", "Rent / Housing", "Rent"),
    (2, 64.3, "Expense", "Groceries", "Supermarket"), (3, 12.5, "Expense", "Eating out", "Lunch"),
    (4, 9.99, "Expense", "Subscriptions", "Music"), (5, 38, "Expense", "Transport", "Monthly pass"),
    (6, 23.9, "Expense", "Fun", "Cinema + snacks"), (8, 71.2, "Expense", "Groceries", "Weekly shop"),
    (9, 18, "Expense", "Eating out", "Pizza"), (10, 45, "Expense", "Shopping", "Shoes, from the Impulse List"),
    (12, 15.49, "Expense", "Subscriptions", "Streaming"), (13, 30, "Expense", "Health", "Pharmacy"),
]
for i, (d, amt, typ, cat, note) in enumerate(sample):
    r = 6 + i
    day = min(d, max(1, today.day))
    cellstyle(log.cell(r, 2, m0.replace(day=day)), True, "DD MMM YYYY")
    cellstyle(log.cell(r, 3, amt), True, MONEY)
    cellstyle(log.cell(r, 4, typ), True)
    cellstyle(log.cell(r, 5, cat), True)
    cellstyle(log.cell(r, 6, note), True)
LOG_END = 1000
for r in range(6 + len(sample), 60):
    for c in range(2, 7):
        cellstyle(log.cell(r, c), True, "DD MMM YYYY" if c == 2 else (MONEY if c == 3 else None))
dv_type = DataValidation(type="list", formula1='"Expense,Income"', allow_blank=True)
dv_cat = DataValidation(type="list", formula1=f"=Budget!$B$6:$B${LAST_CAT}", allow_blank=True)
log.add_data_validation(dv_type); log.add_data_validation(dv_cat)
dv_type.add(f"D6:D{LOG_END}"); dv_cat.add(f"E6:E{LOG_END}")
log.freeze_panes = "B6"
R = lambda col: f"Log!${col}$6:${col}${LOG_END}"

# ---------------------------------------------------------------- Bills
bil = wb.create_sheet("Bills")
sheet_base(bil, "Bills: list them once", "Choose Yes under 'Paid?' each month. The colours warn you before the due date.", [3, 24, 13, 11, 10, 26])
header(bil, 5, 2, ["Bill", "Amount", "Due day", "Paid?", "Status"])
# Example bills around the build date, so the demo shows every status.
d0 = today.day
month_len = (today.replace(day=28) + dt.timedelta(days=4)).replace(day=1) - dt.timedelta(days=1)
soon = lambda k: d0 + k if d0 + k <= month_len.day else max(1, d0 - 1)
bills = [("Rent", 900, 1, "Yes"), ("Phone", 19.99, soon(1), "No"), ("Internet", 29.99, 15, "Yes"),
         ("Electricity", 54, soon(2), "No"), ("Gym", 24.9, max(1, d0 - 4), "No"), ("Insurance", 32.5, 5, "Yes")]
BILL_END = 30
for i in range(BILL_END - 5):
    r = 6 + i
    name, amt, due, paid = bills[i] if i < len(bills) else (None, None, None, None)
    cellstyle(bil.cell(r, 2, name), True)
    cellstyle(bil.cell(r, 3, amt), True, MONEY)
    cellstyle(bil.cell(r, 4, due), True, "0", align="center")
    cellstyle(bil.cell(r, 5, paid), True, align="center")
    n = f"(D{r}-DAY(TODAY()))"
    th = f'IF(AND(D{r}>=11,D{r}<=13),"th",IF(MOD(D{r},10)=1,"st",IF(MOD(D{r},10)=2,"nd",IF(MOD(D{r},10)=3,"rd","th"))))'
    s = bil.cell(r, 6, f'=IF(B{r}="","",IF(E{r}="Yes","Paid",IF(D{r}<DAY(TODAY()),"Overdue",IF({n}=0,"Due today",'
                        f'IF({n}<=3,"Due in "&{n}&IF({n}=1," day"," days"),"Due on the "&D{r}&{th})))))')
    cellstyle(s, False, align="center")
dv_paid = DataValidation(type="list", formula1='"Yes,No"', allow_blank=False)
bil.add_data_validation(dv_paid); dv_paid.add(f"E6:E{BILL_END}")
rng = f"F6:F{BILL_END}"
bil.conditional_formatting.add(rng, FormulaRule(formula=['$F6="Paid"'], fill=fill(OK)))
bil.conditional_formatting.add(rng, FormulaRule(formula=['$F6="Overdue"'], fill=fill(BAD), font=Font(name=F, bold=True, color="9B1C1C")))
bil.conditional_formatting.add(rng, FormulaRule(formula=['OR(LEFT($F6,6)="Due in",$F6="Due today")'], fill=fill(WARN)))

# ---------------------------------------------------------------- Impulse List
imp = wb.create_sheet("Impulse List")
sheet_base(imp, "Impulse List: the 48-hour rule", "Write down what you want to buy. If you still want it 48 hours later, go ahead.", [3, 26, 12, 14, 34, 14])
header(imp, 5, 2, ["Item", "Price", "Added on", "Verdict", "I decided"])
items = [("Wireless earbuds", 79, -3, ""), ("Standing desk", 249, -1, ""), ("Shoes", 45, -6, "Bought"),
         ("Smart watch", 199, -9, "Skipped"), ("Board game", 39, 0, "")]
for i in range(25):
    r = 6 + i
    item = items[i] if i < len(items) else None
    cellstyle(imp.cell(r, 2, item[0] if item else None), True)
    cellstyle(imp.cell(r, 3, item[1] if item else None), True, MONEY)
    cellstyle(imp.cell(r, 4, today + dt.timedelta(days=item[2]) if item else None), True, "DD MMM YYYY")
    w = f"(2-(TODAY()-D{r}))"
    v = imp.cell(r, 5, f'=IF(B{r}="","",IF(F{r}<>"",F{r},IF(TODAY()-D{r}>=2,"48 hours passed: buy it if you still want it",'
                        f'"Wait "&{w}&IF({w}=1," more day"," more days"))))')
    cellstyle(v, False)
    cellstyle(imp.cell(r, 6, item[3] if item else None), True, align="center")
dv_dec = DataValidation(type="list", formula1='"Bought,Skipped"', allow_blank=True)
imp.add_data_validation(dv_dec); dv_dec.add("F6:F30")
imp.conditional_formatting.add("E6:E30", FormulaRule(formula=['LEFT($E6,4)="Wait"'], fill=fill(WARN)))
imp.conditional_formatting.add("E6:E30", FormulaRule(formula=['LEFT($E6,8)="48 hours"'], fill=fill(OK)))
imp.conditional_formatting.add("E6:E30", FormulaRule(formula=['$E6="Skipped"'], fill=fill("E3E8FF")))
imp["H5"] = "Money kept by skipping:"; imp["H5"].font = font(12, True, TEAL_D)
imp["H6"] = '=SUMIFS(C6:C30,F6:F30,"Skipped")'; imp["H6"].number_format = MONEY; imp["H6"].font = font(20, True, TEAL)
imp.column_dimensions["G"].width = 3; imp.column_dimensions["H"].width = 26

# ---------------------------------------------------------------- Goals
gol = wb.create_sheet("Goals")
sheet_base(gol, "Savings goals", "Update 'Saved so far' whenever you put money aside.", [3, 24, 14, 14, 10, 34])
header(gol, 5, 2, ["Goal", "Target", "Saved so far", "Done", "Progress"])
goals = [("Emergency fund", 3000, 1250), ("Trip", 1200, 400), ("New laptop", 900, 810)]
for i in range(10):
    r = 6 + i
    g = goals[i] if i < len(goals) else None
    cellstyle(gol.cell(r, 2, g[0] if g else None), True)
    cellstyle(gol.cell(r, 3, g[1] if g else None), True, MONEY)
    cellstyle(gol.cell(r, 4, g[2] if g else None), True, MONEY)
    cellstyle(gol.cell(r, 5, f'=IF(C{r}="","",MIN(1,D{r}/C{r}))'), False, "0%", align="center")
    bar = gol.cell(r, 6, f'=IF(C{r}="","",REPT("█",ROUND(E{r}*20,0))&REPT("░",20-ROUND(E{r}*20,0)))')
    cellstyle(bar, False); bar.font = Font(name=F, size=11, color=TEAL)

# ---------------------------------------------------------------- Dashboard (first tab)
db = wb.create_sheet("Dashboard", 0)
sheet_base(db, "Money overview", "Pick a month. Everything below updates.", [3, 24, 15, 15, 15, 30, 3, 44])
db["B5"] = "Month"; db["B5"].font = font(11, True)
db["C5"] = MONTHS[today.month - 1]; cellstyle(db["C5"], True, bold=True)
db["D5"] = "Year"; db["D5"].font = font(11, True); db["D5"].alignment = Alignment(horizontal="right")
db["E5"] = today.year; cellstyle(db["E5"], True, "0", bold=True)
dv_m = DataValidation(type="list", formula1='"' + ",".join(MONTHS) + '"', allow_blank=False)
db.add_data_validation(dv_m); dv_m.add("C5")
db["J1"] = '=MATCH(C5,{"January","February","March","April","May","June","July","August","September","October","November","December"},0)'
db["J2"] = "=DATE(E5,J1,1)"; db["J3"] = "=EOMONTH(J2,0)"
db.column_dimensions["J"].hidden = True  # month helpers
IN = f'SUMIFS({R("C")},{R("D")},"Income",{R("B")},">="&$J$2,{R("B")},"<="&$J$3)'
OUT = f'SUMIFS({R("C")},{R("D")},"Expense",{R("B")},">="&$J$2,{R("B")},"<="&$J$3)'
tiles = [
    ("B", "Money in", f"={IN}", TEAL),
    ("C", "Spent", f"={OUT}", "B4541F"),
    ("D", "Bills not paid yet", '=SUM(Bills!$C$6:$C$30)-SUMIFS(Bills!$C$6:$C$30,Bills!$E$6:$E$30,"Yes")', "B4541F"),
    ("E", "Left for the month", "=B8-C8-D8-Budget!$E$8", TEAL),
]
for col, label, formula, colour in tiles:
    db[f"{col}7"] = label; db[f"{col}7"].font = font(10, True, MUTED)
    db[f"{col}8"] = formula; db[f"{col}8"].number_format = MONEY; db[f"{col}8"].font = font(18, True, colour)
    for r in (7, 8):
        db[f"{col}{r}"].fill = fill("FFFFFF"); db[f"{col}{r}"].border = box
db.row_dimensions[8].height = 30
db["F7"] = "Safe to spend per day"; db["F7"].font = font(11, True, "FFFFFF"); db["F7"].fill = fill(TEAL_D)
db["F8"] = ('=IF(AND(MONTH(TODAY())=$J$1,YEAR(TODAY())=$E$5),MAX(0,E8)/(J3-TODAY()+1),'
            'IF($J$3<TODAY(),"month closed","month not started"))')
db["F8"].number_format = MONEY; db["F8"].font = font(26, True, "FFFFFF"); db["F8"].fill = fill(TEAL_D)
db["F8"].alignment = Alignment(horizontal="center", vertical="center")
db["F7"].alignment = Alignment(horizontal="center")
db.row_dimensions[8].height = 44
db["B10"] = "Savings set aside this month (Budget tab):"; db["B10"].font = font(10, color=MUTED, italic=True)
db["E10"] = "=Budget!$E$8"; db["E10"].number_format = MONEY; db["E10"].font = font(10, color=MUTED)

header(db, 12, 2, ["Category", "Budget", "Spent", "Left", "Used"])
for i in range(len(CATS)):
    r = 13 + i
    cellstyle(db.cell(r, 2, f"=Budget!B{6 + i}"), False, bold=True)
    cellstyle(db.cell(r, 3, f"=Budget!C{6 + i}"), False, MONEY)
    cellstyle(db.cell(r, 4, f'=SUMIFS({R("C")},{R("E")},B{r},{R("D")},"Expense",{R("B")},">="&$J$2,{R("B")},"<="&$J$3)'), False, MONEY)
    cellstyle(db.cell(r, 5, f"=C{r}-D{r}"), False, MONEY, True)
    bar = db.cell(r, 6, f'=IF(C{r}=0,"",REPT("█",MIN(20,ROUND(D{r}/C{r}*20,0)))&REPT("░",MAX(0,20-ROUND(D{r}/C{r}*20,0)))&"  "&TEXT(D{r}/C{r},"0%"))')
    cellstyle(bar, False); bar.font = Font(name=F, size=11, color=TEAL)
end = 13 + len(CATS) - 1
db.conditional_formatting.add(f"E13:E{end}", FormulaRule(formula=["$E13<0"], fill=fill(BAD), font=Font(name=F, bold=True, color="9B1C1C")))
db.conditional_formatting.add(f"F13:F{end}", FormulaRule(formula=["AND($C13>0,$D13/$C13>1)"], font=Font(name=F, color="B4541F")))
db.conditional_formatting.add(f"F13:F{end}", FormulaRule(formula=["AND($C13>0,$D13/$C13>0.8,$D13/$C13<=1)"], font=Font(name=F, color="C98A0B")))

db["H12"] = "Heads-up"; db["H12"].font = font(11, True, "FFFFFF"); db["H12"].fill = fill(TEAL)
soon = '(COUNTIFS(Bills!$F$6:$F$30,"Due in*")+COUNTIFS(Bills!$F$6:$F$30,"Due today"))'
late = 'COUNTIFS(Bills!$F$6:$F$30,"Overdue")'
wait = 'COUNTIFS(\'Impulse List\'!$E$6:$E$30,"Wait*")'
notes = [
    (f'=IF({soon}=0,"No bills due in the next 3 days",IF({soon}=1,"1 bill",{soon}&" bills")&" due in the next 3 days")', WARN),
    (f'=IF({late}=0,"No overdue bills",IF({late}=1,"1 bill is overdue",{late}&" bills are overdue"))', BAD),
    (f'=IF({wait}=0,"Nothing waiting on your Impulse List",IF({wait}=1,"1 item",{wait}&" items")&" waiting on your Impulse List")',
     "E3E8FF"),
    ('="Kept by skipping impulse buys: "&FIXED(\'Impulse List\'!$H$6,2)', OK),
]
for i, (f, colour) in enumerate(notes):
    c = db.cell(13 + i * 2, 8, f); c.fill = fill(colour); c.font = font(11); c.border = box
    c.alignment = Alignment(vertical="center")
for cell, prefix in (("H13", "No"), ("H15", "No"), ("H17", "Nothing")):
    db.conditional_formatting.add(cell, FormulaRule(formula=[f'LEFT({cell},{len(prefix)})="{prefix}"'], fill=fill(OK)))
db["H12"].alignment = Alignment(vertical="center")
for r in range(13, 13 + len(CATS)):
    db.row_dimensions[r].height = 24

wb.active = 0
wb.save("ADHD-Friendly-Budget.xlsx")
print("saved")
