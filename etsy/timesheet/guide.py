"""One-page buyer guide (PDF) for the Timesheet and Invoice Maker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Timesheet and Invoice Maker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about ten minutes.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Timesheet-Invoice-Maker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> your details as the invoice shows them, the currency, the days a client has to pay, your bank
details and a note. If you charge tax, add its name, the rate and your tax number. If not, leave the rate at 0%.</li>
<li><b>Clients:</b> the example clients are made up, so delete them and add yours, with the rate per hour and any
days to pay of their own. Select the yellow cells and press Delete, rather than deleting whole rows.</li>
<li><b>Projects:</b> only for a project with its own rate, or with a budget of hours you want to keep an eye on.</li>
</ol>
<h2 style="color:#1F6F78;{S}">As you work</h2>
<ul style="{S}">
<li><b>Timesheet:</b> one line per piece of work with the date, the client, the project if there is one, and what you
did. Type the start and end times with any break in minutes, or just the hours. An x under Not billable keeps a line
off every invoice. Own rate is for a line at another rate, such as a fixed fee typed as 1 hour.</li>
<li><b>Invoices:</b> to bill a client, add a line with the invoice number, the client, the date and the dates of the
work. The lines of that client in those dates go on it by themselves. Without a date it counts as a draft. When the
client pays, type the day under Paid on.</li>
<li><b>Invoice:</b> pick the number at the top right and the page fills in. To save it as a PDF in Google Sheets, open
the Invoice tab, choose <i>File &gt; Download &gt; PDF</i>, pick <i>Current sheet</i> and untick the gridlines. In
Excel, choose <i>File &gt; Save As</i> and PDF.</li>
</ul>
<h2 style="color:#1F6F78;{S}">Good to know</h2>
<ul style="{S}">
<li>A line you add later with a date inside an invoice you have sent goes on that invoice. To bill it on the next one,
pick that number under Put on invoice.</li>
<li>When a client's rate goes up, the old lines take the new rate too. Before you change it, copy the Rate column of
the old lines and paste it as values under Own rate.</li>
<li>An invoice has room for 10 lines, one per project and rate, and the Hours report for 45. The totals always
count every line. The file holds 2,000 lines of work and 300 invoices.</li>
</ul>
<p style="{S};color:#5E6E72;font-size:9px">This file does not give tax advice: check what an invoice needs to show
where you work. Made with the help of AI tools.</p>
"""
story = pymupdf.Story(html=HTML)
writer = pymupdf.DocumentWriter("Start-Here-Guide.pdf")
rect = pymupdf.paper_rect("a4")
more = True
while more:
    dev = writer.begin_page(rect)
    more, _ = story.place(rect + (50, 46, -50, -38))
    story.draw(dev)
    writer.end_page()
writer.close()
print("ok")
