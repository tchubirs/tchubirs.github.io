"""One-page buyer guide (PDF) for the Software and Tools Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Software and Tools Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about twenty minutes, most of it finding the
renewal dates. After that it keeps itself up to date: the next charge moves on after each renewal.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Software-Tools-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. Share it with whoever
looks after the tools.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> the currency, how many days before a yearly charge you want a warning, and the categories.</li>
<li><b>Cards:</b> each card or account the tools are paid with, and the last day of the month it expires. Only a name
you recognise, such as Business card A: never the card number.</li>
<li><b>Team:</b> everyone who uses the tools. The example business is made up, so delete it first.</li>
<li><b>Tools:</b> each tool with its billing, price and card, and the date of a renewal. Any past renewal date works:
the next charge is worked out from it. For a plan paid per seat, an x under Per seat and the number of seats.</li>
<li><b>Access:</b> one line per person and tool. The seats used come from here.</li>
</ol>
<h2 style="color:#1F6F78;{S}">As you go</h2>
<ul style="{S}">
<li><b>A new tool or a new person:</b> add a line on Tools or Team, and the lines on Access.</li>
<li><b>Someone leaves:</b> type the day on Team. The Dashboard lists each tool to remove them from. Once done, type
the day under Removed on, and the seat stops counting.</li>
<li><b>Cancelling:</b> type the day it ends under Cancelled on. It stays on the list, marked Cancelled.</li>
<li><b>Notice:</b> if a plan must be cancelled some days before it renews, type the days. The status then gives
the last day to cancel.</li>
<li><b>A new card:</b> add it on Cards and pick it for each tool. A card that runs out before a charge is flagged.</li>
</ul>
<p style="{S};color:#5E6E72;font-size:9px">Keep passwords out of this file: a password manager is the place for them.
Room for 100 tools, 100 people, 400 access lines and 20 cards. Made with the help of AI tools.</p>
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
