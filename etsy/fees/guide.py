"""One-page buyer guide (PDF) for the Fee and Profit Calculator."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Fee and Profit Calculator</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about five minutes.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Seller-Fee-Profit-Calculator.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> pick your country. Its fee rates are filled in. Etsy changes its fees from time to time,
so compare them with etsy.com/legal/fees and change any number that is different.</li>
<li><b>Settings:</b> set your hourly rate, for the time each item takes, and the profit margin you aim for.</li>
</ol>
<h2 style="color:#1F6F78;{S}">Using it</h2>
<p style="{S}"><b>Calculator:</b> type one sale: the item price, the shipping you charge, a discount if there is one,
your material, packaging and label costs, and the minutes of work. You see every fee, your profit and margin,
and the item price that would reach your target margin.</p>
<p style="{S}"><b>Products:</b> one line per product. <i>Share from Offsite Ads</i> is the part of your orders that
come from Etsy's ads on other websites; leave it empty if you do not know. The status shows which products are on
target, below target or losing money, and the last column suggests a price. The example products are made up.
Select the yellow cells and press Delete, rather than deleting whole rows.</p>
<p style="{S};color:#5E6E72;font-size:9px">This file is not made or endorsed by Etsy. Made with the help of AI tools.</p>
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
