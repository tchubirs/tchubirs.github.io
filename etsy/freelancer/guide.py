"""One-page buyer guide (PDF) for the Freelancer Tax Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Freelancer Income &amp; Tax Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about five minutes. After that you add one line per invoice or expense.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick <b>Freelancer-Tax-Tracker.xlsx</b>.
Open it, then choose <i>File &gt; Save as Google Sheets</i>.<br/><b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> the year, and the share of your profit you put aside for tax. Ask your accountant for your rate.
Many freelancers put aside 25 to 30% to be safe.</li>
<li><b>Income:</b> one line per invoice. Fill in <i>Paid on</i> when the money arrives. An invoice turns red when it is overdue.</li>
<li><b>Expenses:</b> one line per business purchase. Choose <i>Yes</i> under <i>Receipt?</i> once you have the receipt.</li>
<li><b>Tax Savings:</b> add a line each time you move money aside for tax.</li>
<li>The example invoices, expenses and savings are made up. Select the yellow cells and press Delete, rather than deleting whole rows.</li>
</ol>
<h2 style="color:#1F6F78;{S}">Once a week</h2>
<p style="{S}">Open the Dashboard. <b>Still to put aside</b> is the amount to move to your tax savings now.
The Heads-up box lists overdue invoices and expenses without a receipt.</p>
<p style="{S};color:#5E6E72;font-size:9px">This file tracks numbers and does not give tax advice; rules differ by country. Made with the help of AI tools.</p>
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
