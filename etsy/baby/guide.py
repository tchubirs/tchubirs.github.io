"""One-page buyer guide (PDF) for the Baby Log."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Baby Log</h1>
<p style="{S};color:#5E6E72">Thanks for your order, and congratulations. Setting it up takes two minutes. After that,
one line for each feed, sleep or change is all it asks.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Baby-Log.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. With the Google Sheets app you can add
a feed from your phone in the middle of the night, and share the file with your partner.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> the baby's name and birthday, and your units: ml or oz, kg or lb, cm or inches.</li>
<li>The example baby is made up: delete her lines on Feeds, Sleep, Nappies, Growth, Appointments and Milestones. Select the yellow cells and press Delete, rather than deleting whole rows.</li>
</ol>
<h2 style="color:#1F6F78;{S}">Every day</h2>
<ul style="{S}">
<li><b>Feeds:</b> the date and time, breast or bottle, and the minutes or the amount.</li>
<li><b>Sleep:</b> when the baby fell asleep and woke up. A sleep past midnight counts on the day it started.</li>
<li><b>Nappies:</b> the date and time, with an x under Wet, Dirty or both.</li>
<li><b>Dashboard:</b> today, or any day you type in, with the last feed and how long ago, and the seven days before.</li>
</ul>
<h2 style="color:#1F6F78;{S}">Now and then</h2>
<ul style="{S}">
<li><b>Growth:</b> each time the baby is weighed or measured. The age and the weight chart follow.</li>
<li><b>Appointments:</b> checks and vaccines as they are booked. The next one shows on the Dashboard.</li>
<li><b>Milestones:</b> type the date of each first, and the age fills in.</li>
</ul>
<p style="{S};color:#5E6E72;font-size:9px">This is a log and it does not give medical advice. For any question about
feeding, sleep or growth, ask your midwife, health visitor or doctor. Made with the help of AI tools.</p>
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
