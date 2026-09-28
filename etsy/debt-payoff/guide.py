"""One-page buyer guide (PDF) for the Debt Payoff Planner."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Debt Payoff Planner</h1>
<p style="{S};color:#5E6E72">Thank you! Three minutes to your debt-free date.</p>
<h2 style="color:#1F6F78;{S}">Open it</h2>
<p style="{S}"><b>Google Sheets:</b> drive.google.com → <i>New › File upload</i> → choose
<b>Debt-Payoff-Planner.xlsx</b> → open it → <i>File › Save as Google Sheets</i>.
<b>Excel:</b> double-click the file (click "Enable editing" if asked).</p>
<h2 style="color:#1F6F78;{S}">Set it up (Debts tab)</h2>
<ol style="{S}">
<li>One line per debt: current balance, yearly interest rate (%), minimum monthly payment.</li>
<li>The extra amount you can add every month, on top of the minimums. Even a small amount changes the date.</li>
<li>The month of your first payment.</li>
<li>Choose <b>Avalanche</b> (least interest) or <b>Snowball</b> (quick wins).</li>
</ol>
<h2 style="color:#1F6F78;{S}">Every month</h2>
<p style="{S}">The Dashboard tells you one thing to do: pay the minimum on every debt, and the rest on your
<b>focus debt</b>. When a debt is paid off, its minimum rolls over to the next one automatically.
Update the balances from your statements once a month and the plan re-calculates.</p>
<p style="{S};color:#5E6E72;font-size:9px">A planning tool, not financial advice: real interest can be charged
differently by each lender. Designed with the help of AI tools.</p>
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
