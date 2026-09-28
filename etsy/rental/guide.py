"""One-page buyer guide (PDF) for the Vacation Rental Host Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Vacation Rental Host Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about ten minutes. After that you add one line per booking and one per expense.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Vacation-Rental-Host-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> type the names of your properties, up to six. Change the expense categories if you want.</li>
<li><b>Bookings:</b> one line per stay. Type the check-in and check-out dates, what the guest paid for the nights,
the cleaning fee and the fee the platform kept. Nights, payout and status are calculated.</li>
<li>When a payout reaches your account, choose <i>Yes</i> under <i>Paid out?</i>.</li>
<li><b>Expenses:</b> one line per cost, with the property it belongs to. Choose <i>Shared</i> for costs such as one
insurance for several homes.</li>
</ol>
<p style="{S}">You only type in the <span style="background-color:#FFF4C2">yellow cells</span>. Delete the example lines before you start. Select the yellow cells and press Delete, rather than deleting whole rows.</p>
<h2 style="color:#1F6F78;{S}">Reading the dashboard</h2>
<p style="{S}">Pick the year and a property, or All properties. The monthly table shows nights, occupancy, revenue,
expenses and profit. A stay that crosses a month end is split by nights. Occupancy to date counts the months up to today.
On the right you see check-ins in the next 7 days, payouts not received yet and the next check-outs, with a note
when a new guest arrives the same day.</p>
<p style="{S};color:#5E6E72;font-size:9px">Revenue in this file is your payout: what the guest paid plus the cleaning fee,
minus the platform fee. Works with any currency and bookings from any platform. Made with the help of AI tools.</p>
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
