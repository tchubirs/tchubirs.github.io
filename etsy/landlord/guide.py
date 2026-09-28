"""One-page buyer guide (PDF) for the Landlord Rental Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Landlord Rental Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about fifteen minutes. After that you add one line when rent arrives and one per expense.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Landlord-Rental-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> the names of your properties. A building with several flats is one property.</li>
<li><b>Units:</b> one line per unit, with the tenant, the monthly rent, the day rent is due, the grace days you allow,
the lease dates and the deposit you hold.</li>
<li><b>Rent log:</b> one line each time rent arrives. Fill in <i>For month</i> only when a payment is for another month
than the one it arrives in, for example when rent comes in early.</li>
<li><b>Expenses:</b> one line per cost, with its property and a category.</li>
</ol>
<p style="{S}">You only type in the <span style="background-color:#FFF4C2">yellow cells</span>. Delete the example lines before you start.</p>
<h2 style="color:#1F6F78;{S}">Reading it</h2>
<p style="{S}">The Rent roll shows each unit and month: green when paid in full, orange when part paid, red when late.
Rent counts as late once the due day and the grace days have passed. The Dashboard shows rent received, rent owed now,
expenses and net income for the year, each property on its own line, and leases that end in the next 60 days.</p>
<p style="{S};color:#5E6E72;font-size:9px">Works with any currency. It does not give tax advice. Made with the help of AI tools.</p>
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
