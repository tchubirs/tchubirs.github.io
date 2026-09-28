"""One-page buyer guide (PDF) for the Handmade Order Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Handmade Order Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about twenty minutes, most of it typing in your
materials and products. After that you add one line per order.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Handmade-Order-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> where you sell (a marketplace, your website, markets, friends) and what each one takes from an
order: a share of the total and a fixed amount. The example fees are rough, so check your own.</li>
<li><b>Materials:</b> what you buy, with the size and price of the pack, and how much you have in stock.</li>
<li><b>Products:</b> what you sell and its price. <b>Product materials:</b> one line per material in each product,
with how much one item uses. The cost of each product then fills in by itself.</li>
</ol>
<p style="{S}">You only type in the <span style="background-color:#FFF4C2">yellow cells</span>. Delete the example
orders and customers before you start.</p>
<h2 style="color:#1F6F78;{S}">Each order</h2>
<p style="{S}">One line on the Orders tab: the order date, the customer, the product and quantity, any extras such as
a custom label or rush fee, the shipping you charged, what was paid so far, the due date, the status and where it came
from. Add the postage you paid once you send it. An order is open until its status is Sent, Picked up or Cancelled.</p>
<h2 style="color:#1F6F78;{S}">Reading it</h2>
<p style="{S}">Each order shows its total, the balance still to collect, the cost of its materials, the fees and the
profit. The Dashboard lists the open orders with the soonest due first, what you are owed, sales and profit by month and
by channel. Materials shows what the open orders need against your stock. Due dates shows a month on a calendar.</p>
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
