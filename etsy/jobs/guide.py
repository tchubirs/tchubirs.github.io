"""One-page buyer guide (PDF) for the Job Application Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Job Application Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order, and good luck with the search. Setting it up takes about five
minutes. After that, a line for each job keeps everything up to date.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Job-Application-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. With the Google Sheets
app you can add a job from your phone.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> how many applications a week you aim for, after how many days to follow up, and after how many
days of silence a job counts as No reply.</li>
<li>Delete the example jobs, interviews and contacts: they are made up. Select the yellow cells and press Delete, rather than deleting whole rows.</li>
</ol>
<h2 style="color:#1F6F78;{S}">As you go</h2>
<ul style="{S}">
<li><b>Applications:</b> one line per job you save or apply for. Keep two things up to date: the stage, and the day
of the last contact with them.</li>
<li><b>Next step:</b> a call, a task or a closing date, with its date. Without one, a follow-up date comes by itself
from the last contact, and the Dashboard lists it.</li>
<li><b>Interviews:</b> each one with what to prepare and how it went. An x once the thank-you note is sent.</li>
<li><b>Contacts:</b> recruiters and people who can help, with the next time to get in touch.</li>
<li><b>Dashboard:</b> the pipeline, the next steps in date order, the interviews coming, and each week against your
goal.</li>
</ul>
<h2 style="color:#1F6F78;{S}">Good to know</h2>
<ul style="{S}">
<li>Replies counts every job that moved past Applied, a rejection included: it shows how often your applications
get an answer.</li>
<li>Rejected and withdrawn jobs stay on the list in grey, so the numbers stay honest.</li>
<li>Room for 300 jobs, 200 interviews and 200 contacts.</li>
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
