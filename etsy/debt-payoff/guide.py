"""One-page buyer guide (PDF) for the Debt Payoff Planner."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Debt Payoff Planner</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Filling it in takes about three minutes, and then you see your debt-free date.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Debt-Payoff-Planner.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>.<br/>
<b>Excel:</b> double-click the file, and click "Enable editing" if Excel asks.</p>
<h2 style="color:#1F6F78;{S}">Setting it up (Debts tab)</h2>
<ol style="{S}">
<li>One line per debt: the current balance, the yearly interest rate (%) and the minimum monthly payment.</li>
<li>The extra amount you can pay each month on top of the minimums. Even a small amount moves the date.</li>
<li>The month of your first payment.</li>
<li>The method: <b>Avalanche</b> pays the least interest, <b>Snowball</b> clears the smallest debts first.</li>
</ol>
<h2 style="color:#1F6F78;{S}">Each month</h2>
<p style="{S}">The Dashboard says what to pay: the minimum on every debt, and the rest on your <b>focus debt</b>.
When a debt is paid off, its minimum moves to the next one by itself.
Once a month, update the balances from your statements and the plan is worked out again.</p>
<p style="{S};color:#5E6E72;font-size:9px">This is a planning tool and does not give financial advice. Each lender may charge
interest a little differently. Made with the help of AI tools.</p>
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
