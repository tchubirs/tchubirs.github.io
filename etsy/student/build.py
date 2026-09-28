"""Student Planner: assignments, grades and study hours (Excel + Google Sheets).

Courses with the weight of each kind of work, assignments and exams with due
dates and scores, the grade so far in every course, the score needed on the
final, a GPA from your own grade scale, a study log with weekly hours, and a
class timetable. Only functions both apps have.
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
from sheetkit import (BAD, DATE, INFO, MUTED, OK, TEAL, TEAL_D, WARN, F,  # noqa: E402
                      box, fill, font, header, sheet_base, style)

today = dt.date.today()
MONDAY = today - dt.timedelta(days=today.weekday())
C0, C1 = 6, 15        # courses
A0, A1 = 6, 505       # assignments
S0, S1 = 6, 1005      # study log
CATS = ["Homework", "Quizzes", "Projects", "Midterm", "Final", "Other"]
AS = lambda col: f"Assignments!${col}${A0}:${col}${A1}"
CO = lambda col: f"Courses!${col}${C0}:${col}${C1}"
SL = lambda col: f"'Study log'!${col}${S0}:${col}${S1}"
SCALE = [(0, "F", 0), (60, "D-", 0.7), (63, "D", 1.0), (67, "D+", 1.3), (70, "C-", 1.7), (73, "C", 2.0), (77, "C+", 2.3),
         (80, "B-", 2.7), (83, "B", 3.0), (87, "B+", 3.3), (90, "A-", 3.7), (93, "A", 4.0)]
PCT = "0.0%"
COURSE_COLOURS = ["CFE8E4", "FCE9B8", "E3E8FF", "F9D7C4", "DDEFD0", "EBDDF5", "D4ECF7", "F5DCE6"]

# ---------------------------------------------------------------- example data
courses = [
    # course, teacher, credits, weights (homework, quizzes, projects, midterm, final, other), target
    ("Biology 101", "Dr. Reyes", 4, (0.15, 0.15, 0.20, 0.20, 0.30, 0), 0.90),
    ("Calculus I", "Prof. Chen", 4, (0.20, 0.20, 0, 0.25, 0.35, 0), 0.85),
    ("English Composition", "Ms. Porter", 3, (0, 0, 0.60, 0, 0.30, 0.10), 0.90),
    ("Intro to Psychology", "Dr. Walsh", 3, (0, 0.30, 0.20, 0.20, 0.30, 0), 0.90),
    ("Spanish I", "Sra. Molina", 3, (0.20, 0.20, 0, 0.15, 0.25, 0.20), 0.90),
]
skill = {"Biology 101": 0.88, "Calculus I": 0.80, "English Composition": 0.92, "Intro to Psychology": 0.87,
         "Spanish I": 0.86}
rng = random.Random(8)
start = MONDAY - dt.timedelta(weeks=5)                 # the term started five weeks ago
end_term = start + dt.timedelta(weeks=15)
items = []


def add(course, title, cat, due, out_of):
    graded = due < today - dt.timedelta(days=2)
    score = round(min(out_of, out_of * rng.gauss(skill[course], 0.07))) if graded else None
    status = "Done" if due < today else ("In progress" if due <= today + dt.timedelta(days=4) and rng.random() < 0.5 else
                                         "To do")
    items.append([course, title, cat, due, status, score, out_of, None])


for w in range(15):
    monday = start + dt.timedelta(weeks=w)
    add("Biology 101", f"Homework {w + 1}", "Homework", monday + dt.timedelta(days=4), 20)
    add("Calculus I", f"Problem set {w + 1}", "Homework", monday + dt.timedelta(days=3), 20)
    add("Spanish I", f"Workbook, unit {w + 1}", "Homework", monday + dt.timedelta(days=1), 10)
    if w % 2 == 1:
        add("Calculus I", f"Quiz {w // 2 + 1}", "Quizzes", monday + dt.timedelta(days=2), 10)
        add("Spanish I", f"Vocabulary quiz {w // 2 + 1}", "Quizzes", monday + dt.timedelta(days=4), 20)
        add("Biology 101", f"Quiz {w // 2 + 1}", "Quizzes", monday + dt.timedelta(days=1), 15)
    if w % 3 == 2:
        add("Biology 101", f"Lab report {w // 3 + 1}", "Projects", monday + dt.timedelta(days=3), 50)
        add("Intro to Psychology", f"Chapter quiz {w // 3 + 1}", "Quizzes", monday + dt.timedelta(days=2), 25)
    if w in (3, 7, 11):
        add("English Composition", f"Essay {(w + 1) // 4}", "Projects", monday + dt.timedelta(days=4), 100)
    if w in (5, 12):
        add("Spanish I", f"Oral exam {1 if w == 5 else 2}", "Other", monday + dt.timedelta(days=3), 25)
add("Intro to Psychology", "Research summary", "Projects", start + dt.timedelta(weeks=9, days=4), 100)
for course in ("Biology 101", "Calculus I", "Intro to Psychology", "Spanish I"):
    add(course, "Midterm exam", "Midterm", start + dt.timedelta(weeks=7, days=rng.randint(0, 4)), 100)
for course, *_ in courses:
    add(course, "Final exam", "Final", end_term + dt.timedelta(days=rng.randint(0, 4)), 100)
add("English Composition", "Participation", "Other", end_term, 100)
# One piece of homework handed in late and one forgotten.
late = next(i for i in items if i[0] == "Calculus I" and i[3] < today - dt.timedelta(days=3) and i[3] > today - dt.timedelta(days=9))
late[4], late[5], late[7] = "To do", None, "Ask for an extension"
for i in items:
    if i[1] == "Chapter quiz 1" and i[5] is not None:
        i[5] = 22                                          # a good quiz, not a perfect one
items.sort(key=lambda i: (i[3], i[0]))
study = []
d = start
while d <= today:
    for _ in range(1 if d == today else rng.choice([1, 1, 2, 2, 2, 3] if d.weekday() < 5 else [0, 1, 2])):
        course = rng.choice([c[0] for c in courses])
        what = {"Biology 101": ["Cell biology notes", "Lab write-up", "Flashcards"],
                "Calculus I": ["Problem set", "Limits review", "Derivatives practice"],
                "English Composition": ["Essay draft", "Reading", "Revisions"],
                "Intro to Psychology": ["Chapter reading", "Quiz review", "Research"],
                "Spanish I": ["Vocabulary", "Workbook", "Listening practice"]}[course]
        study.append((d, course, rng.choice([45, 60, 60, 75, 90, 120]), rng.choice(what)))
    d += dt.timedelta(days=1)
timetable = {("Biology 101", 0, 9), ("Biology 101", 2, 9), ("Biology 101", 4, 9), ("Biology 101", 3, 14),
             ("Calculus I", 0, 11), ("Calculus I", 1, 11), ("Calculus I", 3, 11), ("Calculus I", 4, 11),
             ("English Composition", 1, 13), ("English Composition", 3, 13),
             ("Intro to Psychology", 0, 14), ("Intro to Psychology", 2, 14),
             ("Spanish I", 1, 9), ("Spanish I", 2, 11), ("Spanish I", 4, 13)}

wb = Workbook()


def tile(ws, col, row, label, formula, fmt, colour=TEAL, span=1):
    ws[f"{col}{row}"] = label
    ws[f"{col}{row}"].font = font(10, True, MUTED)
    ws[f"{col}{row + 1}"] = formula
    ws[f"{col}{row + 1}"].number_format = fmt
    ws[f"{col}{row + 1}"].font = font(16, True, colour)
    ws[f"{col}{row + 1}"].alignment = Alignment(horizontal="right")
    first = ws[f"{col}{row}"].column
    for r in (row, row + 1):
        for c in range(first, first + span):
            ws.cell(r, c).border = box
        if span > 1:
            ws.merge_cells(start_row=r, start_column=first, end_row=r, end_column=first + span - 1)
    ws.row_dimensions[row + 1].height = 34


def dropdown(ws, formula, cells, strict=True):
    dv = DataValidation(type="list", formula1=formula, allow_blank=True, showErrorMessage=strict)
    ws.add_data_validation(dv)
    dv.add(cells)


def when_colours(ws, rng_, first, due):
    ws.conditional_formatting.add(rng_, FormulaRule(formula=[f'LEFT({first},4)="Late"'], fill=fill(BAD),
                                                    font=Font(name=F, bold=True, color="9B1C1C")))
    ws.conditional_formatting.add(rng_, FormulaRule(formula=[f'AND(LEFT({first},3)="Due",{due}<=TODAY()+7)'], fill=fill(WARN)))
    ws.conditional_formatting.add(rng_, FormulaRule(formula=[f'{first}="Done"'], fill=fill(OK)))


# ---------------------------------------------------------------- Settings
se = wb.active
se.title = "Settings"
sheet_base(se, "Settings", "Kinds of work, your grade scale and your weekly study goal.", [3, 20, 4, 10, 10, 10, 4, 50],
           rows=30)
header(se, 5, 2, ["Kinds of work"])
for k, c in enumerate(CATS):
    style(se.cell(6 + k, 2, c), True, bold=True)
header(se, 5, 4, ["From", "Letter", "Points"])
for k, (frm, letter, pts) in enumerate(SCALE):
    style(se.cell(6 + k, 4, frm / 100), True, "0%", align="center")
    style(se.cell(6 + k, 5, letter), True, bold=True, align="center")
    style(se.cell(6 + k, 6, pts), True, "0.0", align="center")
se["B14"] = "Study goal per week (hours)"
se["B14"].font = font(11, True)
style(se["B15"], True, "0", True, "center")
se["B15"] = 15
for k, text in enumerate(["The grade scale goes from low to high: a grade gets the letter of the last line it reaches.",
                          "Change it to your school's scale. Leave the points empty if you do not use a GPA.",
                          "The kinds of work are the columns of weights on the Courses tab."]):
    se.cell(6 + k, 8, text).font = font(10, color=MUTED, italic=True)

# ---------------------------------------------------------------- Assignments
asg = wb.create_sheet("Assignments")
sheet_base(asg, "Assignments and exams", "One line per assignment, quiz or exam. Type the score when you get it back.",
           [3, 20, 24, 12, 13, 12, 8, 8, 9, 15, 24], rows=A1 + 2)
header(asg, 5, 2, ["Course", "Title", "Kind", "Due date", "Status", "Score", "Out of", "Percent", "When", "Note"])
for r in range(A0, A1 + 1):
    it = items[r - A0] if r - A0 < len(items) else (None,) * 8
    course, title_, cat, due, status, score, out_of, note = it
    style(asg.cell(r, 2, course), True, bold=True)
    style(asg.cell(r, 3, title_), True)
    style(asg.cell(r, 4, cat), True)
    style(asg.cell(r, 5, due), True, DATE)
    style(asg.cell(r, 6, status), True, align="center")
    style(asg.cell(r, 7, score), True, "0.##", align="center")
    style(asg.cell(r, 8, out_of), True, "0.##", align="center")
    style(asg.cell(r, 9, f'=IF(OR(G{r}="",N(H{r})=0),"",G{r}/H{r})'), False, PCT, align="center")
    finished = f'OR(F{r}="Done",G{r}<>"")'
    days = lambda a: f'{a}&IF({a}=1," day"," days")'
    style(asg.cell(r, 10, f'=IF(OR(B{r}="",E{r}=""),"",IF({finished},"Done",IF(E{r}<TODAY(),"Late by "&{days(f"(TODAY()-E{r})")},'
                          f'IF(E{r}=TODAY(),"Due today",IF(E{r}=TODAY()+1,"Due tomorrow","Due in "&{days(f"(E{r}-TODAY())")})))))'),
          False, align="center")
    style(asg.cell(r, 11, note), True)
    asg.cell(r, 12, f'=IF(G{r}="","",N(H{r}))')                                                    # L out of, graded only
    asg.cell(r, 13, f'=IF(OR(B{r}="",E{r}="",{finished}),"",E{r}+ROW()/10000000)')                 # M open, by due date
for c in "LM":
    asg.column_dimensions[c].hidden = True
dropdown(asg, f"={CO('B')}", f"B{A0}:B{A1}")
dropdown(asg, "=Settings!$B$6:$B$11", f"D{A0}:D{A1}")
dropdown(asg, '"To do,In progress,Done"', f"F{A0}:F{A1}")
when_colours(asg, f"J{A0}:J{A1}", f"$J{A0}", f"$E{A0}")
asg.conditional_formatting.add(f"I{A0}:I{A1}", FormulaRule(formula=[f'AND(I{A0}<>"",I{A0}<0.7)'], fill=fill(WARN)))
asg.freeze_panes = "C6"

# ---------------------------------------------------------------- Courses
co = wb.create_sheet("Courses")
sheet_base(co, "Courses", "Each course with its credits and how much each kind of work counts. The weights should add up to 100%.",
           [3, 22, 14, 8] + [10] * 6 + [9, 9, 10, 8, 14, 10], rows=C1 + 4)
header(co, 5, 2, ["Course", "Teacher", "Credits"] + [f"=Settings!B{6 + k}" for k in range(6)] +
       ["Target", "Weights", "Grade now", "Letter", "Needed on final", "Due in 7 days"])
for r in range(C0, C1 + 1):
    c_ = courses[r - C0] if r - C0 < len(courses) else (None, None, None, (None,) * 6, None)
    style(co.cell(r, 2, c_[0]), True, bold=True)
    style(co.cell(r, 3, c_[1]), True)
    style(co.cell(r, 4, c_[2]), True, "0", align="center")
    for k in range(6):
        w = c_[3][k]
        style(co.cell(r, 5 + k, w if w else None), True, "0%", align="center")
        cat = f"Settings!$B${6 + k}"
        got = f'SUMIFS({AS("G")},{AS("B")},$B{r},{AS("D")},{cat})'
        out = f'SUMIFS({AS("L")},{AS("B")},$B{r},{AS("D")},{cat})'
        co.cell(r, 18 + k, f'=IF(OR($B{r}="",{out}=0),0,{got}/{out})')                            # R..W average
        co.cell(r, 24 + k, f'=IF(OR($B{r}="",{out}=0),0,N({L(5 + k)}{r}))')                         # X..AC weight if graded
    style(co.cell(r, 11, c_[4]), True, "0%", align="center")
    style(co.cell(r, 12, f'=IF(B{r}="","",SUM(E{r}:J{r}))'), False, "0%", align="center")
    grade = f"SUMPRODUCT(E{r}:J{r},R{r}:W{r})/SUM(X{r}:AC{r})"
    style(co.cell(r, 13, f'=IF(OR(B{r}="",SUM(X{r}:AC{r})=0),"",{grade})'), False, PCT, True, "center")
    style(co.cell(r, 14, f'=IF(M{r}="","",INDEX(Settings!$E$6:$E$17,MATCH(M{r}+0.0000001,Settings!$D$6:$D$17,1)))'),
          False, bold=True, align="center")
    wf = f"N(I{r})"
    need = f"(N(K{r})-M{r}*(1-{wf}))/{wf}"
    style(co.cell(r, 15, f'=IF(OR(M{r}="",{wf}=0,AB{r}>0,N(K{r})=0),"",IF({need}<=0,"Any score",IF({need}>1,"Above 100%",{need})))'),
          False, PCT, align="center")
    style(co.cell(r, 16, f'=IF(B{r}="","",COUNTIFS({AS("B")},B{r},{AS("M")},">="&TODAY(),{AS("M")},"<"&(TODAY()+8)))'),
          False, "0", align="center")
    co.cell(r, 30, f'=IF(N{r}="","",IFERROR(INDEX(Settings!$F$6:$F$17,MATCH(N{r},Settings!$E$6:$E$17,0)),""))')   # AD points
for c in range(18, 31):
    co.column_dimensions[L(c)].hidden = True
co.conditional_formatting.add(f"L{C0}:L{C1}", FormulaRule(formula=[f'AND(L{C0}<>"",ROUND(L{C0},4)<>1)'], fill=fill(BAD)))
co.conditional_formatting.add(f"M{C0}:M{C1}", FormulaRule(formula=[f'AND(M{C0}<>"",M{C0}>=K{C0})'], fill=fill(OK)))
co.conditional_formatting.add(f"M{C0}:M{C1}", FormulaRule(formula=[f'AND(M{C0}<>"",M{C0}<K{C0})'], fill=fill(WARN)))
co.conditional_formatting.add(f"O{C0}:O{C1}", FormulaRule(formula=[f'O{C0}="Above 100%"'], fill=fill(BAD)))
co.conditional_formatting.add(f"O{C0}:O{C1}", FormulaRule(formula=[f'O{C0}="Any score"'], fill=fill(OK)))
co[f"B{C1 + 2}"] = ("Grade now counts only the kinds of work that already have scores. Needed on final is the score on the "
                    "final that brings you to your target, if the rest stays as it is.")
co[f"B{C1 + 2}"].font = font(10, color=MUTED, italic=True)
co.freeze_panes = "C6"

# ---------------------------------------------------------------- Study log
sl = wb.create_sheet("Study log")
sheet_base(sl, "Study log", "One line each time you study, with the minutes.", [3, 13, 22, 10, 30], rows=S1 + 2)
header(sl, 5, 2, ["Date", "Course", "Minutes", "What"])
for r in range(S0, S1 + 1):
    s = study[r - S0] if r - S0 < len(study) else (None,) * 4
    for c, (v, fmt) in enumerate(zip(s, (DATE, None, "0", None)), start=2):
        style(sl.cell(r, c, v), True, fmt, align="center" if c == 4 else None)
    sl.cell(r, 6, f'=IF(B{r}="","",B{r}-WEEKDAY(B{r},3))')                                         # F week start
sl.column_dimensions["F"].hidden = True
dropdown(sl, f"={CO('B')}", f"C{S0}:C{S1}")
sl.freeze_panes = "B6"

# ---------------------------------------------------------------- Timetable
tt = wb.create_sheet("Timetable")
sheet_base(tt, "Timetable", "Type a course name in each hour you have class. The colours follow the Courses tab.",
           [3, 9] + [17] * 7, rows=24)
header(tt, 5, 2, ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])
for h in range(8, 19):
    r = 6 + h - 8
    c = tt.cell(r, 2, f"{h}:00")
    c.font = font(10, True, MUTED)
    c.alignment = Alignment(horizontal="right", vertical="center")
    tt.row_dimensions[r].height = 24
    for k in range(7):
        name = next((cn for cn, day, hour in timetable if day == k and hour == h), None)
        cell = style(tt.cell(r, 3 + k, name), True)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.font = font(10, True, TEAL_D)
        tt.cell(r, 12 + k, f'=IF({L(3 + k)}{r}="",0,IFERROR(MATCH({L(3 + k)}{r},{CO("B")},0),0))')   # L..R course number
for c in range(12, 19):
    tt.column_dimensions[L(c)].hidden = True
for n, colour in enumerate(COURSE_COLOURS, start=1):
    tt.conditional_formatting.add("C6:I16", FormulaRule(formula=[f"L6={n}"], fill=fill(colour)))
tt.conditional_formatting.add("C6:I16", FormulaRule(formula=['AND(C6<>"",L6=0)'], fill=fill("EEF1F1")))
dropdown(tt, f"={CO('B')}", "C6:I16", strict=False)

# ---------------------------------------------------------------- Dashboard
db = wb.create_sheet("Dashboard", 0)
sheet_base(db, "Student dashboard", "What is due, where your grades stand, and how much you studied.",
           [3, 22, 10, 8, 9, 15, 13, 3, 12, 22, 22, 14, 3], rows=60)
wk = f'{SL("F")},TODAY()-WEEKDAY(TODAY(),3)'
tile(db, "B", 5, "GPA so far", f'=IF(SUM({CO("AF")})=0,"",SUMPRODUCT({CO("AE")},{CO("D")})/SUM({CO("AF")}))', "0.00")
tile(db, "C", 5, "Due in 7 days", f'=COUNTIFS({AS("M")},">="&TODAY(),{AS("M")},"<"&(TODAY()+8))', "0", "B07A00", span=2)
tile(db, "E", 5, "Late", f'=COUNTIFS({AS("M")},"<"&TODAY())', "0", "B4541F")
tile(db, "F", 5, "Studied this week", f'=SUMIFS({SL("D")},{wk})/60', '0.0" h"', span=1)
tile(db, "G", 5, "Weekly goal", "=Settings!$B$15", '0" h"', MUTED)

header(db, 8, 2, ["Course", "Grade", "Letter", "Target", "Needed on final", "Due in 7 days"])
for k in range(C1 - C0 + 1):
    r, cr = 9 + k, C0 + k
    style(db.cell(r, 2, f'=IF(Courses!B{cr}="","",Courses!B{cr})'), False, bold=True)
    style(db.cell(r, 3, f'=IF(B{r}="","",Courses!M{cr})'), False, PCT, True, "center")
    style(db.cell(r, 4, f'=IF(B{r}="","",Courses!N{cr})'), False, bold=True, align="center")
    style(db.cell(r, 5, f'=IF(B{r}="","",Courses!K{cr})'), False, "0%", align="center")
    style(db.cell(r, 6, f'=IF(B{r}="","",Courses!O{cr})'), False, PCT, align="center")
    style(db.cell(r, 7, f'=IF(B{r}="","",Courses!P{cr})'), False, "0", align="center")
db.conditional_formatting.add("C9:C18", FormulaRule(formula=['AND(C9<>"",C9>=E9)'], fill=fill(OK)))
db.conditional_formatting.add("C9:C18", FormulaRule(formula=['AND(C9<>"",C9<E9)'], fill=fill(WARN)))
db.conditional_formatting.add("F9:F18", FormulaRule(formula=['F9="Above 100%"'], fill=fill(BAD)))
db.conditional_formatting.add("F9:F18", FormulaRule(formula=['F9="Any score"'], fill=fill(OK)))

header(db, 8, 9, ["Due", "Course", "Title", "When"])
for k in range(10):
    r = 9 + k
    key = f"O{r}"
    db[key] = f'=IFERROR(SMALL({AS("M")},{k + 1}),"")'
    row = f'MATCH({key},{AS("M")},0)'
    style(db.cell(r, 9, f'=IF({key}="","",INT({key}))'), False, "ddd d mmm", align="center")
    style(db.cell(r, 10, f'=IF({key}="","",INDEX({AS("B")},{row}))'), False, bold=True)
    style(db.cell(r, 11, f'=IF({key}="","",INDEX({AS("C")},{row}))'), False)
    style(db.cell(r, 12, f'=IF({key}="","",INDEX({AS("J")},{row}))'), False, align="center")
db.column_dimensions["O"].hidden = True
when_colours(db, "L9:L18", "$L9", "$I9")
db["I19"] = "Everything not done yet, the soonest first. Late work comes first."
db["I19"].font = font(9, color=MUTED, italic=True)

header(db, 21, 2, ["Week of", "Hours", "Goal"])
for k in range(6):
    r = 22 + k
    style(db.cell(r, 2, f"=TODAY()-WEEKDAY(TODAY(),3)-{7 * (5 - k)}"), False, "d mmm", align="center")
    style(db.cell(r, 3, f'=SUMIFS({SL("D")},{SL("F")},B{r})/60'), False, "0.0", align="center")
    style(db.cell(r, 4, "=Settings!$B$15"), False, "0", align="center")
chart = BarChart()
chart.type = "col"
chart.title = "Study hours by week"
chart.height, chart.width = 7, 12
chart.add_data(Reference(db, min_col=3, min_row=21, max_row=27), titles_from_data=True)
chart.set_categories(Reference(db, min_col=2, min_row=22, max_row=27))
chart.series[0].graphicalProperties.solidFill = TEAL
chart.y_axis.number_format = "0"
chart.legend = None
db.add_chart(chart, "F21")

header(db, 21, 11, ["Course", "Hours this term"])
for k in range(C1 - C0 + 1):
    r = 22 + k
    style(db.cell(r, 11, f"=B{9 + k}"), False, bold=True)
    style(db.cell(r, 12, f'=IF(K{r}="","",SUMIFS({SL("D")},{SL("C")},K{r})/60)'), False, "0.0", align="center")

# GPA helper on the Courses tab: grade points of each graded course.
for r in range(C0, C1 + 1):
    co.cell(r, 31, f'=IF(OR(B{r}="",AD{r}=""),0,AD{r})')                                            # AE points or 0
    co.cell(r, 32, f'=IF(OR(B{r}="",AD{r}=""),0,N(D{r}))')                                          # AF credits if graded
for c in ("AE", "AF"):
    co.column_dimensions[c].hidden = True

# ---------------------------------------------------------------- Start Here
st = wb.create_sheet("Start Here")
sheet_base(st, "Start here", "Type only in the yellow cells. Everything else is calculated.", [3, 6, 106])
steps = [
    ("1", "Settings: your kinds of work, your school's grade scale and a weekly study goal."),
    ("2", "Courses: each course with its credits, how much each kind of work counts, and the grade you are aiming for."),
    ("3", "Assignments: every assignment, quiz and exam with its due date. Add the score when you get it back."),
    ("4", "Study log: one line each time you study. Timetable: the hours you have class."),
    ("5", "Dashboard: what is due next, your grade in each course, what you need on the final, and your study hours."),
]
for k, (n, text) in enumerate(steps):
    r = 5 + k * 2
    st.cell(r, 2, n).font = font(18, True, TEAL)
    st.cell(r, 3, text).font = font(13)
for k, text in enumerate(["An assignment counts as done once it has a score or its status is Done.",
                          "The example term shows how it works. Delete it and add your own courses and work.",
                          "Works in Google Sheets and Microsoft Excel, for any school that grades in percentages."]):
    st.cell(16 + k * 2, 3, text).font = font(11, color=MUTED, italic=True)

order = ["Dashboard", "Assignments", "Courses", "Study log", "Timetable", "Settings", "Start Here"]
wb._sheets = [wb[name] for name in order]
wb.active = 0
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Student-Planner.xlsx")
wb.save(out)
print("saved", out, len(items), "assignments", len(study), "study sessions")
