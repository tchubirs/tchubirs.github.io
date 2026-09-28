"""One-page buyer guide (PDF) for the Roommate Bill Splitter."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Roommate Bill Splitter</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about ten minutes. After that, whoever pays a
bill adds one line.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Roommate-Bill-Splitter.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. Share it with your
housemates and everyone can add what they pay from their phone.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Housemates:</b> everyone's name. For someone who moved in or out part of the way through, type the date.
Bills after they leave are no longer split with them.</li>
<li><b>Bills:</b> each bill once, with its category, the usual amount, how often it comes, the first date it is due
and who usually pays it. For the split, leave it empty to share it equally, put an x under the people who share it,
or type numbers, like the size of each room.</li>
<li><b>Chores:</b> the jobs in the house. The rota shares them out and moves one step every Monday.</li>
<li><b>Payments:</b> the example house and its people are made up. Delete their lines and start with yours. Select the yellow cells and press Delete, rather than deleting whole rows.</li>
</ol>
<h2 style="color:#1F6F78;{S}">Every month</h2>
<ul style="{S}">
<li><b>Payments:</b> the date, the bill, the amount and who paid. Leave the shares empty and the bill's split is
used. For a one-off, put an x under the people who share it.</li>
<li><b>Paying each other back:</b> add a line with <i>Paying back</i> as the bill, paid by the one who pays, with an x
under the one who gets the money.</li>
<li><b>Dashboard:</b> pick a month to see what everyone paid and their share, each balance, the fewest payments that
settle everyone up, and the bills of the month: paid, due soon or late.</li>
<li><b>Year:</b> every month by category, and what each housemate paid and shared.</li>
</ul>
<p style="{S};color:#5E6E72;font-size:9px">A bill counts as paid when a payment for it is dated in the month it is due.
Amounts that do not split evenly can leave a cent over after settling up. The file does not send or take payments.
Made with the help of AI tools.</p>
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
