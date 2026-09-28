"""One-page buyer guide (PDF) for the Cash Envelope Budget."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Cash Envelope Budget</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about fifteen minutes, and each payday
about five.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Cash-Envelope-Budget.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> how often you are paid, and the notes your bank gives out.</li>
<li>Delete the example envelopes, paydays and spending: they are made up. Select their yellow cells and press
Delete, rather than deleting whole rows. Keep each envelope on its line, since the Paydays columns follow the
order of the list.</li>
<li><b>Envelopes:</b> each envelope once, with what goes in it each payday, the largest note you want in it, and
the cash already in it. A sinking fund, such as Christmas or car repairs, can have a target and a date.</li>
</ol>
<h2 style="color:#1F6F78;{S}">Each payday</h2>
<ul style="{S}">
<li><b>Paydays:</b> a new line with the date and the paycheck, then what goes into each envelope. To start from
your plan, copy the plan row above the envelope names and paste it with <i>Paste special &gt; Values only</i>.</li>
<li><b>Cash:</b> the notes to ask for at the bank, and how many of each go into each envelope. <b>Cards</b>
prints a card for each envelope, to note your spending on paper.</li>
</ul>
<h2 style="color:#1F6F78;{S}">As you spend</h2>
<ul style="{S}">
<li><b>Spending:</b> one line each time you spend cash from an envelope. Money you get back goes in with a minus
sign. To move cash to another envelope, pick where it goes under <i>Moved to</i>.</li>
<li>What is left in an envelope stays in it and carries over to the next month.</li>
</ul>
<h2 style="color:#1F6F78;{S}">Good to know</h2>
<ul style="{S}">
<li>The Dashboard shows the month set in Settings, envelope by envelope.</li>
<li>An envelope is Low when less than a quarter of its plan is left. You can change the share in Settings.</li>
<li>The Check columns flag a line that needs a look, such as one with no date. Room for 16 envelopes, 200
paydays and 1,000 lines of spending.</li>
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
