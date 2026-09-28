"""One-page buyer guide (PDF) for the Student Planner."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Student Planner and Grade Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about twenty minutes at the start of a term,
most of it typing in the due dates from your course outlines.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Student-Planner.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. The Google Sheets app then
shows what is due on your phone.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> the kinds of work your courses grade (homework, quizzes and so on), your school's grade scale
from low to high, and how many hours a week you want to study.</li>
<li><b>Courses:</b> each course with its credits and how much each kind of work counts, from the course outline. The
weights of a course should add up to 100%. Add the grade you are aiming for.</li>
<li><b>Assignments:</b> every assignment, quiz and exam with its course, kind and due date.</li>
<li><b>Timetable:</b> type a course in each hour you have class.</li>
</ol>
<p style="{S}">You only type in the <span style="background-color:#FFF4C2">yellow cells</span>. Delete the example term
before you start.</p>
<h2 style="color:#1F6F78;{S}">During the term</h2>
<p style="{S}">When you hand something in, set its status to Done. When you get it back, type the score and what it
was out of. Log your study time on the Study log tab. The Dashboard shows what is due next and what is late, your grade
and letter in each course, the score you need on the final to reach your target, your GPA and your study hours by
week.</p>
<p style="{S}">The grade in a course counts only the kinds of work that already have scores. The score needed on the
final assumes the rest of your grade stays as it is.</p>
<p style="{S};color:#5E6E72;font-size:9px">Grades are estimates from the weights you type. Your school's own records always come first. Made with the help of AI tools.</p>
"""
story = pymupdf.Story(html=HTML)
writer = pymupdf.DocumentWriter("Start-Here-Guide.pdf")
rect = pymupdf.paper_rect("a4")
more = True
while more:
    dev = writer.begin_page(rect)
    more, _ = story.place(rect + (50, 50, -50, -50))
    story.draw(dev)
    writer.end_page()
writer.close()
print("ok")
