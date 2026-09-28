"""One-page buyer guide (PDF) shipped with the spreadsheet."""
import pymupdf

HTML = """
<h1 style="color:#15525A;font-family:sans-serif">ADHD-Friendly Budget Spreadsheet</h1>
<p style="font-family:sans-serif;color:#5E6E72">Thank you! Here is how to start in 5 minutes.</p>
<h2 style="color:#1F6F78;font-family:sans-serif">Open it</h2>
<p style="font-family:sans-serif"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i>,
choose <b>ADHD-Friendly-Budget.xlsx</b>, then open it and click <i>File &gt; Save as Google Sheets</i>.</p>
<p style="font-family:sans-serif"><b>Excel:</b> double-click <b>ADHD-Friendly-Budget.xlsx</b>. If Excel shows a yellow
"Enable editing" bar, click it.</p>
<h2 style="color:#1F6F78;font-family:sans-serif">Set it up</h2>
<ol style="font-family:sans-serif">
<li><b>Budget</b> tab: your monthly amount per category, and how much you want to save.</li>
<li><b>Bills</b> tab: each bill once, with the day of the month it is due.</li>
<li><b>Log</b> tab: one line each time you spend or get paid.</li>
</ol>
<p style="font-family:sans-serif">Only type in the <span style="background-color:#FFF4C2">yellow cells</span>.
Delete the example lines when you are ready.</p>
<h2 style="color:#1F6F78;font-family:sans-serif">Every day (10 seconds)</h2>
<p style="font-family:sans-serif">Open the <b>Dashboard</b>: the big number is what you can safely spend per day for the
rest of the month. Something tempting? Put it on the <b>Impulse List</b> and decide in 48 hours.</p>
<h2 style="color:#1F6F78;font-family:sans-serif">Every month</h2>
<p style="font-family:sans-serif">Pick the new month on the Dashboard, and set every bill back to <b>FALSE</b> in the
<i>Paid?</i> column.</p>
<p style="font-family:sans-serif;color:#5E6E72;font-size:9px">This is a personal budgeting tool, not financial advice.
Designed with the help of AI tools.</p>
"""

story = pymupdf.Story(html=HTML)
writer = pymupdf.DocumentWriter("Start-Here-Guide.pdf")
rect = pymupdf.paper_rect("a4")
where = rect + (50, 50, -50, -50)
more = True
while more:
    dev = writer.begin_page(rect)
    more, _ = story.place(where)
    story.draw(dev)
    writer.end_page()
writer.close()
print("ok")
