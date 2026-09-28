"""One-page buyer guide (PDF) for the Wedding Budget Planner."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Wedding Budget Planner</h1>
<p style="{S};color:#5E6E72">Congratulations, and thanks for your order. Setting it up takes about ten minutes.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets</b> is the easiest way to plan together: go to drive.google.com, click <i>New &gt; File upload</i>
and pick <b>Wedding-Budget-Planner.xlsx</b>. Open it, choose <i>File &gt; Save as Google Sheets</i>, then use <i>Share</i> to invite your partner.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Dashboard:</b> type your wedding date.</li>
<li><b>Budget:</b> type your total budget. The percentages are a common starting point. Change them to match your priorities; together they must make 100.</li>
<li><b>Vendors:</b> add each vendor once you have a quote, with what you have paid and when the next payment is due.</li>
<li><b>Guests:</b> one line per guest. Update the RSVP and meal as answers come in.</li>
</ol>
<p style="{S}">You only type in the <span style="background-color:#FFF4C2">yellow cells</span>. Delete the example vendors and guests before you start. Select the yellow cells and press Delete, rather than deleting whole rows.</p>
<h2 style="color:#1F6F78;{S}">Once a week</h2>
<p style="{S}">Look at the Heads-up box on the Dashboard. It lists overdue payments, payments due in the next 14 days and guests who have not answered.</p>
<p style="{S};color:#5E6E72;font-size:9px">Made with the help of AI tools. Works with any currency.</p>
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
