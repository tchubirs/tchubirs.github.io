"""One-page buyer guide (PDF) for the Habit and Mood Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Habit and Mood Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes five minutes. After that, it takes a few
seconds a day.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Habit-Mood-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. With the Google Sheets app
you can tick your habits on your phone.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Habits:</b> type the year and up to 15 habits. Keep each habit on the same line all year, so its streak carries
on from one month to the next.</li>
<li>Clear the example: on each month tab, select the day cells and delete them.</li>
</ol>
<h2 style="color:#1F6F78;{S}">Every day</h2>
<p style="{S}">Open the tab of the month. Type x under the day for each habit you did. In Google Sheets you can use
checkboxes instead: select the day cells and choose <i>Insert &gt; Checkbox</i>. Then give the day a mood from 1 to 5
(5 great, 4 good, 3 okay, 2 low, 1 bad) and type the hours you slept.</p>
<h2 style="color:#1F6F78;{S}">Reading it</h2>
<p style="{S}">Each month tab shows, for every habit, the days done, the share of days so far, the streak you are on
and the best streak. A streak counts the days in a row and carries on across months. The streak you are on counts
today once it is ticked, and until then the days up to yesterday. The Dashboard shows this month's habits, the year
month by month, and your average mood and sleep. Year in pixels colours every day of the year by your mood.</p>
<p style="{S}">For a new year, make a copy of the file, change the year on the Habits tab and clear the day cells.</p>
<p style="{S};color:#5E6E72;font-size:9px">A personal tracker only. It does not give medical advice. Made with the help of AI tools.</p>
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
