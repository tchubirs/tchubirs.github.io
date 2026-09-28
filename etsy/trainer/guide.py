"""One-page buyer guide (PDF) for the Personal Trainer Client Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Personal Trainer Client Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about fifteen minutes. After that, a line for
each session, package and check-in keeps everything up to date.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Personal-Trainer-Client-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. With the
Google Sheets app you can mark a session from your phone.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> your business name, your units, after how many sessions left a client needs a word, how often
you check in, and whether a late cancel uses a session. Name your three performance marks, such as a lift, a count
or a time, and whether higher or lower is better.</li>
<li>Delete the example studio: its clients, sessions, packages and check-ins are made up. Select the yellow cells
and press Delete, rather than deleting whole rows.</li>
<li><b>Clients:</b> each client once, with the day they started and their goal.</li>
</ol>
<h2 style="color:#1F6F78;{S}">As you go</h2>
<ul style="{S}">
<li><b>Packages:</b> each block of sessions a client buys, with the price and what they have paid so far.</li>
<li><b>Sessions:</b> book them ahead with the status empty. Afterwards pick Attended, No-show, Late cancel or
Cancelled. A no-show always uses a session.</li>
<li><b>Check-ins:</b> the measurements and marks you take. Leave empty what you did not measure.</li>
<li><b>Report:</b> pick a client, then print the tab or save it as a PDF to share their progress.</li>
</ul>
<h2 style="color:#1F6F78;{S}">Good to know</h2>
<ul style="{S}">
<li>The Dashboard lists the clients who owe money, are running out of sessions, have a package ending, or are due
a check-in, and the sessions booked next.</li>
<li>The file records numbers only. It gives no health or training advice.</li>
<li>Room for 100 clients, 3,000 sessions, 500 packages and 1,500 check-ins.</li>
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
