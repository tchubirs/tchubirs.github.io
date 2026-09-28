"""One-page buyer guide (PDF) for the Group Trip Expense Splitter."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Group Trip Expense Splitter</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes two minutes. During the trip, one line per
expense, and at the end the file tells you who pays whom.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Trip-Expense-Splitter.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. Share it with the
group so everyone can add what they pay, from the Google Sheets app on their phone.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<p style="{S}"><b>Setup:</b> the name of the trip, your home currency, the people on the trip (up to 12), and what
each other currency is worth in your home currency, for example 1 EUR is worth 1.08 USD. The example trip is
made up. Select the yellow cells and press Delete, rather than deleting whole rows.</p>
<h2 style="color:#1F6F78;{S}">During the trip</h2>
<p style="{S}"><b>Expenses:</b> one line per expense, with the date, what it was, a category, the amount, the currency
and who paid. Then choose who shares it:</p>
<ul style="{S}">
<li>Leave the share columns empty to split it equally between everyone.</li>
<li>Put an x under each person who shares it, to leave the others out.</li>
<li>Put a number instead of an x to give someone more or fewer shares, for example 2 for someone who had two tickets.</li>
</ul>
<p style="{S}">When someone pays another person back during the trip, add a line in the category <i>Paying back</i>,
paid by the one who pays, with an x under the one who gets the money.</p>
<h2 style="color:#1F6F78;{S}">At the end</h2>
<p style="{S}">The Dashboard shows what each person paid, their share of the costs and their balance: who gets money
back and who owes. <i>Settle up</i> lists the fewest payments that bring every balance to zero. It also shows the total,
the cost per person and per day, and the spending by category and by day. Amounts are rounded to the cent, so a balance
can be off by one cent.</p>
<p style="{S};color:#5E6E72;font-size:9px">Exchange rates are the ones you type. Made with the help of AI tools.</p>
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
