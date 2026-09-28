"""One-page buyer guide (PDF) for the Plant Care Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Plant Care Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about ten minutes. After that, you add one line
each time you water or feed a plant, and it tells you what is next.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Plant-Care-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. With the Google Sheets app
you can log a watering from your phone, next to the plant.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> the months your plants grow. North of the equator that is often March to September. South of
it, pick September to March.</li>
<li><b>Plants:</b> the example plants are made up, so delete them and add yours. For each one: its spot, its light,
the days between waterings in the growing season and in the resting months, how often to feed it and every how
many months to repot it, with the date it was last potted if you know it.</li>
<li><b>Care log:</b> delete the example lines, then add the last time you watered each plant.</li>
</ol>
<h2 style="color:#1F6F78;{S}">Every day or two</h2>
<ul style="{S}">
<li><b>Today:</b> the plants to water now, the late ones first, then the rest of the week; the feeds due this week
and the repots coming up.</li>
<li><b>Care log:</b> one line each time you water, feed, mist, repot or prune. The newest watering of a plant sets
its next one, and the same for feeding and repotting.</li>
<li><b>This week:</b> seven days ahead in a grid, for every plant.</li>
</ul>
<p style="{S}">In the resting months the plants get the longer gap between waterings, and feeding stops. Leave the
resting gap empty to keep the same one all year.</p>
<p style="{S};color:#5E6E72;font-size:9px">The days between waterings are a starting point. Check the soil, and change
them to suit your home. Made with the help of AI tools.</p>
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
