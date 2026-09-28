"""One-page buyer guide (PDF) for the Personal Loan Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Personal Loan Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about ten minutes: your name, then each loan
once. After that, a line for each payment.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> at drive.google.com, click <i>New &gt; File upload</i>, pick
<b>Personal-Loan-Tracker.xlsx</b>, open it and choose <i>File &gt; Save as Google Sheets</i>.
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> your name for the statements, the currency, and how many days before a payment it shows as
Due soon.</li>
<li><b>Loans:</b> each loan once, lent or borrowed, with its date and amount. For a plan, add the number of payments,
how often (every week, 2 weeks or month) and the first payment date. Leave the plan empty for a loan paid back
whenever it suits.</li>
<li>Delete the example people, loans and payments: they are made up.</li>
</ol>
<h2 style="color:#1F6F78;{S}">As money comes in and goes out</h2>
<ul style="{S}">
<li><b>Payments:</b> the date, the loan (pick it by its number and name), the amount and how it was paid.</li>
<li><b>Loans:</b> what is still to pay, the next payment and the status: On track, Due soon, Overdue, Open or Paid
off.</li>
<li><b>Statement:</b> pick a loan to print or share it, with a message at the bottom you can copy and send.</li>
</ul>
<h2 style="color:#1F6F78;{S}">Good to know</h2>
<ul style="{S}">
<li>Interest is simple: so much a year on the amount of the loan, over the time of the plan. With no plan, it runs
from the date of the loan to today.</li>
<li>A plan splits the total into equal payments. The last one takes the odd cents.</li>
<li>A payment counts as overdue from the day after its date.</li>
<li>Room for 300 loans and 800 payments.</li>
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
