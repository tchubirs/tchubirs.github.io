"""One-page buyer guide (PDF) for the Weekly Meal Planner."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Weekly Meal Planner and Grocery List</h1>
<p style="{S};color:#5E6E72">Thanks for your order. The first setup takes about twenty minutes, most of it typing in your
usual recipes. After that, planning a week takes five.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Weekly-Meal-Planner.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. The Google Sheets app on
your phone then shows the grocery list in the store.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Pantry:</b> the foods you buy. For each one, the unit you cook with (each, cup, oz, g, tbsp), the store
section, the pack you buy (a dozen, a 1 lb box), how many units are in that pack, and its price.</li>
<li><b>Recipes:</b> one line per recipe, with how many people it serves.</li>
<li><b>Ingredients:</b> one line per ingredient of each recipe, in the unit you gave it on the Pantry tab.</li>
<li><b>Settings:</b> the store sections in the order you walk through your store.</li>
</ol>
<p style="{S}">You only type in the <span style="background-color:#FFF4C2">yellow cells</span>. The example recipes,
pantry and plan show how it works. Replace them with your own.</p>
<h2 style="color:#1F6F78;{S}">Each week</h2>
<ol style="{S}">
<li><b>Week plan:</b> type the first day, the number of people eating each day, and pick a recipe for each meal.
Anything else you type, like <i>Eating out</i>, adds nothing to the list.</li>
<li><b>Pantry:</b> before you shop, fill in what you already have at home. Use <i>Extra packs</i> for things you buy
anyway, like coffee or dish soap.</li>
<li><b>Grocery list:</b> it lists only what the week needs, minus what you have, rounded up to whole packs, in store
order, with the cost. Type x under <i>Got it</i> as you shop.</li>
</ol>
<p style="{S}">Cooking once and eating it twice? Put the recipe on both days and the list buys enough for both.
The checks on the Week plan tell you when an ingredient is missing from the Pantry or an item has no price.</p>
<p style="{S};color:#5E6E72;font-size:9px">Works with any currency and any unit. Made with the help of AI tools.</p>
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
