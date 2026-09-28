"""Etsy listing photos for the Student Planner (run build.py first)."""
import datetime as dt, os, sys
from openpyxl import load_workbook
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from listingkit import M, Renders, canvas, content, detail, grid, laptop, note, save, title  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
xlsx = os.path.join(HERE, "Student-Planner.xlsx")
tmp = os.path.join(HERE, "out")
r = Renders(xlsx, tmp)
img_dir = os.path.join(HERE, "images")

# The assignments close-up starts ten days ago and shows 24 lines.
rows = [(c.value, c.row) for c in load_workbook(xlsx)["Assignments"]["E"] if c.row >= 6 and c.value]
first = next(n for d, n in rows if d.date() >= dt.date.today() - dt.timedelta(days=10))
close = Renders(xlsx, tmp, hide={"Courses": ["C"]},
                hide_rows={"Assignments": list(range(6, first)) + list(range(first + 24, 506)), "Courses": range(11, 16)})

img = canvas(dark=True)
title(img, "Student planner\nand grade tracker", "Due dates, grades by course, the score you need on the final, study hours",
      dark=True, width=2300)
laptop(img, r.shot("Student dashboard"), 600, 700, 1950)
note(img, ["Google Sheets", "and Excel"], M, 1720, dark=True)
save(img, os.path.join(img_dir, "01-dashboard.jpg"))

detail(os.path.join(img_dir, "02-grades.jpg"), "Your grade in every course",
       "Weighted by each kind of work, with your letter and what you need on the final",
       close.shot("Courses"), [("#D8F0DC", "At or above your target"), ("#FFE2B8", "Below your target")])

detail(os.path.join(img_dir, "03-assignments.jpg"), "Never lose track of a due date",
       "Every assignment, quiz and exam, with its score and how many days are left",
       close.shot("Assignments and exams"),
       [("#F9C9C4", "Late"), ("#FFE2B8", "Due within a week"), ("#D8F0DC", "Done")])

detail(os.path.join(img_dir, "04-timetable.jpg"), "Your class timetable",
       "Type a course in each hour you have class. It takes the colour of the course.",
       r.shot("Timetable"))

img = canvas()
y = title(img, "Inside the file", "Five tabs, settings and a Start Here page. You type in the yellow cells and the rest is calculated.")
grid(img, [
    (content(r.page("Student dashboard")), "Dashboard", "Due next, grades, study hours"),
    (content(r.page("Assignments and exams")), "Assignments", "Due dates, scores, days left"),
    (content(r.page("Courses")), "Courses", "Weights, grade now, needed on final"),
    (content(r.page("Study log")), "Study log", "Minutes per course, hours per week"),
], y + 80)
save(img, os.path.join(img_dir, "05-whats-inside.jpg"))
