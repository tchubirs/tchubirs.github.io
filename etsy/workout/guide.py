"""One-page buyer guide (PDF) for the Workout Log and Progress Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Workout Log and Progress Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about ten minutes. After each workout, logging
takes a minute or two.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Workout-Log-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. With the Google Sheets app
you can log your sets on your phone at the gym.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Dashboard:</b> pick lb or kg, and type your goal weight.</li>
<li><b>Exercises:</b> the exercises you do, each with its muscle group and whether it uses weights or your bodyweight.</li>
<li><b>Plan:</b> the workout for each day of the week (or Rest), and in the boxes below, the exercises, sets and reps
of each workout.</li>
</ol>
<p style="{S}">You only type in the <span style="background-color:#FFF4C2">yellow cells</span>. Delete the example log
and weigh-ins before you start. Select the yellow cells and press Delete, rather than deleting whole rows.</p>
<h2 style="color:#1F6F78;{S}">After each workout</h2>
<p style="{S}"><b>Log:</b> one line per exercise, with the date, the workout, and the weight and reps of up to five sets.
For a bodyweight exercise, leave the weight empty and type only the reps. The best set, an estimated max and the volume
fill in by themselves. A set that beats every earlier set of that exercise is marked <i>New best</i>.</p>
<p style="{S}"><b>Body:</b> your weight once a week, and your measurements every few weeks.</p>
<h2 style="color:#1F6F78;{S}">Reading it</h2>
<p style="{S}">The Dashboard shows the last 7 days, the last 12 weeks with a chart of the volume, the sets for each
muscle group, your latest new bests and your weight against your goal. The Calendar shows every day you trained in the
month you pick. The estimated max uses weight x (1 + reps / 30).</p>
<p style="{S};color:#5E6E72;font-size:9px">A training log only. It does not give medical or training advice. Made with the help of AI tools.</p>
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
