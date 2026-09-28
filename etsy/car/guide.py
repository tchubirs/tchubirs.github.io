"""One-page buyer guide (PDF) for the Car Maintenance Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Car Maintenance Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about fifteen minutes. After that, a line for
each fill-up and each cost keeps everything up to date.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Car-Maintenance-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. With the Google Sheets
app you can add a fill-up at the pump.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> km or miles, litres or gallons, and how early you want a warning.</li>
<li><b>Cars:</b> the example cars are made up, so delete them and add yours, up to five, with the odometer on the day
you start and that date. Select the yellow cells and press Delete, rather than deleting whole rows.</li>
<li><b>Services:</b> what each car needs, every so far or every so many months, and the odometer and date it was last
done. The handbook or your garage has the intervals.</li>
<li><b>Documents:</b> insurance, tax, inspection and the rest, with the day each one ends.</li>
</ol>
<h2 style="color:#1F6F78;{S}">As you drive</h2>
<ul style="{S}">
<li><b>Fuel:</b> one line per fill-up with the odometer, the amount and what you paid. Put an x under Full when you
fill the tank. The consumption is worked out from one full tank to the next.</li>
<li><b>Costs:</b> every other cost. The odometer is optional.</li>
<li><b>Services:</b> when a service is done, change its last odometer and date.</li>
<li><b>Dashboard:</b> each car's odometer, consumption and cost, what is due, and the year month by month.</li>
</ul>
<p style="{S};color:#5E6E72;font-size:9px">The day a service is due by distance is an estimate from how far the car has
gone each day since the start. Made with the help of AI tools.</p>
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
