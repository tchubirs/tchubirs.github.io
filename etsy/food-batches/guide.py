"""One-page buyer guide (PDF) for the Food Batch Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Food Batch Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. The first setup takes about half an hour, most of it typing your
recipes. After that, it is one line for each batch.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> at drive.google.com, click <i>New &gt; File upload</i>, pick
<b>Food-Batch-Tracker.xlsx</b>, open it and choose <i>File &gt; Save as Google Sheets</i>.
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> your business name and address, Best before or Use by, the last line of each label, and the
allergen names used where you sell.</li>
<li><b>Ingredients:</b> unit, pack size, pack price, and an x under each allergen. Packaging gets an x under Not on
label.</li>
<li><b>Products:</b> how many items one batch makes, how many days it keeps, and the price.</li>
<li><b>Recipes:</b> what goes into one batch. Grams where you can, so the label lists the ingredients in order.</li>
<li>Delete the example bakery on every tab: it is made up.</li>
</ol>
<h2 style="color:#1F6F78;{S}">Each time you bake or cook</h2>
<ul style="{S}">
<li><b>Batches:</b> the day and how many you made; the code and the date fill in. Later, what was sold, given away
and thrown out.</li>
<li><b>Label:</b> pick the batch in the yellow box and print six labels to a page.</li>
<li><b>Purchases:</b> what you buy, with the lot number and the date on the pack; an x once it is finished.</li>
</ul>
<h2 style="color:#1F6F78;{S}">Good to know</h2>
<ul style="{S}">
<li><b>The labels only put together what you type.</b> Check them against the food rules where you sell.</li>
<li>A label shows a warning in place of the list when there are more than 20 ingredients or the list is too long.</li>
<li>Not on Ingredients in red on Recipes: that ingredient's cost and allergens are left out until you add it.</li>
<li>Room for 40 products, 100 ingredients, 400 recipe lines, 500 batches and 400 purchases.</li>
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
