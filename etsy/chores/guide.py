"""One-page buyer guide (PDF) for the Chores and Allowance Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Chores and Allowance Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about ten minutes. After that, a tick for each
chore done and a line on pay day keep it up to date.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Chores-Allowance-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. With the Google Sheets
app you can tick the chores from your phone.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Kids:</b> each child with a base amount a week, so much a point, and the shares to save and to give. The rest
goes to Spend. Add a goal and its price if they are saving for something.</li>
<li><b>Chores:</b> each chore for each child, its points, and an x on the days it is expected.</li>
<li>Delete the example family on Kids, Chores, This week and Money: they are made up.</li>
</ol>
<h2 style="color:#1F6F78;{S}">Each week</h2>
<ul style="{S}">
<li><b>This week:</b> an x in the box when a chore is done. The shaded boxes are the days it is expected.</li>
<li><b>Fridge chart:</b> pick a child in the yellow box and print. Print one for each child. It shows the days to do each
chore and the ticks made so far.</li>
<li><b>Pay day:</b> the Dashboard shows what each child earned: the base amount plus the points times the rate. Add it
on Money as Pocket money, jar Split.</li>
<li><b>A new week:</b> clear the boxes on This week. The money stays on Money. To see or print another week, type any
day of it on Settings.</li>
</ul>
<h2 style="color:#1F6F78;{S}">The jars</h2>
<ul style="{S}">
<li><b>Split</b> shares the amount by the child's own shares, for example 40% to Save, 10% to Give and 50% to
Spend.</li>
<li>Name one jar when the whole amount goes there: a birthday gift to Save, or a treat bought from Spend.</li>
<li><b>Weeks to go</b> is how long until the goal at the rate the child saved over the last four weeks.</li>
<li>A jar below zero shows in red, and so do shares that add up to more than 100%.</li>
</ul>
<p style="{S}">Room for 6 children, 40 chores and 500 money lines.</p>
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
