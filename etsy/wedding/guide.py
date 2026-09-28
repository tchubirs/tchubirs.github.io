"""One-page buyer guide (PDF) for the Wedding Budget Planner."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Wedding Budget Planner</h1>
<p style="{S};color:#5E6E72">Congratulations, and thank you! Ten minutes to set it up.</p>
<h2 style="color:#1F6F78;{S}">Open it</h2>
<p style="{S}"><b>Google Sheets</b> (best for planning together): drive.google.com → <i>New › File upload</i> →
<b>Wedding-Budget-Planner.xlsx</b> → open it → <i>File › Save as Google Sheets</i> → <i>Share</i> with your partner.
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Set it up</h2>
<ol style="{S}">
<li><b>Dashboard:</b> your wedding date.</li>
<li><b>Budget:</b> your total budget. The shares are a common starting point; change them to match your priorities (they must add up to 100).</li>
<li><b>Vendors:</b> add each vendor once you have a quote, with what you paid and when the next payment is due.</li>
<li><b>Guests:</b> one line per guest; update RSVP and meal as answers come in.</li>
</ol>
<p style="{S}">Only type in the <span style="background-color:#FFF4C2">yellow cells</span>. Delete the example vendors and guests.</p>
<h2 style="color:#1F6F78;{S}">Every week</h2>
<p style="{S}">Check the Heads-up box: overdue payments, payments due in the next 14 days, guests who have not answered.</p>
<p style="{S};color:#5E6E72;font-size:9px">Designed with the help of AI tools. Any currency.</p>
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
