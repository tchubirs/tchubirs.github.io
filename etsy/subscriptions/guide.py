"""One-page buyer guide (PDF) for the Subscription Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Subscription Tracker</h1>
<p style="{S};color:#5E6E72">Thank you! Two minutes and you will know where your monthly money goes.</p>
<h2 style="color:#1F6F78;{S}">Open it</h2>
<p style="{S}"><b>Google Sheets:</b> drive.google.com → <i>New › File upload</i> → choose
<b>Subscription-Tracker.xlsx</b> → open it → <i>File › Save as Google Sheets</i>.</p>
<p style="{S}"><b>Excel:</b> double-click the file (click "Enable editing" if Excel asks).</p>
<h2 style="color:#1F6F78;{S}">Find all your subscriptions</h2>
<ol style="{S}">
<li>Scroll your bank or card statement for the last 3 months: look for repeating amounts.</li>
<li>Phone: App Store or Google Play → Subscriptions.</li>
<li>Search your e-mail for "receipt", "renewal", "trial".</li>
</ol>
<h2 style="color:#1F6F78;{S}">Fill in</h2>
<p style="{S}">One line each: name, category, cost, billing, the date you were last charged. Mark free trials TRUE.
Only type in the <span style="background-color:#FFF4C2">yellow cells</span>; delete the example lines.</p>
<h2 style="color:#1F6F78;{S}">Use it</h2>
<p style="{S}">Open the Dashboard once a week. Red = a free trial about to charge. Orange = not used for a month.
Mark things <b>Cancel</b> to see what you save per year, then cancel them at the service itself.</p>
<p style="{S};color:#5E6E72;font-size:9px">Designed with the help of AI tools. This tracker does not cancel anything for you.</p>
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
