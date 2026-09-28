"""One-page buyer guide (PDF) for the Net Worth and Dividend Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Net Worth and Dividend Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about fifteen minutes: your accounts once,
then their balances. After that, five minutes at the end of each month.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> at drive.google.com, click <i>New &gt; File upload</i>, pick
<b>Net-Worth-Dividend-Tracker.xlsx</b>, open it and choose <i>File &gt; Save as Google Sheets</i>.
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> the currency, the first month for Balances, and your passive income goal a month.</li>
<li><b>Balances:</b> each account once, with its type. Debts go in as the amount owed.</li>
<li><b>Holdings:</b> the funds, shares and accounts that pay you, with their value now, so the yield can be worked
out.</li>
<li>Delete the example accounts, holdings and income: they are made up. Select the yellow cells and press Delete, rather than deleting whole rows.</li>
</ol>
<h2 style="color:#1F6F78;{S}">Each month</h2>
<ul style="{S}">
<li><b>Balances:</b> the balance of each account at the end of the month.</li>
<li><b>Income:</b> each dividend, interest payment or rent as it comes in, with where it came from.</li>
<li><b>Dashboard:</b> your net worth and how it moved on the month before, your passive income over the last 12
months against the goal, where your money is, and the holdings that pay you the most.</li>
</ul>
<h2 style="color:#1F6F78;{S}">Good to know</h2>
<ul style="{S}">
<li>Net worth is everything you own less everything you owe, for the latest month with balances.</li>
<li>A month left empty on Balances is skipped, and the chart leaves a gap.</li>
<li>Yield is the income of the last 12 months divided by the value now.</li>
<li>Room for 40 accounts over 36 months, 100 holdings and 1,000 income lines.</li>
<li>The file keeps a record for your own use and gives no financial advice.</li>
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
