"""One-page buyer guide (PDF) for the Inventory & Sales Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Inventory &amp; Sales Tracker</h1>
<p style="{S};color:#5E6E72">Thank you! Ten minutes to set it up, then one line each time stock changes.</p>
<h2 style="color:#1F6F78;{S}">Open it</h2>
<p style="{S}"><b>Google Sheets:</b> drive.google.com → <i>New › File upload</i> → <b>Inventory-Sales-Tracker.xlsx</b> →
open it → <i>File › Save as Google Sheets</i>. <b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Set it up</h2>
<ol style="{S}">
<li><b>Products:</b> one line per product: a short SKU code, name, category, unit cost, price, stock today, and the level at which you want to reorder.</li>
<li><b>Stock Moves:</b> from now on, one line each time stock changes: <i>Purchase</i> (you bought or made stock), <i>Sale</i>, <i>Return</i>, or <i>Adjustment</i> (negative number for broken, lost or gifted items).</li>
</ol>
<h2 style="color:#1F6F78;{S}">Every week</h2>
<p style="{S}">Open the Dashboard: <b>To reorder now</b> counts products at or below their reorder level; the Products tab shows which ones in orange (red when sold out).
Pick a month to see its sales, units and gross profit.</p>
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
