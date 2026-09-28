"""One-page buyer guide (PDF) for the Paycheck Budget Planner."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Paycheck Budget Planner</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about ten minutes.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Paycheck-Budget-Planner.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> how often you are paid (weekly, every 2 weeks, twice a month or monthly), your first payday,
your usual paycheck after tax, and what you move to savings from each one.</li>
<li><b>Bills:</b> each bill once, with its amount and the day of the month it is due. For a bill you pay once a year,
type its month under <i>Only in month</i>.</li>
<li><b>Paychecks:</b> your paydays for the next 12 months are listed. When a paycheck is different, for example with
overtime, type it under <i>Different amount</i>.</li>
</ol>
<p style="{S}">You only type in the <span style="background-color:#FFF4C2">yellow cells</span>. Delete the example bills before you start. Select the yellow cells and press Delete, rather than deleting whole rows.</p>
<h2 style="color:#1F6F78;{S}">How to read it</h2>
<p style="{S}">Each bill goes on the last paycheck before its due date, and that paycheck keeps the money for it.
The Dashboard opens on the paycheck you are on today and lists its bills, what is left to spend and how much per day
until the next payday. Orange means tight: less than your daily minimum is left. Red means the bills are more than the
paycheck, so save a little from the paycheck before it.</p>
<p style="{S};color:#5E6E72;font-size:9px">Works with any currency. It is a budgeting tool and does not give financial advice.
Made with the help of AI tools.</p>
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
