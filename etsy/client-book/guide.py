"""One-page buyer guide (PDF) for the Client and Appointment Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Client and Appointment Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about fifteen minutes, plus the time to type in
the clients you want to keep. After that you add one line per booking.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Client-Appointment-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. The Google Sheets
app then shows your week and your clients on your phone.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Services:</b> each service with its price and how many minutes it takes. On the right, choose whether a no-show
uses a package session, and after how many days a client who has not been back should show up in Follow up.</li>
<li><b>Clients:</b> one line per client, with the phone, email, birthday and notes you want to keep.</li>
</ol>
<p style="{S}">You only type in the <span style="background-color:#FFF4C2">yellow cells</span>. Delete the example
clients, appointments and packages before you start.</p>
<h2 style="color:#1F6F78;{S}">Every day</h2>
<ol style="{S}">
<li><b>Appointments:</b> one line per booking, with the date, time, client and service. The status starts as Booked.
After the visit, set it to Done and type what was paid and how. A discount lowers the price.</li>
<li><b>Packages:</b> when a client prepays several sessions, add one line. Their visits are then paid with
<i>Package</i> and the sessions left go down by one each time.</li>
<li><b>Dashboard and Week:</b> what is coming up, what you earned this month and this year, who owes you money, whose
package is almost used, who has not been back, and whose birthday is this month.</li>
</ol>
<p style="{S}">A booking whose date has passed but is still Booked turns orange, so you remember to update it. The Week
tab shows the current week until you type another date.</p>
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
