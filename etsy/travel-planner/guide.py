"""One-page buyer guide (PDF) for the Travel Planner."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Travel Planner</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes five minutes. Then you add your bookings and
plans as the trip takes shape.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Travel-Planner.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. The Google Sheets app then
keeps your codes, times and plans on your phone during the trip, and you can share it with the people you travel
with.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Setup:</b> the name of the trip, how many travel, the first and last day, your home currency, and what the
other currencies are worth in it. Each kind of booking counts in one budget category, which you can change.</li>
<li><b>Dashboard:</b> your budget for flights, lodging, transport, food, activities, shopping and other.</li>
<li>The example trip to Tokyo is made up. Select the yellow cells and press Delete, rather than deleting whole rows.</li>
</ol>
<h2 style="color:#1F6F78;{S}">As you plan</h2>
<ul style="{S}">
<li><b>Bookings:</b> each flight, hotel, train, tour or table, with its dates, time, confirmation code, cost, currency
and what you have paid. The cost counts in the budget straight away, and what is still to pay is shown.</li>
<li><b>Itinerary:</b> what you plan to do each day, with the time, the place and the booking it needs. The lines can be
in any order.</li>
<li><b>Expenses:</b> everything you pay that is not a booking, in any currency.</li>
<li><b>Packing list:</b> type x as things go in the bag, and add your own items at the end.</li>
</ul>
<p style="{S}">The Dashboard counts down the days, shows the budget with what is booked, spent and left, the next
bookings and the next plans of the itinerary, and how much is packed.</p>
<p style="{S};color:#5E6E72;font-size:9px">Exchange rates are the ones you type. Made with the help of AI tools.</p>
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
