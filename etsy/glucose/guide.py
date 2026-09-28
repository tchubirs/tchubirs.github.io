"""One-page buyer guide (PDF) for the Blood Sugar and Medicine Log."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Blood Sugar and Medicine Log</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about ten minutes. After that, a line for
each reading and each dose keeps it up to date.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Blood-Sugar-Log.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. With the Google Sheets app you
can add a reading from your phone.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> your name for the report, the units, and for each moment of the day the lowest and highest
numbers your doctor or nurse gave you. The example numbers are made up.</li>
<li><b>Medicines:</b> each one with its dose, up to four times a day, and the day you started. When you stop one,
type the day.</li>
<li>Delete the example readings and doses.</li>
</ol>
<h2 style="color:#1F6F78;{S}">Every day</h2>
<ul style="{S}">
<li><b>Readings:</b> one line per check with the date, time, moment and number. Notes are for food, exercise or how
you felt.</li>
<li><b>Doses:</b> one line each time you take a medicine. Today's list on the Dashboard shows what is taken and what
is still to come.</li>
<li><b>Dashboard:</b> the last reading, the averages for today, the week and the month, how many were below, in or
above your range, and the last two weeks.</li>
</ul>
<h2 style="color:#1F6F78;{S}">Before an appointment</h2>
<p style="{S}">On Settings, set Report from and Report to (as it comes, the last 30 days). Then open the Report tab
and print it or save it as a PDF: in Google Sheets, <i>File &gt; Download &gt; PDF</i> with <i>Current sheet</i>; in
Excel, <i>File &gt; Save As</i> and PDF.</p>
<h2 style="color:#1F6F78;{S}">Good to know</h2>
<ul style="{S}">
<li>A reading is marked below, in or above only if its moment has a range on Settings.</li>
<li>The day-by-day grid on the report holds 31 days. The summary covers all the dates.</li>
<li>Room for 1,500 readings, 20 medicines and 2,000 doses.</li>
</ul>
<p style="{S};color:#5E6E72;font-size:9px">This file keeps a record and gives no medical advice. Talk to your doctor or
nurse about your numbers and your medicines. Made with the help of AI tools.</p>
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
