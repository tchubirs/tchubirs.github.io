"""One-page buyer guide (PDF) for the Party Planner."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Party Planner</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about ten minutes, and then it keeps track of the
guests, the tasks and the money until the day.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Party-Planner.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. Share it with whoever plans
with you and you both see the same lists.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Dashboard:</b> the name of the party, the date, the time it starts and your budget.</li>
<li><b>Guests:</b> the example party is made up, so delete its guests and add yours, one line per guest or family,
with how many adults and kids. An empty Adults cell counts as one adult.</li>
<li><b>Tasks:</b> a checklist is ready, from 8 weeks before to the days after. Change the days before, add your
own tasks or delete the ones you do not need. Every date is counted back from the day of the party.</li>
<li><b>Food and drinks:</b> how much each adult and each kid will eat or drink over the whole party, and the size and
price of a pack.</li>
</ol>
<h2 style="color:#1F6F78;{S}">As the day comes closer</h2>
<ul style="{S}">
<li><b>Guests:</b> type Yes, Maybe or No as the answers come in, and the dietary needs of the guests coming. Note the
gifts, and put an x under Card sent when the thank-you card goes out.</li>
<li><b>Tasks:</b> put an x under Done. The Dashboard lists the next tasks, the late ones first.</li>
<li><b>Food and drinks:</b> the amounts to buy follow the guest list. They count everyone who has not said no, plus
the extra you choose, in whole packs. Put an x under Bought as you shop.</li>
<li><b>Budget:</b> each booking with its estimate, the final price, what you paid and the date the rest is due.</li>
<li><b>The day:</b> the plan hour by hour, and who looks after what.</li>
</ul>
<p style="{S};color:#5E6E72;font-size:9px">The amounts per person are a guide: change them to suit your guests. Made
with the help of AI tools.</p>
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
