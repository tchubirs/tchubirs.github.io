"""One-page buyer guide (PDF) for the Pet Care Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Pet Care Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about fifteen minutes, and then it tells you
what is due, when the food runs out and what your pets cost.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Pet-Care-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. Share it with whoever helps
look after your pets, and with the Google Sheets app you have the vet details on your phone.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Pets:</b> the example pets are made up, so delete them and add yours, with the birthday, chip, insurance and
vet. Select the yellow cells and press Delete, rather than deleting whole rows.</li>
<li><b>Health:</b> each vaccine or treatment, how many months apart, and the date it was last done. Your vet can tell
you how often.</li>
<li><b>Food:</b> each bag in use, its size, how much a day in the same unit, the day you opened it and the price.</li>
<li><b>Dashboard:</b> how many days ahead you want reminders, and how many days before the food runs out you want to
buy more.</li>
</ol>
<h2 style="color:#1F6F78;{S}">As you go</h2>
<ul style="{S}">
<li><b>Health:</b> when a vaccine or treatment is done, change Last done to that day.</li>
<li><b>Vet visits:</b> a line for each visit, booked or past, with the cost once you have paid.</li>
<li><b>Weight:</b> a line each time you weigh a pet. The Pets tab shows the latest weight and the change.</li>
<li><b>Food:</b> when you open a new bag, change Opened on to that day.</li>
<li><b>Spending:</b> everything else you buy for them. Use All for things they share.</li>
</ul>
<p style="{S};color:#5E6E72;font-size:9px">It does not give veterinary advice: ask your vet. Made with the help of AI
tools.</p>
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
