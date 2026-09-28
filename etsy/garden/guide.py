"""One-page buyer guide (PDF) for the Vegetable Garden Planner."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Vegetable Garden Planner</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about twenty minutes. After that, a line each
time you plant, pick or water keeps it all up to date.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Vegetable-Garden-Planner.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. With the Google
Sheets app you can add a pick or a watering from the garden.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> the garden's name, and after how many days a bed needs water again.</li>
<li>Delete the example beds, crops, plantings, picks, jobs and costs: they are made up. Select their yellow cells
and press Delete, rather than deleting whole rows.</li>
<li><b>Beds:</b> each bed, group of pots or greenhouse once.</li>
<li><b>Crops:</b> each crop once, with its unit, the shop price you would pay for it, the days to harvest from the
seed packet, and the months you plan to sow, plant out and harvest it. The Calendar tab is made from these months.</li>
</ol>
<h2 style="color:#1F6F78;{S}">As you go</h2>
<ul style="{S}">
<li><b>Plantings:</b> each time you sow or plant something, with the bed. A date under Cleared once it comes out.</li>
<li><b>Harvest:</b> each pick with its amount. It is valued at the crop's shop price.</li>
<li><b>Jobs:</b> watering and the other jobs. All beds, or no bed, means the whole garden.</li>
<li><b>Costs:</b> seeds, plants, compost, tools and water.</li>
</ul>
<h2 style="color:#1F6F78;{S}">Good to know</h2>
<ul style="{S}">
<li>The months and the days to harvest are yours to type. They depend on where you live and on the weather, so
use your seed packets and local advice. The sheet does not work out planting dates.</li>
<li>A planting shows a note when its bed had a crop of the same family last year.</li>
<li>The Check columns flag a line that needs a look, such as a crop or a bed that is not on its list yet.</li>
<li>Room for 60 crops, 30 beds, 500 plantings, 1,500 picks and 2,000 jobs. The calendar shows the first 40
crops.</li>
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
