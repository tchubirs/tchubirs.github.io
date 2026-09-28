"""One-page buyer guide (PDF) for the Donation and Volunteer Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Donation and Volunteer Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about ten minutes. After that, a line for
each gift and each time someone helps keeps everything up to date.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Donation-Volunteer-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> your organisation's name and address, the line at the end of each statement (add your charity
number or anything your rules ask for), the currency, and after how many months without a gift a donor counts as
lapsed.</li>
<li>Delete the example gifts, donors, campaigns, volunteers and hours: they are made up.</li>
<li><b>Donors</b> and <b>Campaigns:</b> each donor once, and what you raise money for, with a goal and dates if it
has them.</li>
</ol>
<h2 style="color:#1F6F78;{S}">As you go</h2>
<ul style="{S}">
<li><b>Gifts:</b> one line per gift with the date, the donor and the campaign. For goods, leave the amount empty and
say what was given. Until there is an x under Thanked, the gift waits on the Dashboard's To thank list.</li>
<li><b>Hours:</b> one line each time a volunteer helps, with the hours as a number: 2.5 for two and a half.</li>
<li><b>Statement:</b> pick a donor and a year, then print the tab or save it as a PDF. It lists up to 24 gifts,
and the total counts them all.</li>
<li><b>Dashboard:</b> the year's giving, the campaigns against their goals, the thank-you notes still to send, the
top donors and each month's gifts and hours. Type another year in Settings to look back.</li>
</ul>
<h2 style="color:#1F6F78;{S}">Good to know</h2>
<ul style="{S}">
<li>The Check column flags a line that needs a look: no date, an amount or hours that are not a number, or a
name that is not on Donors or Volunteers yet.</li>
<li>A donor is New in the year of their first gift, and Lapsed once their last gift is older than the months set in
Settings.</li>
<li>The statement lists the gifts you received. Whether a gift can be claimed on taxes, and what a receipt has to
say, depends on the rules where you are.</li>
<li>Room for 1,000 gifts, 300 donors, 20 campaigns, 100 volunteers and 1,000 lines of hours. The Dashboard shows the
first six campaigns on the list.</li>
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
