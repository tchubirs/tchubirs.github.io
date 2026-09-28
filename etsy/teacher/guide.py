"""One-page buyer guide (PDF) for the Teacher Planner and Gradebook."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Teacher Planner and Gradebook</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about twenty minutes: your classes, your
timetable and your students. After that, a line for each lesson and your marks as they come in.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> at drive.google.com, click <i>New &gt; File upload</i>, pick
<b>Teacher-Planner-Gradebook.xlsx</b>, open it and choose <i>File &gt; Save as Google Sheets</i>.
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> your class names (up to six), the pass mark and your grade scale.</li>
<li><b>Timetable:</b> the class in each period of your usual week, with the start times.</li>
<li><b>Class 1 to Class 6:</b> the students of each class, one on each line.</li>
<li>Delete the example classes, students, lessons and absences: they are made up.</li>
</ol>
<h2 style="color:#1F6F78;{S}">As the weeks go by</h2>
<ul style="{S}">
<li><b>Lessons:</b> the date, the period and the topic. The class comes from the timetable. Add the aims and the
homework, and an x when it is done.</li>
<li><b>Week:</b> the plan for the week, ready to print. For another week, type any day of it on Settings.</li>
<li><b>Class tabs:</b> each assessment with its date, marks out of and weight, then the scores. M for missing work
(counts as 0), Ex for excused, empty for not marked yet.</li>
<li><b>Absences:</b> only the students who were absent or late.</li>
</ul>
<h2 style="color:#1F6F78;{S}">Good to know</h2>
<ul style="{S}">
<li>A test with weight 2 counts twice as much as homework with weight 1.</li>
<li>Each grade on your scale applies from its percent up to the next one.</li>
<li>A score above the marks out of shows in red, and so does a name on Absences that is not on the class list.</li>
<li>Room for 6 classes of 40 students with 20 assessments each, 500 lessons and 400 absences.</li>
</ul>
<p style="{S};color:#5E6E72;font-size:9px">Made with the help of AI tools.</p>
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
