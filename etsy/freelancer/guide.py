"""One-page buyer guide (PDF) for the Freelancer Tax Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Freelancer Income &amp; Tax Tracker</h1>
<p style="{S};color:#5E6E72">Thank you! Five minutes to set it up, then one line per invoice or expense.</p>
<h2 style="color:#1F6F78;{S}">Open it</h2>
<p style="{S}"><b>Google Sheets:</b> drive.google.com → <i>New › File upload</i> → <b>Freelancer-Tax-Tracker.xlsx</b> →
open it → <i>File › Save as Google Sheets</i>. <b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Set it up</h2>
<ol style="{S}">
<li><b>Settings:</b> the year, and the share of profit you put aside for tax. Ask your accountant for your rate;
25-30% is a common cautious choice.</li>
<li><b>Income:</b> one line per invoice. Fill <i>Paid on</i> when the money arrives. Invoices turn red when overdue.</li>
<li><b>Expenses:</b> one line per business purchase. Tick <i>Receipt?</i> once you have it.</li>
<li><b>Tax Savings:</b> add a line each time you move money aside for tax.</li>
</ol>
<h2 style="color:#1F6F78;{S}">Every week (2 minutes)</h2>
<p style="{S}">Open the Dashboard: <b>Still to put aside</b> tells you what to move to your tax savings now.
The Heads-up box lists overdue invoices and missing receipts.</p>
<p style="{S};color:#5E6E72;font-size:9px">A tracking tool, not tax advice: rules differ by country. Designed with the help of AI tools.</p>
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
