"""One-page buyer guide (PDF) for the Subscription Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Subscription Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Filling it in takes a few minutes, and then you see what your subscriptions cost each month and each year.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Subscription-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>.</p>
<p style="{S}"><b>Excel:</b> double-click the file, and click "Enable editing" if Excel asks.</p>
<h2 style="color:#1F6F78;{S}">Finding your subscriptions</h2>
<ol style="{S}">
<li>Go through your bank or card statements for the last 3 months and look for amounts that repeat.</li>
<li>On your phone, open the App Store or Google Play and go to Subscriptions.</li>
<li>Search your e-mail for "receipt", "renewal" and "trial".</li>
</ol>
<h2 style="color:#1F6F78;{S}">Filling it in</h2>
<p style="{S}">One line per subscription: name, category, cost, how often you pay and the date you were last charged.
Choose Yes under <i>Free trial?</i> for trials. You only type in the <span style="background-color:#FFF4C2">yellow cells</span>. Delete the example lines first. Select the yellow cells and press Delete, rather than deleting whole rows.</p>
<h2 style="color:#1F6F78;{S}">Once a week</h2>
<p style="{S}">Open the Dashboard. Red means a free trial is about to charge. Orange means you have not used something for a month.
Mark a subscription <b>Cancel</b> to see what you save per year, then cancel it with the company itself.</p>
<p style="{S};color:#5E6E72;font-size:9px">Made with the help of AI tools. This file does not cancel anything for you.</p>
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
