"""One-page buyer guide (PDF) for the Inventory & Sales Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Inventory &amp; Sales Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about ten minutes. After that you add one line each time your stock changes.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick <b>Inventory-Sales-Tracker.xlsx</b>.
Open it, then choose <i>File &gt; Save as Google Sheets</i>.<br/><b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Products:</b> one line per product. Give it a short code (SKU), then the name, a category, what one unit costs you, your price, how many you have today, and the stock level at which you want to reorder.</li>
<li><b>Stock Moves:</b> from now on, one line each time stock changes. <i>Purchase</i> is stock you bought or made, <i>Sale</i> is an order, <i>Return</i> is an item sent back, and <i>Adjustment</i> is for broken, lost or gifted items (type a negative number).</li>
</ol>
<h2 style="color:#1F6F78;{S}">Once a week</h2>
<p style="{S}">Open the Dashboard. <b>To reorder now</b> counts the products at or below their reorder level. On the Products tab they show in orange, or in red when sold out.
Pick a month to see its sales, units and gross profit.</p>
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
