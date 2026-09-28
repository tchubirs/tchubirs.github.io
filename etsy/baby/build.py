"""Baby Log for the first year (Excel + Google Sheets).

Feeds, sleep and nappies, one line each; growth with the age in weeks and months and a weight chart;
appointments; and milestones with the age they came at. The Dashboard shows the day you pick (today when left
empty): feeds, the last one and how long ago, sleep, nappies and the next appointment, and the seven days before
it. Only functions both apps have.
"""
import datetime as dt
import os
import random
import sys

from openpyxl import Workbook
from openpyxl.chart import Reference, ScatterChart, Series
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from sheetkit import (DATE, MUTED, OK, TEAL, TEAL_D, WARN, F,  # noqa: E402
                      box, fill, font, header, sheet_base, style)

now = dt.datetime.now().replace(second=0, microsecond=0)
today = now.date()
F0, F1 = 6, 3005       # feeds
S0, S1 = 6, 2505       # sleep
N0, N1 = 6, 3005       # nappies
G0, G1 = 6, 105        # growth
H0, H1 = 6, 105        # appointments
M0, M1 = 6, 45         # milestones
MON_LIST = ",".join(f'"{m}"' for m in ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])
FE = lambda col: f"Feeds!${col}${F0}:${col}${F1}"
SL = lambda col: f"Sleep!${col}${S0}:${col}${S1}"
NA = lambda col: f"Nappies!${col}${N0}:${col}${N1}"
GR = lambda col: f"Growth!${col}${G0}:${col}${G1}"
AP = lambda col: f"Appointments!${col}${H0}:${col}${H1}"
BORN, NAME = "Settings!$C$5", "Settings!$C$4"
MILK, WEIGHT, LENGTH = "Settings!$C$6", "Settings!$C$7", "Settings!$C$8"
DAY = "Dashboard!$AA$1"
FEEDS = ["Breast, left", "Breast, right", "Breast, both", "Bottle", "Solids"]
PLACES = ["Cot", "Pram", "Car seat", "Arms", "Our bed", "Other"]


def short(d):
    return f'DAY({d})&" "&CHOOSE(MONTH({d}),{MON_LIST})'


# ---------------------------------------------------------------- example data (a made-up baby)
born = today - dt.timedelta(days=16 * 7 + 3)
rng = random.Random(29)
feeds, sleeps, nappies = [], [], []
for back in range(9, -1, -1):
    day = today - dt.timedelta(days=back)
    for k, hour in enumerate([0.6, 3.7, 6.9, 10.0, 13.2, 16.3, 19.4, 22.6]):
        t = dt.datetime.combine(day, dt.time()) + dt.timedelta(hours=hour + rng.uniform(-0.4, 0.4))
        t = t.replace(minute=t.minute - t.minute % 5, second=0, microsecond=0)
        if t > now:
            continue
        if k in (3, 7):
            feeds.append((day, t.time(), "Bottle", None, rng.choice([120, 130, 140, 150]), None))
        else:
            feeds.append((day, t.time(), rng.choice(FEEDS[:3]), rng.choice([10, 12, 15, 18, 20, 25]), None, None))
    for start_h, length_h, place in ((1.0, 2.5, "Cot"), (4.2, 2.4, "Cot"), (9.0, 1.2, "Pram"), (12.4, 1.6, "Cot"),
                                     (16.4, 0.7, "Arms"), (19.6, 4.9, "Cot")):
        start = dt.datetime.combine(day, dt.time()) + dt.timedelta(hours=start_h + rng.uniform(-0.3, 0.3))
        start = start.replace(minute=start.minute - start.minute % 5, second=0, microsecond=0)
        end = start + dt.timedelta(hours=length_h * rng.uniform(0.85, 1.15))
        end = end.replace(minute=end.minute - end.minute % 5, second=0, microsecond=0)
        if end > now:
            continue
        sleeps.append((day, start.time(), end.time(), place, None))
    for k, hour in enumerate([1.2, 4.4, 7.5, 10.6, 13.8, 17.0, 20.1]):
        t = dt.datetime.combine(day, dt.time()) + dt.timedelta(hours=hour + rng.uniform(-0.3, 0.3))
        t = t.replace(minute=t.minute - t.minute % 5, second=0, microsecond=0)
        if t > now:
            continue
        nappies.append((day, t.time(), "x", "x" if k in (2, 5) or rng.random() < 0.15 else None, None))
growth = []
w, h, head = 3.4, 50.0, 34.5
for week in (0, 1, 2, 4, 6, 8, 10, 12, 14, 16):
    growth.append((born + dt.timedelta(days=week * 7), round(w, 2), round(h, 1), round(head, 1)))
    step = 2 if week >= 2 else 1
    w += (0.21 if week < 8 else 0.17) * step * rng.uniform(0.85, 1.15) - (0.25 if week == 0 else 0)
    h += 0.75 * step * rng.uniform(0.8, 1.2)
    head += 0.45 * step
growth = [g for g in growth if g[0] <= today]
appointments = [
    (born + dt.timedelta(days=3), dt.time(10, 0), "Newborn check", "Home visit", "All fine", "x"),
    (born + dt.timedelta(days=10), dt.time(14, 30), "Hearing test", "Clinic", None, "x"),
    (born + dt.timedelta(days=49), dt.time(9, 15), "Six-week check", "Doctor", "Growing well", "x"),
    (born + dt.timedelta(days=58), dt.time(11, 0), "Vaccines", "Doctor", "A bit sleepy after", "x"),
    (born + dt.timedelta(days=86), dt.time(11, 0), "Vaccines", "Doctor", None, "x"),
    (today + dt.timedelta(days=4), dt.time(10, 30), "Vaccines", "Doctor", "Bring the red book", None),
    (today + dt.timedelta(days=12), dt.time(13, 0), "Weigh-in", "Baby clinic", None, None),
]
milestones = [("First smile", born + dt.timedelta(days=41)), ("Holds head up", born + dt.timedelta(days=70)),
              ("Laughs", born + dt.timedelta(days=99)), ("Rolls over", None), ("Reaches for toys", None),
              ("Sits without help", None), ("First tooth", None), ("Crawls", None), ("First word", None),
              ("Pulls up to stand", None), ("First steps", None)]

wb = Workbook()


def dropdown(ws, formula, cells, strict=True):
    dv = DataValidation(type="list", formula1=formula, allow_blank=True, showErrorMessage=strict)
    ws.add_data_validation(dv)
    dv.add(cells)


def tile(ws, col, row, label, formula, fmt, colour=TEAL, size=16):
    ws[f"{col}{row}"] = label
    ws[f"{col}{row}"].font = font(10, True, MUTED)
    ws[f"{col}{row + 1}"] = formula
    ws[f"{col}{row + 1}"].number_format = fmt
    ws[f"{col}{row + 1}"].font = font(size, True, colour)
    ws[f"{col}{row + 1}"].alignment = Alignment(horizontal="right")
    for r in (row, row + 1):
        ws[f"{col}{r}"].border = box
    ws.row_dimensions[row + 1].height = 34


def age(d):
    """Age at date d as text, like 16 weeks 3 days."""
    days = f"({d}-{BORN})"
    return (f'IF(OR({d}="",{BORN}=""),"",IF({days}<0,"",INT({days}/7)&IF(INT({days}/7)=1," week"," weeks")&'
            f'IF(MOD({days},7)=0,""," "&MOD({days},7)&IF(MOD({days},7)=1," day"," days"))))')


# ---------------------------------------------------------------- Settings
se = wb.active
se.title = "Settings"
sheet_base(se, "Settings", "The baby's name and birthday, and the units you use.", [3, 18, 16, 4, 60], rows=20)
for r, label, value, fmt in ((4, "Name", "Ella", None), (5, "Birthday", born, DATE), (6, "Milk in", "ml", None),
                             (7, "Weight in", "kg", None), (8, "Length in", "cm", None)):
    se[f"B{r}"] = label
    se[f"B{r}"].font = font(11, True)
    style(se[f"C{r}"], True, fmt, True, "center")
    se[f"C{r}"] = value
dropdown(se, '"ml,oz"', "C6")
dropdown(se, '"kg,lb"', "C7")
dropdown(se, '"cm,in"', "C8")
se["E4"] = "The ages on the other tabs count from the birthday."
se["E4"].font = font(10, color=MUTED, italic=True)

# ---------------------------------------------------------------- Feeds
fe = wb.create_sheet("Feeds")
sheet_base(fe, "Feeds", "One line per feed: breast with the minutes, or bottle with the amount.",
           [3, 13, 9, 15, 10, 11, 30], rows=F1 + 2)
header(fe, 5, 2, ["Date", "Time", "Feed", "Minutes", "Amount", "Notes"])
fe["F5"] = f'="Amount ("&{MILK}&")"'
for r in range(F0, F1 + 1):
    x = feeds[r - F0] if r - F0 < len(feeds) else (None,) * 6
    style(fe.cell(r, 2, x[0]), True, DATE)
    style(fe.cell(r, 3, x[1]), True, "hh:mm", align="center")
    style(fe.cell(r, 4, x[2]), True)
    style(fe.cell(r, 5, x[3]), True, "0", align="center")
    style(fe.cell(r, 6, x[4]), True, "0", align="center")
    style(fe.cell(r, 7, x[5]), True)
    fe.cell(r, 9, f'=IF(OR(B{r}="",C{r}=""),"",B{r}+MOD(C{r},1))')                                   # I: when
    fe.cell(r, 10, f'=IF(I{r}="","",IF(B{r}={DAY},I{r},""))')                                          # J: on the day
for c in "HIJ":
    fe.column_dimensions[c].hidden = True
dropdown(fe, f'"{",".join(FEEDS)}"', f"D{F0}:D{F1}", strict=False)
fe.conditional_formatting.add(f"D{F0}:D{F1}", FormulaRule(formula=[f'D{F0}="Bottle"'], fill=fill("E3E8FF")))
fe.freeze_panes = "B6"

# ---------------------------------------------------------------- Sleep
sl = wb.create_sheet("Sleep")
sheet_base(sl, "Sleep", "One line per sleep, from the time it started to the time it ended. A sleep past midnight "
           "counts on the day it started.", [3, 13, 9, 9, 10, 13, 30], rows=S1 + 2)
header(sl, 5, 2, ["Date", "Asleep", "Awake", "Hours", "Where", "Notes"])
for r in range(S0, S1 + 1):
    x = sleeps[r - S0] if r - S0 < len(sleeps) else (None,) * 5
    style(sl.cell(r, 2, x[0]), True, DATE)
    style(sl.cell(r, 3, x[1]), True, "hh:mm", align="center")
    style(sl.cell(r, 4, x[2]), True, "hh:mm", align="center")
    style(sl.cell(r, 5, f'=IF(OR(C{r}="",D{r}=""),"",ROUND(MOD(D{r}-C{r},1)*24,2))'), False, "0.0", align="center")
    style(sl.cell(r, 6, x[3]), True)
    style(sl.cell(r, 7, x[4]), True)
dropdown(sl, f'"{",".join(PLACES)}"', f"F{S0}:F{S1}", strict=False)
sl.freeze_panes = "B6"

# ---------------------------------------------------------------- Nappies
na = wb.create_sheet("Nappies")
sheet_base(na, "Nappies", "One line per change. Put an x under Wet, Dirty or both.", [3, 13, 9, 8, 8, 30], rows=N1 + 2)
header(na, 5, 2, ["Date", "Time", "Wet", "Dirty", "Notes"])
for r in range(N0, N1 + 1):
    x = nappies[r - N0] if r - N0 < len(nappies) else (None,) * 5
    style(na.cell(r, 2, x[0]), True, DATE)
    style(na.cell(r, 3, x[1]), True, "hh:mm", align="center")
    style(na.cell(r, 4, x[2]), True, align="center")
    style(na.cell(r, 5, x[3]), True, align="center")
    style(na.cell(r, 6, x[4]), True)
na.freeze_panes = "B6"

# ---------------------------------------------------------------- Growth
gr = wb.create_sheet("Growth")
sheet_base(gr, "Growth", "Each time the baby is weighed or measured. The age fills in from the birthday.",
           [3, 13, 18, 10, 10, 10, 30], rows=G1 + 2)
header(gr, 5, 2, ["Date", "Age", "Weight", "Length", "Head", "Notes"])
gr["D5"] = f'="Weight ("&{WEIGHT}&")"'
gr["E5"] = f'="Length ("&{LENGTH}&")"'
gr["F5"] = f'="Head ("&{LENGTH}&")"'
for r in range(G0, G1 + 1):
    x = growth[r - G0] if r - G0 < len(growth) else (None,) * 4
    style(gr.cell(r, 2, x[0]), True, DATE)
    style(gr.cell(r, 3, f"={age(f'B{r}')}"), False, align="center")
    style(gr.cell(r, 4, x[1]), True, "0.00", align="center")
    style(gr.cell(r, 5, x[2]), True, "0.0", align="center")
    style(gr.cell(r, 6, x[3]), True, "0.0", align="center")
    style(gr.cell(r, 7), True)
    gr.cell(r, 9, f'=IF(B{r}="","",B{r}+ROW()/10000000)')                                              # I: order
    gr.cell(r, 10, f'=IF(I{r}="","",COUNTIF({GR("I")},">"&I{r}))')                                     # J: 0 newest
for c in "HIJ":
    gr.column_dimensions[c].hidden = True
chart = ScatterChart()
chart.title = "Weight"
chart.style = 13
chart.height, chart.width = 7.5, 15
series = Series(Reference(gr, min_col=4, min_row=G0, max_row=G1), Reference(gr, min_col=2, min_row=G0, max_row=G1),
                title="Weight")
series.marker.symbol = "circle"
series.graphicalProperties.line.solidFill = TEAL
series.marker.graphicalProperties.solidFill = TEAL
chart.series.append(series)
chart.x_axis.number_format = "d mmm"
chart.x_axis.title = None
chart.legend = None
gr.add_chart(chart, "I5")

# ---------------------------------------------------------------- Appointments
ap = wb.create_sheet("Appointments")
sheet_base(ap, "Appointments", "Checks, vaccines and anything booked. Put an x under Done once it has happened.",
           [3, 13, 9, 22, 16, 30, 8], rows=H1 + 2)
header(ap, 5, 2, ["Date", "Time", "What", "Where", "Notes", "Done"])
for r in range(H0, H1 + 1):
    x = appointments[r - H0] if r - H0 < len(appointments) else (None,) * 6
    style(ap.cell(r, 2, x[0]), True, DATE)
    style(ap.cell(r, 3, x[1]), True, "hh:mm", align="center")
    style(ap.cell(r, 4, x[2]), True, bold=True)
    style(ap.cell(r, 5, x[3]), True)
    style(ap.cell(r, 6, x[4]), True)
    style(ap.cell(r, 7, x[5]), True, align="center")
    ap.cell(r, 9, f'=IF(OR(B{r}="",G{r}<>"",B{r}<TODAY()),"",B{r}+MOD(N(C{r}),1)+ROW()/10000000)')      # I: coming up
ap.column_dimensions["I"].hidden = True
ap.conditional_formatting.add(f"B{H0}:G{H1}", FormulaRule(formula=[f'$G{H0}<>""'], font=Font(name=F, color="9AA7A9")))
ap.conditional_formatting.add(f"B{H0}:G{H1}", FormulaRule(formula=[f'AND($B{H0}<>"",$G{H0}="",$B{H0}>=TODAY())'],
                                                          fill=fill("E3E8FF")))
ap.freeze_panes = "B6"

# ---------------------------------------------------------------- Milestones
mi = wb.create_sheet("Milestones")
sheet_base(mi, "Milestones", "The firsts. Type the date when it happens and the age fills in. Every baby has its own "
           "pace.", [3, 26, 13, 20, 36], rows=M1 + 2)
header(mi, 5, 2, ["Milestone", "Date", "Age", "Notes"])
for r in range(M0, M1 + 1):
    x = milestones[r - M0] if r - M0 < len(milestones) else (None, None)
    style(mi.cell(r, 2, x[0]), True, bold=True)
    style(mi.cell(r, 3, x[1]), True, DATE)
    style(mi.cell(r, 4, f"={age(f'C{r}')}"), False, align="center")
    style(mi.cell(r, 5), True)
mi.conditional_formatting.add(f"B{M0}:E{M1}", FormulaRule(formula=[f'$C{M0}<>""'], fill=fill(OK)))

# ---------------------------------------------------------------- Dashboard
db = wb.create_sheet("Dashboard", 0)
sheet_base(db, "Baby log", "Pick a day, or leave it empty for today.", [3, 14, 12, 12, 12, 12, 12, 12, 3, 18, 14, 3],
           rows=45)
db["B2"] = f'=IF({NAME}="","Baby log",{NAME}&"\'s log")'
db["B4"] = "Day"
db["B4"].font = font(11, True)
style(db["C4"], True, DATE, True, "center")
db["AA1"] = "=IF($C$4=\"\",TODAY(),$C$4)"
db.column_dimensions["AA"].hidden = True
db["D4"] = f'={age(DAY)}'
db["D4"].font = font(11, True, TEAL_D)
last = f"MAX({FE('J')})"
tile(db, "B", 6, "Feeds", f'=COUNTIF({FE("B")},{DAY})', "0")
tile(db, "C", 6, "Last feed", f'=IF({last}=0,"",{last})', "hh:mm")
mins = f"MOD(INT((NOW()-{last})*1440),60)"
tile(db, "D", 6, "Since then", f'=IF(OR({last}=0,{DAY}<>TODAY()),"",INT((NOW()-{last})*24)&" h "&'
                               f'IF({mins}<10,"0","")&{mins}&" min")', "@", size=13)
tile(db, "E", 6, "Sleep", f'=SUMIFS({SL("E")},{SL("B")},{DAY})', '0.0" h"')
tile(db, "F", 6, "Wet", f'=COUNTIFS({NA("B")},{DAY},{NA("D")},"<>")', "0")
tile(db, "G", 6, "Dirty", f'=COUNTIFS({NA("B")},{DAY},{NA("E")},"<>")', "0")
nxt = f"MIN({AP('I')})"
tile(db, "H", 6, "Next appointment", f'=IF({nxt}=0,"None booked",INDEX({AP("D")},MATCH({nxt},{AP("I")},0))&", "&'
                                     f'{short(f"INT({nxt})")})', "@", size=11)
db.merge_cells("H6:K6")
db.merge_cells("H7:K7")
for c in "IJK":
    for r in (6, 7):
        db[f"{c}{r}"].border = box

header(db, 9, 2, ["Day", "Feeds", "Bottle", "Breast (min)", "Sleep (h)", "Wet", "Dirty"])
db["D9"] = f'="Bottle ("&{MILK}&")"'
for k in range(7):
    r = 10 + k
    d = f"({DAY}-{6 - k})"
    style(db.cell(r, 2, f"={d}"), False, "ddd d mmm", True, "center")
    style(db.cell(r, 3, f'=COUNTIF({FE("B")},B{r})'), False, "0;;", align="center")
    style(db.cell(r, 4, f'=SUMIFS({FE("F")},{FE("B")},B{r},{FE("D")},"Bottle")'), False, "0;;", align="center")
    style(db.cell(r, 5, f'=SUMIFS({FE("E")},{FE("B")},B{r},{FE("D")},"Breast*")'), False, "0;;", align="center")
    style(db.cell(r, 6, f'=SUMIFS({SL("E")},{SL("B")},B{r})'), False, "0.0;;", align="center")
    style(db.cell(r, 7, f'=COUNTIFS({NA("B")},B{r},{NA("D")},"<>")'), False, "0;;", align="center")
    style(db.cell(r, 8, f'=COUNTIFS({NA("B")},B{r},{NA("E")},"<>")'), False, "0;;", align="center")
style(db.cell(17, 2, "Average"), False, bold=True, align="center")
for c in range(3, 9):
    col = L(c)
    style(db.cell(17, c, f"=AVERAGE({col}10:{col}16)"), False, "0.0", True, "center")
db.conditional_formatting.add("B16:H16", FormulaRule(formula=["TRUE"], fill=fill("E3E8FF")))

header(db, 9, 10, ["Growth", "Latest"])
newest = lambda col: f'SUMIFS({GR(col)},{GR("J")},0)'
has = f'COUNTIF({GR("J")},0)'
for k, (label, col, fmt) in enumerate((("Weighed on", "B", DATE), ("Weight", "D", "0.00"), ("Length", "E", "0.0"),
                                       ("Head", "F", "0.0"))):
    r = 10 + k
    unit = WEIGHT if col == "D" else LENGTH
    style(db.cell(r, 10, label if k == 0 else f'="{label} ("&{unit}&")"'), False, bold=True)
    style(db.cell(r, 11, f'=IF({has}=0,"",IF({newest(col)}=0,"",{newest(col)}))'), False, fmt, align="center")
style(db.cell(14, 10, "Age then"), False, bold=True)
style(db.cell(14, 11, f"={age('K10')}"), False, align="center")
db["J15"] = f'=COUNTIF(Milestones!$C${M0}:$C${M1},"<>")&" milestones so far"'
db["J15"].font = font(10, True, TEAL_D)

# The weight chart again, on the Dashboard.
chart2 = ScatterChart()
chart2.title = "Weight"
chart2.style = 13
chart2.height, chart2.width = 7, 16
s2 = Series(Reference(gr, min_col=4, min_row=G0, max_row=G1), Reference(gr, min_col=2, min_row=G0, max_row=G1),
            title="Weight")
s2.marker.symbol = "circle"
s2.graphicalProperties.line.solidFill = TEAL
s2.marker.graphicalProperties.solidFill = TEAL
chart2.series.append(s2)
chart2.x_axis.number_format = "d mmm"
chart2.legend = None
db.add_chart(chart2, "B19")

# ---------------------------------------------------------------- Start Here
st = wb.create_sheet("Start Here")
sheet_base(st, "Start here", "Type only in the yellow cells. Everything else is calculated.", [3, 6, 106])
steps = [
    ("1", "Settings: the baby's name and birthday, and your units."),
    ("2", "Feeds, Sleep and Nappies: one line each time, with the date and the time."),
    ("3", "Growth: each time the baby is weighed or measured. The weight chart follows."),
    ("4", "Appointments and Milestones: checks and vaccines as they are booked, and the firsts as they come."),
    ("5", "Dashboard: the day you pick, or today, and the seven days before it."),
]
for k, (n, text) in enumerate(steps):
    r = 5 + k * 2
    st.cell(r, 2, n).font = font(18, True, TEAL)
    st.cell(r, 3, text).font = font(13)
for k, text in enumerate(["This is a log. It does not give medical advice: for any question about feeding, sleep or "
                          "growth, ask your midwife, health visitor or doctor.",
                          "The example baby and her days are made up. Delete them and start with yours.",
                          "Works in Google Sheets and Microsoft Excel. The Google Sheets app makes it quick to add a "
                          "feed at night."]):
    st.cell(16 + k * 2, 3, text).font = font(11, color=MUTED, italic=True)

order = ["Dashboard", "Feeds", "Sleep", "Nappies", "Growth", "Appointments", "Milestones", "Settings", "Start Here"]
wb._sheets = [wb[name] for name in order]
wb.active = 0
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Baby-Log.xlsx")
wb.save(out)
print("saved", out, len(feeds), "feeds", len(sleeps), "sleeps", len(nappies), "nappies", len(growth), "growth lines")
