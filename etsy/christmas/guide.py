"""One-page buyer guide (PDF) for the Christmas Planner."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Christmas Planner</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about fifteen minutes. After that, a line for
each gift, cost and plan keeps it up to date until Christmas.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Christmas-Planner.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. With the Google Sheets app
you can tick off gifts in the shop.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> the year of the Christmas you are planning, and your currency.</li>
<li><b>People:</b> the example family is made up, so delete it and add everyone you buy for, with a budget each.</li>
<li><b>Budget:</b> a budget for food, decorations, travel and the rest. The gifts add up the people's budgets.</li>
</ol>
<h2 style="color:#1F6F78;{S}">As you go</h2>
<ul style="{S}">
<li><b>Gifts:</b> one line per gift with its price. When you buy it, an x under Bought and what you paid. For an order,
the day it should arrive, then an x under Here when it comes. An order turns Late when that day has passed.</li>
<li><b>Costs:</b> what you plan to spend on each thing, and what you paid once you pay.</li>
<li><b>Cards:</b> who gets one, and an x when it is posted.</li>
<li><b>Dinner:</b> the day and the time you sit down, then each dish with its minutes to prepare, cook and rest. The
plan on the right says when to start each one. Ready by is for a dish you want at another time, or made the day
before (type the date and the time).</li>
<li><b>Plans:</b> parties, school events and travel. The December tab puts them on a calendar you can print.</li>
</ul>
<h2 style="color:#1F6F78;{S}">Good to know</h2>
<ul style="{S}">
<li>Left takes off what is still to pay as well as what is spent, so it is what you really have left.</li>
<li>Next year, change the year in Settings and clear the lines you typed.</li>
<li>Room for 60 people, 300 gifts, 300 costs, 300 cards, 150 plans and 20 dishes.</li>
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
