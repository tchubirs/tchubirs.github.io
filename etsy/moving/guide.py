"""One-page buyer guide (PDF) for the Moving Planner."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Moving Planner</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about ten minutes, and then it keeps the
tasks, the boxes and the money in one place until you are settled in.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Moving-Planner.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. Share it with whoever moves
with you, and with the Google Sheets app you can tick off boxes from your phone.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Dashboard:</b> moving day, the new home and your budget.</li>
<li><b>Settings:</b> the rooms of the home you are leaving.</li>
<li><b>Tasks:</b> a checklist is ready, from 8 weeks before to 3 weeks after. Change the days before, add your own
tasks or delete the ones you do not need. Every date is counted back from moving day.</li>
<li>The example move is made up: delete its boxes, costs, quotes and names. Select the yellow cells and press Delete, rather than deleting whole rows.</li>
</ol>
<h2 style="color:#1F6F78;{S}">Until moving day</h2>
<ul style="{S}">
<li><b>Boxes:</b> write a number on each box and one line here, with the room it leaves, the room it goes to and what
is inside. Mark it fragile or open first. Put an x under Packed, then under Arrived. The Dashboard gives the next
free number.</li>
<li><b>Movers:</b> the quotes side by side. The cheapest price shows in green.</li>
<li><b>Costs:</b> what you book, the final price when you know it, what you paid and when the rest is due.</li>
<li><b>New address:</b> put an x under Done as you tell each one. On moving day, note the meter readings.</li>
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
